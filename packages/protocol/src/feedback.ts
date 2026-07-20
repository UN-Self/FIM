// ---------------------------------------------------------------------------
// Feedback protocol types
//
// These events flow from the VS Code adapter back into the engine so it can
// tune caching, debounce behaviour, and (in future phases) train acceptance
// heuristics.
// ---------------------------------------------------------------------------

/**
 * Feedback event sent after the user interacts with a completion.
 *
 * The engine uses these events for telemetry-free acceptance tracking
 * and cache warming / eviction decisions.
 */
export type FeedbackEvent =
  | CompletionAcceptedEvent
  | CompletionRejectedEvent
  | CompletionIgnoredEvent
  | CompletionCancelledEvent

export interface CompletionAcceptedEvent {
  kind: "accepted"
  requestId: string
  /** Number of characters the user typed before accepting. */
  charactersTyped?: number
  /** Whether the user accepted the full completion or a partial prefix. */
  partialAccept?: boolean
}

export interface CompletionRejectedEvent {
  kind: "rejected"
  requestId: string
  /** Number of characters the completion displayed before rejection. */
  charactersShown?: number
  /** How long the completion was visible before rejection (ms). */
  visibleMs?: number
}

export interface CompletionIgnoredEvent {
  kind: "ignored"
  requestId: string
  /** The user moved the cursor or continued typing without accepting or
   * explicitly rejecting. */
}

export interface CompletionCancelledEvent {
  kind: "cancelled"
  requestId: string
  /** Cancellation source: "user" (manual stop), "timeout", or "new_request"
   * (superseded by a subsequent completion). */
  source: "user" | "timeout" | "new_request"
}

// ---- Feedback transport ---------------------------------------------------

/**
 * Generic envelope for feedback messages flowing over a transport
 * (postMessage, IPC, or WebSocket).
 */
export interface FeedbackEnvelope {
  timestamp: string
  event: FeedbackEvent
}
