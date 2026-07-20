// ---------------------------------------------------------------------------
// Intent planner protocol types (plan §4.3)
//
// The intent planner is an optional LLM-powered step that infers *what* the
// user is likely doing so the context assembler can fetch relevant code.
// It MUST NOT rewrite prefix/suffix and MUST NOT return arbitrary prompt text.
// ---------------------------------------------------------------------------

/**
 * Classifies the *kind* of edit the user appears to be making.
 *
 * Mirrors the prototype in `eval/adapters/types.ts` but kept in the
 * protocol layer so it is shared across eval, engine, and future clients.
 */
export type IntentType =
  | "line_continuation"
  | "block_completion"
  | "import_completion"
  | "argument_completion"
  | "comment_to_code"
  | "test_completion"
  | "unknown"

/**
 * Structured output returned by the intent-planning LLM.
 *
 * - `constraints` describe rules the completion should obey (e.g. "must use
 *   lodash", "keep under 5 lines").
 * - `requestedSymbolIds` are symbol identifiers the planner wants the context
 *   assembler to fetch and include.
 *
 * The plan validator MUST verify that every `requestedSymbolIds` entry
 * exists in the current `GraphEvidence` set and that `scope` does not
 * exceed the maximum writable range for the current cursor position.
 */
export interface IntentPlan {
  intent: IntentType
  /** 0-1 confidence; plans below a configurable threshold are discarded. */
  confidence: number
  scope: "expression" | "statement" | "block" | "function"
  constraints: string[]
  requestedSymbolIds: string[]
}

/**
 * Result of validating an `IntentPlan` against the current code graph.
 *
 * A plan that is `valid === false` is discarded silently — the engine
 * falls back to the no-planner path.  Warnings are informational and do
 * not block the plan from being used.
 */
export interface PlanValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}
