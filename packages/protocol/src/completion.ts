// ---------------------------------------------------------------------------
// Completion protocol types (plan §4.1)
//
// These describe the full shape of a FIM completion request, the provider
// configuration that drives it, per-chunk streaming events, and the final
// result returned by the engine.
// ---------------------------------------------------------------------------

/**
 * Completion generation configuration.
 *
 * Mirrors the VS Code extension settings surfaced in the FIM webview but is
 * intentionally framework-agnostic so the engine can consume it without any
 * VS Code import.
 */
export interface CompletionConfig {
  /** Number of context lines to include (prefix + suffix). */
  contextLength: number
  /** Debounce delay in ms before firing a completion request. */
  debounceWait: number
  /** Sampling temperature (0-1). */
  temperature: number
  /** Maximum tokens the model may generate. */
  maxTokens: number
  /** Whether multi-line completions are enabled. */
  multilineCompletionsEnabled: boolean
  /** Cap on generated lines when multi-line mode is active. */
  maxLines: number
  /** Whether to add surrounding-file context into the prompt. */
  fileContextEnabled: boolean
  /** Whether the completion result cache is active. */
  completionCacheEnabled: boolean
  /** Whether automatic (as-you-type) suggestions are enabled. */
  autoSuggestEnabled: boolean
  /** Whether to fire subsequent completions after the previous one was
   * accepted. */
  enableSubsequentCompletions: boolean
  /** Whether to query the code graph for cross-file context (Phase 3). */
  graphContextEnabled: boolean
}

/**
 * Provider configuration for DeepSeek (or any FIM-compatible provider).
 *
 * Kept deliberately flat so it serialises cleanly across process / RPC
 * boundaries.
 */
export interface DeepSeekProviderConfig {
  apiHostname: string
  apiKey: string
  apiPath: string
  apiPort?: number
  apiProtocol: string
  modelName: string
  /** FIM template variant (e.g. "deepseek", "automatic"). */
  fimTemplate?: string
  /** Whether repository-level context is enabled for this provider. */
  repositoryLevel?: boolean
}

// ---- Request / response shapes --------------------------------------------

/**
 * A single completion request sent from the VS Code adapter into the engine.
 *
 * Fields match plan §4.1 exactly.  The adapter is responsible for turning
 * `vscode.TextDocument`, `vscode.Position`, etc. into this plain structure.
 */
export interface CompletionRequest {
  /** Opaque id used for dedup, cancellation, and feedback correlation. */
  requestId: string
  workspace: {
    id: string
    rootUri: string
    revision?: string
  }
  document: {
    uri: string
    languageId: string
    /** Full text of the document (including unsaved buffer content). */
    text: string
    version: number
  }
  cursor: {
    line: number
    character: number
  }
  mode: "automatic" | "manual"
  config: CompletionConfig
  provider: DeepSeekProviderConfig
}

/**
 * Streaming event emitted by the engine as chunks arrive from the model.
 *
 * Consumers (VS Code adapter) use these events to drive ghost-text rendering
 * and status-bar updates.
 */
export type StreamEvent =
  | { type: "chunk"; requestId: string; text: string }
  | { type: "end"; requestId: string }
  | { type: "error"; requestId: string; error: CompletionError }

/**
 * Final result produced when a completion stream finishes successfully.
 */
export interface CompletionResult {
  requestId: string
  /** The full processed completion text. */
  completion: string
  finishReason: "stop" | "truncated" | "cancelled"
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  /** Wall-clock time from request submission to final event (ms). */
  latencyMs: number
}

/** Structured error surfaced through `StreamEvent.type === "error"`. */
export interface CompletionError {
  code: CompletionErrorCode
  message: string
  statusCode?: number
}

/**
 * Error codes used by the engine and adapter.
 *
 * Extends the codes defined in `errors.ts` with completion-specific codes.
 */
export type CompletionErrorCode =
  | "TIMEOUT"
  | "CANCELLED"
  | "NETWORK_ERROR"
  | "PROVIDER_ERROR"
  | "PARSE_ERROR"
  | "EMPTY_COMPLETION_LOOP"
