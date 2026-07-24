// ---------------------------------------------------------------------------
// Engine adapter — bridge between VS Code extension and Engine core
//
// This is the ONLY file that imports from both "vscode" and @fim/engine-ts.
// The Extension must only talk through stable interfaces — it must NOT
// depend on Engine internal implementation.
// ---------------------------------------------------------------------------

import type {
  CompletionConfig,
  CompletionRequest,
  DeepSeekProviderConfig,
  StreamEvent
} from "@fim/protocol"
import { CompletionOrchestrator } from "@fim/engine-ts"
import type { OrchestratorOptions } from "@fim/engine-ts"
import type { WorkspaceFolder, WorkspaceConfiguration } from "vscode"
import {
  InlineCompletionContext,
  InlineCompletionItem,
  InlineCompletionTriggerKind,
  Position,
  Range,
  TextDocument,
  workspace
} from "vscode"

import type { FimProvider } from "../common/deepseek"
import { logger } from "../common/logger"

// ---- EngineAdapter --------------------------------------------------------

export class EngineAdapter {
  private _orchestrator: CompletionOrchestrator

  constructor(options: OrchestratorOptions = {}) {
    this._orchestrator = new CompletionOrchestrator(options)
  }

  /**
   * Translate VS Code document / cursor / config → CompletionRequest (protocol).
   *
   * Keys are never read in this function — they come from the caller via the
   * pre-mapped `provider` argument (DeepSeekProviderConfig).
   */
  buildRequest(
    document: TextDocument,
    position: Position,
    triggerKind: InlineCompletionTriggerKind,
    config: CompletionConfig,
    provider: DeepSeekProviderConfig,
    workspaceFolder?: WorkspaceFolder
  ): CompletionRequest {
    const workspaceId = workspaceFolder?.uri.toString() ?? "default"
    const workspaceRoot = workspaceFolder?.uri.fsPath ?? ""

    return {
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      workspace: {
        id: workspaceId,
        rootUri: workspaceRoot
      },
      document: {
        uri: document.uri.toString(),
        languageId: document.languageId,
        text: document.getText(),
        version: document.version
      },
      cursor: {
        line: position.line,
        character: position.character
      },
      mode:
        triggerKind === InlineCompletionTriggerKind.Automatic
          ? "automatic"
          : "manual",
      config,
      provider
    }
  }

  /**
   * Call orchestrator.complete() and map StreamEvent → InlineCompletionItem[].
   *
   * The orchestrator manages request dedup, concurrency lock, timeout, cache,
   * and upstream cancellation internally.  The adapter only translates the
   * typed result back into VS Code API objects.
   */
  async provideCompletion(
    document: TextDocument,
    position: Position,
    context: InlineCompletionContext,
    config: CompletionConfig,
    provider: DeepSeekProviderConfig,
    workspaceFolder?: WorkspaceFolder
  ): Promise<InlineCompletionItem[]> {
    const request = this.buildRequest(
      document,
      position,
      context.triggerKind,
      config,
      provider,
      workspaceFolder
    )

    const result = await this._orchestrator.complete(
      request,
      (event: StreamEvent) => {
        if (event.type === "error") {
          logger.error(
            `Engine stream error: ${event.error.code} - ${event.error.message}`
          )
        }
      }
    )

    if (!result.completion) return []

    const range = new Range(position, position)
    return [new InlineCompletionItem(result.completion, range)]
  }

  /** Cancel any in-flight completion and clear pending debounce timer. */
  cancel(): void {
    this._orchestrator.cancel()
  }
}

// ---- Mapping helpers ------------------------------------------------------

/**
 * Map VS Code workspace configuration → CompletionConfig (protocol).
 *
 * Translates the flat VS Code setting keys into the engine's typed config.
 * Defaults match the values declared in package.json contributes.configuration.
 */
export function mapConfig(config: WorkspaceConfiguration): CompletionConfig {
  return {
    contextLength: config.get<number>("contextLength", 100),
    debounceWait: config.get<number>("debounceWait", 300),
    temperature: config.get<number>("temperature", 0.2),
    maxTokens: config.get<number>("numPredictFim", 512),
    multilineCompletionsEnabled:
      config.get<boolean>("multilineCompletionsEnabled", true),
    maxLines: config.get<number>("maxLines", 40),
    fileContextEnabled: config.get<boolean>("fileContextEnabled", false),
    completionCacheEnabled: config.get<boolean>("completionCacheEnabled", false),
    autoSuggestEnabled: config.get<boolean>("autoSuggestEnabled", true),
    enableSubsequentCompletions:
      config.get<boolean>("enableSubsequentCompletions", true),
    graphContextEnabled: config.get<boolean>("graphContextEnabled", false)
  }
}

/**
 * Map FimProvider (VS Code storage shape) → DeepSeekProviderConfig (protocol).
 *
 * The adapter is the ONLY place that maps between these two representations.
 * apiKey is passed through directly and MUST NOT be logged, cached, or written
 * to disk downstream.
 */
export function mapProvider(provider: FimProvider): DeepSeekProviderConfig {
  return {
    apiHostname: provider.apiHostname ?? "api.deepseek.com",
    apiKey: provider.apiKey ?? "",
    apiPath: provider.apiPath ?? "/beta/completions",
    apiPort: provider.apiPort,
    apiProtocol: provider.apiProtocol ?? "https",
    modelName: provider.modelName ?? "deepseek-v4-flash",
    fimTemplate: provider.fimTemplate,
    repositoryLevel: provider.repositoryLevel ?? false
  }
}

/**
 * Check whether the engine path is enabled.
 *
 * Controlled by (in priority order):
 *   1. Environment variable FIM_USE_ENGINE=true
 *   2. VS Code setting fim.useEngine (if declared in package.json)
 *
 * Returns false by default so the engine path never activates unexpectedly.
 */
export function isEngineEnabled(config?: WorkspaceConfiguration): boolean {
  if (process.env.FIM_USE_ENGINE === "true") return true
  if (config) return config.get<boolean>("useEngine", false) ?? false
  return false
}
