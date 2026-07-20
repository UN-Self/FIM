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

import { CodeGraphEvalProvider } from "./adapters/context/codegraph"
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
  /** Phase 6: context assembly result (only when using Engine chain). */
  assembly?: import("../services/engine-ts/src/context/graph-assembler").AssemblyResult
  /** Phase 6: raw intent plan from Engine planner. */
  intentPlan?: import("@fim/protocol").IntentPlan
  /** Phase 6: plan validation output. */
  planValidation?: { valid: boolean; errors: string[]; warnings: string[] }
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

// ---------------------------------------------------------------------------
// ChainV2 — Engine contract-based path (Phase 6)
//
// Uses @fim/engine-ts components instead of importing src/extension/*.
// Activated via config.useEngineChain.  Preserves the same ChainArtifacts
// shape so probes and the runner work with either chain.
// ---------------------------------------------------------------------------

import { DeepSeekFimClient, DeepSeekFimRequestBody } from "../services/engine-ts/src/model/deepseek-fim"
import { buildFimPrompt, FimPrompt } from "../services/engine-ts/src/prompt/builder"
import { postprocess, PostprocessInput } from "../services/engine-ts/src/postprocess/processor"
import { detectIntentLlm, PlannerLlmConfig } from "../services/engine-ts/src/planning/intent-planner"
import { validatePlan } from "../services/engine-ts/src/planning/plan-validator"
import { ContextAssembler, GraphSeedInput, AssemblyResult } from "../services/engine-ts/src/context/graph-assembler"
import { extractPrefixSuffix } from "../services/engine-ts/src/context/current-file"

import type {
  DeepSeekProviderConfig,
  StreamEvent,
  IntentPlan,
  GraphEvidence,
  ContextChunk
} from "@fim/protocol"

const STOP_WORDS = [
  "<｜fim▁begin｜>", "<｜fim▁hole｜>", "<｜fim▁end｜>",
  "<END>", "<｜end of sentence｜>"
]

function toEngineProviderConfig(fp: FimProvider): DeepSeekProviderConfig {
  return {
    apiHostname: fp.apiHostname || "",
    apiKey: fp.apiKey || "",
    apiPath: fp.apiPath || "",
    apiPort: fp.apiPort ? Number(fp.apiPort) : undefined,
    apiProtocol: fp.apiProtocol || "https",
    modelName: fp.modelName,
    fimTemplate: fp.fimTemplate || "automatic"
  }
}

export async function runChainV2(
  sample: Sample,
  matrix: { label: string; contextAdapter: ContextAdapter; intentAdapter: IntentAdapter },
  config: EvalConfig
): Promise<ChainResult> {
  const provider = makeProvider(config)
  const engineProvider = toEngineProviderConfig(provider)
  const fileContent = fs.readFileSync(sample.filePath, "utf-8")
  const lines = fileContent.split("\n")
  const cursorLine = Math.min(sample.cursor.line, lines.length - 1)
  const workspaceRoot = sample.workspaceRoot || path.dirname(sample.filePath)
  const languageId = sample.languageId

  const prefixSuffix = extractPrefixSuffix(
    fileContent,
    { line: cursorLine, character: sample.cursor.character },
    config.contextLength
  )

  // --- context assembly ---
  let assembly: AssemblyResult | undefined
  let contextIR: ContextIR

  if (matrix.label.includes("codegraph")) {
    const graphProvider = new CodeGraphEvalProvider(
      workspaceRoot,
      config.codegraph.maxNodes
    )
    const assembler = new ContextAssembler(graphProvider)
    try {
      await graphProvider.warm()
      const seedInput: GraphSeedInput = {
        filePath: sample.filePath, languageId,
        prefix: prefixSuffix.prefix, suffix: prefixSuffix.suffix,
        cursorLine, cursorCharacter: sample.cursor.character
      }
      assembly = await assembler.assemble(
        seedInput,
        { maxEdges: 50, maxSymbols: config.codegraph.maxNodes },
        { maxTokens: Math.floor(512 * 0.3) }
      )
    } catch { assembly = undefined }

    contextIR = await matrix.contextAdapter.collect({
      filePath: sample.filePath, languageId, workspaceRoot, prefixSuffix,
      cursor: { line: cursorLine, character: sample.cursor.character }
    })
  } else {
    contextIR = await matrix.contextAdapter.collect({
      filePath: sample.filePath, languageId, workspaceRoot, prefixSuffix,
      cursor: { line: cursorLine, character: sample.cursor.character }
    })
  }

  // --- intent planning ---
  let intentPlan: IntentPlan | undefined
  let planValidation: { valid: boolean; errors: string[]; warnings: string[] } | undefined
  let intentResult: IntentResult

  if (matrix.label.includes("planner")) {
    const plannerConfig: PlannerLlmConfig = {
      apiKey: config.planner.apiKey, baseUrl: config.planner.baseUrl,
      model: config.planner.model, maxContextChars: config.planner.maxContextChars
    }
    const contextChunks = assembly?.chunks as ContextChunk[] | undefined
    const evidence = assembly?.evidence as GraphEvidence[] | undefined

    try {
      const candidatePlan = await detectIntentLlm(
        prefixSuffix.prefix,
        prefixSuffix.suffix,
        languageId,
        plannerConfig,
        contextChunks,
        evidence
      )
      const validation = validatePlan(candidatePlan, evidence ?? [])
      planValidation = { valid: validation.valid, errors: [...validation.errors], warnings: [...validation.warnings] }
      if (validation.valid) {
        intentPlan = candidatePlan
        intentResult = {
          intent: intentPlan.intent, confidence: intentPlan.confidence,
          signals: ["engine-planner-v2"], constraints: intentPlan.constraints,
          requestedSymbols: intentPlan.requestedSymbolIds
        }
      } else {
        intentPlan = undefined
        intentResult = {
          intent: "unknown", confidence: 0, signals: ["planner-invalid"],
          constraints: [], requestedSymbols: []
        }
      }
    } catch {
      intentPlan = undefined
      intentResult = { intent: "unknown", confidence: 0, signals: ["planner-failed"], constraints: [], requestedSymbols: [] }
    }
  } else {
    intentResult = await matrix.intentAdapter.detect({
      languageId, prefixSuffix,
      cursor: { line: cursorLine, character: sample.cursor.character },
      context: contextIR
    })
  }

  // --- prompt ---
  const intentContextBlock = intentPlan
    ? ["Completion intent:", `- ${intentPlan.intent}`, `- scope: ${intentPlan.scope}`,
       ...intentPlan.constraints.map((c) => `- ${c}`),
       ...intentPlan.requestedSymbolIds.map((s) => `- Use existing symbol: ${s}`)].join("\n")
    : intentResult.intent !== "unknown"
      ? ["Completion intent:", `- ${intentResult.intent}`,
         ...intentResult.constraints.map((c) => `- ${c}`),
         ...intentResult.requestedSymbols.map((s) => `- Use existing symbol: ${s}`)].join("\n")
      : ""

  const contextText = contextIR.chunks.map((c) => c.text).join("\n")
  const combinedContext = [contextText, intentContextBlock].filter(Boolean).join("\n\n")

  const fimPrompt: FimPrompt = buildFimPrompt({
    prefix: prefixSuffix.prefix, suffix: prefixSuffix.suffix,
    context: combinedContext || undefined, header: "",
    fileContextEnabled: contextIR.chunks.length > 0, language: languageId,
    contextChunks: assembly?.chunks, graphEvidence: assembly?.evidence, intentPlan
  })

  // --- model ---
  const startTime = Date.now()
  let rawCompletion = ""
  let modelError: string | undefined

  const body: DeepSeekFimRequestBody = {
    max_tokens: 512, model: engineProvider.modelName,
    prompt: fimPrompt.prompt, suffix: fimPrompt.suffix,
    stream: true, temperature: 0.2
  }

  const client = new DeepSeekFimClient({ timeoutMs: 60000 })
  const requestId = `${sample.id}-v2-${Date.now()}`

  try {
    const streamResult = await client.stream(engineProvider, body, requestId, (event: StreamEvent) => {
      if (event.type === "chunk") rawCompletion += event.text
      else if (event.type === "error") modelError = event.error.message
    })
    if (streamResult.finishReason !== "stop") rawCompletion = ""
  } catch (err) { modelError = (err as Error).message }

  const latencyMs = Date.now() - startTime

  // --- postprocess ---
  let finalText = rawCompletion
  let truncated = false
  if (rawCompletion && !modelError) {
    const lineText = lines[cursorLine] ?? ""
    const textAfterCursor = (lines[cursorLine] ?? "").substring(sample.cursor.character) ?? ""
    const charAfterCursor = textAfterCursor.charAt(0) ?? ""
    const charBeforeCursor = sample.cursor.character > 0 ? lineText.charAt(sample.cursor.character - 1) : ""

    const postInput: PostprocessInput = {
      completion: rawCompletion, providerFimData: rawCompletion,
      chunkCount: rawCompletion.length > 0 ? 1 : 0,
      providerModelName: engineProvider.modelName,
      providerFimTemplate: engineProvider.fimTemplate || "automatic",
      nodeType: "", astHasError: false,
      lineText, prefix: fimPrompt.prompt, suffix: fimPrompt.suffix,
      isMultilineCompletion: rawCompletion.split("\n").length > 2,
      multilineCompletionsEnabled: true, maxLines: 40,
      textAfterCursor, charAfterCursor, charBeforeCursor,
      cursorAtMiddleOfWord: /\w/.test(charBeforeCursor) && /\w/.test(charAfterCursor),
      languageId
    }

    const processed = postprocess(postInput)
    if (processed) { finalText = processed; truncated = processed !== rawCompletion && processed.length > 0 }
    else { truncated = false }
  }

  return {
    sampleId: sample.id, matrixLabel: matrix.label,
    artifacts: {
      prefixSuffix, context: contextIR, intent: intentResult,
      prompt: { prompt: fimPrompt.prompt, suffix: fimPrompt.suffix, stopWords: STOP_WORDS },
      model: { rawCompletion, latencyMs, error: modelError },
      completion: { text: finalText, truncated },
      assembly, intentPlan, planValidation
    }
  }
}
