import AsyncLock from "async-lock"
import fs from "fs"
import ignore from "ignore"
import path from "path"
import {
  ExtensionContext,
  InlineCompletionContext,
  InlineCompletionItem,
  InlineCompletionItemProvider,
  InlineCompletionList,
  InlineCompletionTriggerKind,
  Position,
  Range,
  StatusBarItem,
  TextDocument,
  Uri,
  window,
  workspace
} from "vscode"
import Parser, { SyntaxNode } from "web-tree-sitter"

import "string_score"

import {
  FIM_TEMPLATE_FORMAT,
  MAX_CONTEXT_LINE_COUNT,
  MAX_EMPTY_COMPLETION_CHARS
} from "../../common/constants"
import type { FimProvider } from "../../common/deepseek"
import { supportedLanguages } from "../../common/languages"
import { logger } from "../../common/logger"
import {
  PrefixSuffix,
  RepositoryLevelData as RepositoryDocment,
  ResolvedInlineCompletion,
  StreamRequestOptions,
  StreamResponse
} from "../../common/types"
import { getLineBreakCount } from "../../webview/utils"
import { Base } from "../base"
import { cache } from "../cache"
import { CompletionFormatter } from "../completion-formatter"
import { EngineAdapter, mapConfig, mapProvider } from "../engine-adapter"
import { FileInteractionCache } from "../file-interaction"
import {
  getFimSplitPrompt,
  getFimSplitPromptRepositoryLevel,
  getStopWords
} from "../fim-templates"
import { llm } from "../llm"
import { getNodeAtPosition, getParser } from "../parser"
import { truncateCompletion } from "../postprocessor"
import { validateTypeScriptCompletion } from "../typescript-diagnostics"
import {
  getFimDataFromProvider,
  getIsMiddleOfString,
  getIsMultilineCompletion,
  getPrefixSuffix,
  getShouldSkipCompletion,
  sanitizeWorkspaceName
} from "../utils"

export class CompletionProvider
  extends Base
  implements InlineCompletionItemProvider
{
  private _abortController: AbortController | null
  private _acceptedLastCompletion = false
  private _chunkCount = 0
  private _completion = ""
  private _debouncer: NodeJS.Timeout | undefined
  private _document: TextDocument | null
  private _engineAdapter: EngineAdapter | null = null
  private _fileInteractionCache: FileInteractionCache
  private _isMultilineCompletion = false
  private _lastCompletionMultiline = false
  private _lock: AsyncLock
  private _nodeAtPosition: SyntaxNode | null = null
  private _nonce = 0
  private _parser: Parser | undefined
  private _position: Position | null
  private _prefixSuffix: PrefixSuffix = { prefix: "", suffix: "" }
  private _provider: FimProvider | undefined
  private _statusBar: StatusBarItem
  public lastCompletionText = ""

  constructor(
    statusBar: StatusBarItem,
    fileInteractionCache: FileInteractionCache,
    context: ExtensionContext
  ) {
    super(context)
    this._abortController = null
    this._document = null
    this._lock = new AsyncLock()
    this._position = null
    this._statusBar = statusBar
    this._fileInteractionCache = fileInteractionCache
  }

  /** Set the engine adapter (called from extension activate). */
  public setEngineAdapter(adapter: EngineAdapter): void {
    this._engineAdapter = adapter
  }

  private buildFimRequest(
    promptData: { prompt: string; suffix: string },
    provider: FimProvider
  ) {
    const body = {
      max_tokens: this.config.numPredictFim,
      model: provider.modelName,
      prompt: promptData.prompt,
      suffix: promptData.suffix,
      stream: true,
      temperature: this.config.temperature
    }

    const options: StreamRequestOptions = {
      hostname: provider.apiHostname || "",
      port: provider.apiPort ? Number(provider.apiPort) : undefined,
      path: provider.apiPath || "",
      protocol: provider.apiProtocol || "",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: provider.apiKey ? `Bearer ${provider.apiKey}` : ""
      }
    }

    return { options, body }
  }

  public async provideInlineCompletionItems(
    document: TextDocument,
    position: Position,
    context: InlineCompletionContext
  ): Promise<InlineCompletionItem[] | InlineCompletionList | null | undefined> {
    const editor = window.activeTextEditor
    this._provider = this.getFimProvider()
    const isLastCompletionAccepted =
      this._acceptedLastCompletion && !this.config.enableSubsequentCompletions

    this._prefixSuffix = getPrefixSuffix(
      this.config.contextLength,
      document,
      position
    )
    // Cache hits and manual re-invocations reuse the current editor state.
    // Keep it in sync for both the legacy and engine completion paths.
    this._document = document
    this._position = position

    const languageEnabled =
      this.config.enabledLanguages[document.languageId] ??
      this.config.enabledLanguages["*"] ??
      true

    if (!languageEnabled) return

    const cachedCompletion = cache.getCache(this._prefixSuffix)
    if (cachedCompletion && this.config.completionCacheEnabled) {
      this._completion = cachedCompletion
      return this.provideInlineCompletion()
    }

    if (
      context.triggerKind === InlineCompletionTriggerKind.Invoke &&
      this.config.autoSuggestEnabled
    ) {
      this._completion = this.lastCompletionText
      return this.provideInlineCompletion()
    }

    if (
      !this.config.enabled ||
      !editor ||
      isLastCompletionAccepted ||
      this._lastCompletionMultiline ||
      getShouldSkipCompletion(context, this.config.autoSuggestEnabled) ||
      getIsMiddleOfString()
    ) {
      this._statusBar.text = "$(code)"
      return
    }

    // ---- Engine path (opt-in, gated by FIM_USE_ENGINE or fim.useEngine) ----
    if (this._engineAdapter) {
      try {
        return await this.runEngineCompletion(document, position, context)
      } catch (error) {
        logger.error(
          `Engine path failed, falling back to legacy: ${error}`
        )
        this._statusBar.text = "$(code)"
        // Fall through to existing path below
      }
    }

    // ---- Existing completion path (unchanged) ----

    this._chunkCount = 0
    this._nonce = this._nonce + 1
    this._statusBar.text = "$(loading~spin)"
    this._statusBar.command = "fim.stopGeneration"
    await this.tryParseDocument(document)

    this._isMultilineCompletion = getIsMultilineCompletion({
      node: this._nodeAtPosition,
      prefixSuffix: this._prefixSuffix
    })

    if (this._debouncer) clearTimeout(this._debouncer)

    const promptData = await this.getPrompt(this._prefixSuffix)

    if (!promptData) return

    return new Promise<ResolvedInlineCompletion>((resolve, reject) => {
      this._debouncer = setTimeout(() => {
        this._lock.acquire("fim.completion", async () => {
          const provider = this.getFimProvider()
          if (!provider) return
          const request = this.buildFimRequest(promptData, provider)

          if (!request) return

          try {
            await llm({
              body: request.body,
              options: request.options,
              onStart: (controller) => (this._abortController = controller),
              onEnd: () => this.onEnd(resolve),
              onError: this.onError,
              onData: (data) => {
                const completion = this.onData(data as StreamResponse)
                if (completion) {
                  this._abortController?.abort()
                }
              }
            })
          } catch {
            this.onError()
            reject([])
          }
        })
      }, this.config.debounceWait)
    })
  }

  private async tryParseDocument(document: TextDocument) {
    try {
      if (!this._position || !this._document) return
      const parser = await getParser(document.uri.fsPath)

      if (!parser || !parser.parse) return

      this._parser = parser

      this._nodeAtPosition = getNodeAtPosition(
        this._parser?.parse(this._document.getText()),
        this._position
      )
    } catch {
      return
    }
  }

  private onData(data: StreamResponse | undefined): string {
    if (!this._provider) return ""

    const providerFimData = getFimDataFromProvider(
      this._provider.provider,
      data
    )
    if (providerFimData === undefined) return ""

    this._completion = this._completion + providerFimData
    this._chunkCount = this._chunkCount + 1

    if (
      this._completion.length > MAX_EMPTY_COMPLETION_CHARS &&
      this._completion.trim().length === 0
    ) {
      this.abortCompletion()
      logger.log(
        `Streaming response end as llm in empty completion loop:  ${this._nonce}`
      )
    }

    const truncated = truncateCompletion({
      completion: this._completion,
      providerFimData,
      chunkCount: this._chunkCount,
      providerModelName: this._provider.modelName,
      providerFimTemplate:
        this._provider.fimTemplate || FIM_TEMPLATE_FORMAT.automatic,
      nodeAtPosition: this._nodeAtPosition,
      parser: this._parser,
      position: this._position,
      prefixSuffix: this._prefixSuffix,
      isMultilineCompletion: this._isMultilineCompletion,
      multilineCompletionsEnabled: this.config.multilineCompletionsEnabled,
      maxLines: this.config.maxLines
    })

    if (truncated && truncated !== "") {
      this._completion = truncated
      return this._completion
    }

    return ""
  }

  private onEnd(resolve: (completion: ResolvedInlineCompletion) => void) {
    return resolve(this.provideInlineCompletion())
  }

  public onError = () => {
    this._abortController?.abort()
  }

  private getPromptHeader(languageId: string | undefined, uri: Uri) {
    const lang =
      supportedLanguages[languageId as keyof typeof supportedLanguages]

    if (!lang) {
      return ""
    }

    const language = `${lang.syntaxComments?.start || ""} Language: ${
      lang?.langName
    } (${languageId}) ${lang.syntaxComments?.end || ""}`

    const path = `${
      lang.syntaxComments?.start || ""
    } File uri: ${uri.toString()} (${languageId}) ${
      lang.syntaxComments?.end || ""
    }`

    return `\n${language}\n${path}\n`
  }

  private async getRelevantDocuments(): Promise<RepositoryDocment[]> {
    const interactions = this._fileInteractionCache.getAll()
    const currentFileName = this._document?.fileName || ""
    const openTextDocuments = workspace.textDocuments
    const rootPath = workspace.workspaceFolders?.[0]?.uri.fsPath || ""
    const ig = ignore({ allowRelativePaths: true })

    const embeddingIgnoredGlobs = this.config.get(
      "embeddingIgnoredGlobs",
      [] as string[]
    )

    ig.add(embeddingIgnoredGlobs)

    const gitIgnoreFilePath = path.join(rootPath, ".gitignore")

    if (fs.existsSync(gitIgnoreFilePath)) {
      ig.add(fs.readFileSync(gitIgnoreFilePath).toString())
    }

    const openDocumentsData: RepositoryDocment[] = openTextDocuments
      .filter((doc) => {
        const isCurrentFile = doc.fileName === currentFileName
        const isGitFile =
          doc.fileName.includes(".git") || doc.fileName.includes("git/")

        const projectRoot = workspace.workspaceFolders?.[0].uri.fsPath || ""
        const relativePath = path.relative(projectRoot, doc.fileName)

        if (isGitFile) return false

        const normalizedPath = relativePath.split(path.sep).join("/")
        const isIgnored = ig.ignores(normalizedPath)

        return !isCurrentFile && !isIgnored
      })
      .map((doc) => {
        const interaction = interactions.find((i) => i.name === doc.fileName)
        return {
          uri: doc.uri,
          text: doc.getText(),
          name: doc.fileName,
          isOpen: true,
          relevanceScore: interaction?.relevanceScore || 0
        }
      })

    const otherDocumentsData: RepositoryDocment[] = (
      await Promise.all(
        interactions
          .filter(
            (interaction) =>
              !openTextDocuments.some(
                (doc) => doc.fileName === interaction.name
              )
          )
          .filter((interaction) => !ig.ignores(interaction.name || ""))
          .map(async (interaction) => {
            const filePath = interaction.name
            if (!filePath) return null
            if (
              filePath.toString().match(".git") ||
              currentFileName === filePath
            )
              return null
            const uri = Uri.file(filePath)
            try {
              const document = await workspace.openTextDocument(uri)
              return {
                uri,
                text: document.getText(),
                name: filePath,
                isOpen: false,
                relevanceScore: interaction.relevanceScore
              }
            } catch (error) {
              console.error(`Error opening document ${filePath}:`, error)
              return null
            }
          })
      )
    ).filter((doc): doc is RepositoryDocment => doc !== null)

    const allDocuments = [...openDocumentsData, ...otherDocumentsData].sort(
      (a, b) => b.relevanceScore - a.relevanceScore
    )

    return allDocuments.slice(0, 3)
  }

  private async getFileInteractionContext() {
    this._fileInteractionCache.addOpenFilesWithPriority()
    const interactions = this._fileInteractionCache.getAll()
    const currentFileName = this._document?.fileName || ""

    const fileChunks: string[] = []
    for (const interaction of interactions) {
      const filePath = interaction.name

      if (!filePath) continue
      if (filePath.toString().match(".git")) continue
      if (currentFileName === filePath) continue

      const uri = Uri.file(filePath)
      const activeLines = interaction.activeLines

      let document;
      try {
        document = await workspace.openTextDocument(uri)
      } catch {
        continue
      }

      const lineCount = document.lineCount
      if (lineCount > MAX_CONTEXT_LINE_COUNT) {
        const averageLine =
          activeLines.reduce((acc, curr) => acc + curr.line, 0) /
          activeLines.length
        const start = new Position(
          Math.max(0, Math.ceil(averageLine || 0) - 100),
          0
        )
        const end = new Position(
          Math.min(lineCount, Math.ceil(averageLine || 0) + 100),
          0
        )
        fileChunks.push(
          `
          // File: ${filePath}
          // Content: \n ${document.getText(new Range(start, end))}
        `.trim()
        )
      } else {
        fileChunks.push(
          `
          // File: ${filePath}
          // Content: \n ${document.getText()}
        `.trim()
        )
      }
    }

    return fileChunks.join("\n")
  }

  private removeStopWords(completion: string) {
    if (!this._provider) return completion
    let filteredCompletion = completion
    const stopWords = getStopWords(
      this._provider.modelName,
      this._provider.fimTemplate || FIM_TEMPLATE_FORMAT.automatic
    )
    stopWords.forEach((stopWord) => {
      filteredCompletion = filteredCompletion.split(stopWord).join("")
    })
    return filteredCompletion
  }

  private async getPrompt(
    prefixSuffix: PrefixSuffix
  ): Promise<{ prompt: string; suffix: string } | ""> {
    if (!this._provider) return ""
    if (!this._document || !this._position || !this._provider) return ""

    const documentLanguage = this._document.languageId
    const fileInteractionContext = await this.getFileInteractionContext()

    if (this._provider.repositoryLevel) {
      const repositoryLevelData = await this.getRelevantDocuments()
      const repoName = sanitizeWorkspaceName(workspace.name)
      const currentFile = await this._document.uri.fsPath
      return getFimSplitPromptRepositoryLevel(
        repoName || "untitled",
        repositoryLevelData,
        prefixSuffix,
        currentFile
      )
    }

    return getFimSplitPrompt({
      context: fileInteractionContext || "",
      prefixSuffix,
      header: this.getPromptHeader(documentLanguage, this._document.uri),
      fileContextEnabled: this.config.fileContextEnabled,
      language: documentLanguage
    })
  }

  public setAcceptedLastCompletion(value: boolean) {
    this._acceptedLastCompletion = value
    this._lastCompletionMultiline = getLineBreakCount(this.lastCompletionText) > 1
  }

  public abortCompletion() {
    if (this._engineAdapter) {
      this._engineAdapter.cancel()
    }
    this._abortController?.abort()
    this._statusBar.text = "$(code)"
  }

  // ---- Engine path ---------------------------------------------------------

  /**
   * Delegates the completion to the Engine adapter.
   *
   * The adapter builds a CompletionRequest (protocol), calls the orchestrator,
   * and maps stream events back to InlineCompletionItem[].
   */
  private async runEngineCompletion(
    document: TextDocument,
    position: Position,
    context: InlineCompletionContext
  ): Promise<InlineCompletionItem[] | InlineCompletionList> {
    if (!this._engineAdapter) return []

    this._statusBar.text = "$(loading~spin)"
    this._statusBar.command = "fim.stopGeneration"

    const provider = this.getFimProvider()
    if (!provider) {
      this._statusBar.text = "$(code)"
      return []
    }

    const engineConfig = mapConfig(this.config)
    const engineProvider = mapProvider(provider)

    const workspaceFolder = workspace.workspaceFolders?.[0]

    const items = await this._engineAdapter.provideCompletion(
      document,
      position,
      context,
      engineConfig,
      engineProvider,
      workspaceFolder
    )

    // Sync shared completion state from engine adapter results
    if (items.length > 0) {
      const completionText = (items[0] as InlineCompletionItem).insertText
      if (typeof completionText === "string" && completionText.length > 0) {
        if (!this.passesTypeScriptValidation(completionText)) {
          this._statusBar.text = "$(code)"
          return []
        }
        this._completion = ""
        this._statusBar.text = "$(code)"
        this.lastCompletionText = completionText
        this._lastCompletionMultiline = getLineBreakCount(completionText) > 1
        this.logCompletion(completionText)
        if (this.config.completionCacheEnabled)
          cache.setCache(this._prefixSuffix, completionText)
        return items
      }
    }

    this._statusBar.text = "$(code)"
    return items
  }

  private logCompletion(formattedCompletion: string) {
    logger.log(
      `
      *** Fim completion triggered for file: ${this._document?.uri} ***
      Original completion: ${this._completion}
      Formatted completion: ${formattedCompletion}
      Max Lines: ${this.config.maxLines}
      Use file context: ${this.config.fileContextEnabled}
      Completed lines count ${getLineBreakCount(formattedCompletion)}
    `.trim()
    )
  }

  private finalizeCompletion(formattedCompletion: string): InlineCompletionItem[] {
    if (!this._position) return []
    if (!this.passesTypeScriptValidation(formattedCompletion)) return []

    this.logCompletion(formattedCompletion)

    if (this.config.completionCacheEnabled)
      cache.setCache(this._prefixSuffix, formattedCompletion)

    this._completion = ""
    this._statusBar.text = "$(code)"
    this.lastCompletionText = formattedCompletion
    this._lastCompletionMultiline = getLineBreakCount(formattedCompletion) > 1

    return [
      new InlineCompletionItem(
        formattedCompletion,
        new Range(this._position, this._position)
      )
    ]
  }

  private provideInlineCompletion(): InlineCompletionItem[] {
    const editor = window.activeTextEditor
    if (!editor || !this._position) return []

    const formattedCompletion = new CompletionFormatter(editor).format(
      this.removeStopWords(this._completion)
    )

    return this.finalizeCompletion(formattedCompletion)
  }

  private passesTypeScriptValidation(completion: string): boolean {
    if (!this.config.get<boolean>("validateWithTypeScript", true)) return true
    if (!this._document || !this._position || !completion.trim()) return true

    const result = validateTypeScriptCompletion({
      fileName: this._document.fileName,
      languageId: this._document.languageId,
      originalText: this._document.getText(),
      completionText: completion,
      offset: this._document.offsetAt(this._position)
    })
    if (result.checked && !result.valid) {
      logger.log(`Rejected completion with ${result.newErrorCount} new TypeScript diagnostic(s)`)
      return false
    }
    return true
  }
}
