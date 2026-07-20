import * as fs from "fs"
import * as path from "path"

import { DEFAULT_PROVIDER_FORM_VALUES, FimProvider } from "../src/common/deepseek"
import { PrefixSuffix } from "../src/common/types"
import { CompletionFormatter } from "../src/extension/completion-formatter"
import { getFimSplitPrompt } from "../src/extension/fim-templates"
import { llm } from "../src/extension/llm"
import { truncateCompletion } from "../src/extension/postprocessor"
import { getNodeAtPosition, getParser } from "../src/extension/parser"
import { getFimDataFromProvider, getPrefixSuffix } from "../src/extension/utils"
import { createFakeDocument, createFakeEditor, Position } from "./stub/vscode"

import { ContextAdapter, ContextIR, IntentAdapter, IntentResult } from "./adapters/types"
import { EvalConfig } from "./config"
import { Sample } from "./datasets/types"

export interface ChainArtifacts {
  prefixSuffix: PrefixSuffix
  context: ContextIR
  intent: IntentResult
  prompt: { prompt: string; suffix: string; stopWords: string[] }
  model: { rawCompletion: string; latencyMs: number; error?: string }
  completion: { text: string; truncated: boolean }
}

export interface ChainResult {
  sampleId: string
  matrixLabel: string
  artifacts: ChainArtifacts
}

function makeProvider(config: EvalConfig): FimProvider {
  return {
    ...DEFAULT_PROVIDER_FORM_VALUES,
    modelName: config.deepseek.model,
    apiKey: config.deepseek.apiKey
  }
}

export async function runChain(
  sample: Sample,
  matrix: { label: string; contextAdapter: ContextAdapter; intentAdapter: IntentAdapter },
  config: EvalConfig
): Promise<ChainResult> {
  const provider = makeProvider(config)
  const fileContent = fs.readFileSync(sample.filePath, "utf-8")
  const lines = fileContent.split("\n")
  const cursorLine = Math.min(sample.cursor.line, lines.length - 1)
  const cursor = new Position(cursorLine, sample.cursor.character)
  const document = createFakeDocument(fileContent, sample.filePath, sample.languageId)
  const workspaceRoot = sample.workspaceRoot || path.dirname(sample.filePath)

  // A. prefix/suffix
  const prefixSuffix = getPrefixSuffix(config.contextLength, document as any, cursor as any)

  // B. context
  const context = await matrix.contextAdapter.collect({
    filePath: sample.filePath,
    languageId: sample.languageId,
    workspaceRoot,
    prefixSuffix,
    cursor: { line: cursorLine, character: sample.cursor.character }
  })

  // C. intent
  const intent = await matrix.intentAdapter.detect({
    languageId: sample.languageId,
    prefixSuffix,
    cursor: { line: cursorLine, character: sample.cursor.character },
    context
  })

  // D. prompt (split-only: DeepSeek FIM adds tokens server-side from prompt + suffix)
  const intentContext = intent.intent === "unknown"
    ? ""
    : [
        "Completion intent:",
        `- ${intent.intent}`,
        ...intent.constraints.map((constraint) => `- ${constraint}`),
        ...intent.requestedSymbols.map((symbol) => `- Use existing symbol: ${symbol}`)
      ].join("\n")
  const { prompt, suffix } = getFimSplitPrompt({
    context: [context.chunks.map((c) => c.text).join("\n"), intentContext]
      .filter(Boolean)
      .join("\n\n"),
    prefixSuffix,
    header: "",
    fileContextEnabled: context.chunks.length > 0,
    language: sample.languageId
  })
  const stopWords = ["<｜fim▁begin｜>", "<｜fim▁hole｜>", "<｜fim▁end｜>", "<END>", "<｜end of sentence｜>"]

  // E. model — onData only accumulates; truncate once after stream (Step 2 simplified)
  const startTime = Date.now()
  let rawCompletion = ""
  let modelError: string | undefined
  let nodeAtPosition: any = null
  let parser: any

  try {
    parser = await getParser(sample.filePath)
    if (parser) {
      const tree = parser.parse(fileContent)
      nodeAtPosition = getNodeAtPosition(tree, cursor as any)
    }
  } catch {
    // AST parse failure non-fatal
  }

  await new Promise<void>((resolve) => {
    llm({
      body: {
        max_tokens: 512,
        model: provider.modelName,
        prompt,
        suffix,
        stream: true,
        temperature: 0.2
      },
      options: {
        hostname: provider.apiHostname || "",
        port: provider.apiPort ? Number(provider.apiPort) : undefined,
        path: provider.apiPath || "",
        protocol: provider.apiProtocol || "",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: provider.apiKey ? `Bearer ${provider.apiKey}` : ""
        }
      },
      onStart: () => {},
      onError: (err: Error) => {
        modelError = err.message
        resolve()
      },
      onData: (data: any) => {
        const chunk = getFimDataFromProvider(provider.provider, data)
        if (chunk !== undefined) rawCompletion += chunk
      },
      onEnd: () => resolve()
    } as any).catch(() => resolve())
  })

  const latencyMs = Date.now() - startTime

  // F. postprocess — truncate once (Scheme A signature), then format
  let finalText = rawCompletion
  let truncated = false
  if (rawCompletion) {
    const truncatedResult = truncateCompletion({
      completion: rawCompletion,
      providerFimData: rawCompletion,
      chunkCount: 1,
      providerModelName: provider.modelName,
      providerFimTemplate: provider.fimTemplate || "automatic",
      nodeAtPosition,
      parser,
      position: cursor as any,
      prefixSuffix,
      isMultilineCompletion: false,
      multilineCompletionsEnabled: true,
      maxLines: 40
    })
    if (truncatedResult) {
      finalText = truncatedResult
      truncated = true
    }
  }
  try {
    const editor = createFakeEditor(document, cursor)
    const formatter = new CompletionFormatter(editor as any)
    finalText = formatter.format(finalText) as string
  } catch {
    // format failure: use truncated text
  }

  return {
    sampleId: sample.id,
    matrixLabel: matrix.label,
    artifacts: {
      prefixSuffix,
      context,
      intent,
      prompt: { prompt, suffix, stopWords },
      model: { rawCompletion, latencyMs, error: modelError },
      completion: { text: finalText, truncated }
    }
  }
}
