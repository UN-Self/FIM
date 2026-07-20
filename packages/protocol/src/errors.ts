// ---------------------------------------------------------------------------
// Error codes and types shared across the engine, adapter, and protocol
//
// Every error that crosses a process / RPC boundary MUST use one of the
// codes defined here so consumers can branch on them without string-matching
// provider-specific error messages.
// ---------------------------------------------------------------------------

/**
 * Canonical error codes for the FIM engine.
 *
 * New codes may be added; existing codes MUST NOT be removed or renumbered.
 */
export const ErrorCode = {
  // ---- Transport / lifecycle ----
  /** The engine process is not reachable or has not started. */
  ENGINE_UNAVAILABLE: "ENGINE_UNAVAILABLE",
  /** The engine shut down while a request was in flight. */
  ENGINE_TERMINATED: "ENGINE_TERMINATED",

  // ---- Request validation ----
  /** The request payload is malformed or missing required fields. */
  INVALID_REQUEST: "INVALID_REQUEST",
  /** The provider configuration references an unknown provider. */
  UNKNOWN_PROVIDER: "UNKNOWN_PROVIDER",
  /** The provider configuration is missing required credentials. */
  MISSING_CREDENTIALS: "MISSING_CREDENTIALS",

  // ---- Completion lifecycle ----
  /** The request exceeded the configured timeout. */
  TIMEOUT: "TIMEOUT",
  /** The request was cancelled by the user or superseded. */
  CANCELLED: "CANCELLED",

  // ---- Upstream / network ----
  /** The upstream provider returned a non-2xx status. */
  PROVIDER_ERROR: "PROVIDER_ERROR",
  /** A network-level error prevented the request from reaching the
   * provider (DNS, TLS, connection refused, etc.). */
  NETWORK_ERROR: "NETWORK_ERROR",

  // ---- Streaming / parsing ----
  /** The upstream stream returned malformed data that could not be parsed. */
  STREAM_PARSE_ERROR: "STREAM_PARSE_ERROR",
  /** The completion entered an empty-content loop (whitespace-only
   * continuation beyond the safety threshold). */
  EMPTY_COMPLETION_LOOP: "EMPTY_COMPLETION_LOOP",

  // ---- Graph / context ----
  /** The graph provider is not available (not installed, not running,
   * or still indexing). */
  GRAPH_UNAVAILABLE: "GRAPH_UNAVAILABLE",
  /** The graph provider returned a result that failed validation. */
  GRAPH_INVALID_RESULT: "GRAPH_INVALID_RESULT",

  // ---- Planner ----
  /** The planner LLM returned output that could not be parsed as a valid
   * IntentPlan. */
  PLANNER_PARSE_ERROR: "PLANNER_PARSE_ERROR",
  /** The planner LLM returned a plan that failed validation. */
  PLANNER_VALIDATION_ERROR: "PLANNER_VALIDATION_ERROR",

  // ---- Internal ----
  /** An unexpected internal error occurred in the engine. */
  INTERNAL_ERROR: "INTERNAL_ERROR"
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

/**
 * Structured error type used across all engine / protocol boundaries.
 *
 * `statusCode` is only meaningful for PROVIDER_ERROR and NETWORK_ERROR.
 */
export interface EngineError {
  code: ErrorCode
  message: string
  /** Optional HTTP status code from the upstream provider. */
  statusCode?: number
  /** Optional stack trace (stripped in production / non-debug builds). */
  stack?: string
}
