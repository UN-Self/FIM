// ---------------------------------------------------------------------------
// Engine-internal types
//
// Small utility types shared across engine modules.  Most domain types
// (CompletionRequest, CompletionResult, etc.) are re-exported from
// @fim/protocol — this file only holds engine-private helpers.
// ---------------------------------------------------------------------------

/** Prefix/suffix pair extracted from document text. */
export interface PrefixSuffix {
  prefix: string
  suffix: string
}

/** Cursor position in zero-based line/character co-ordinates. */
export interface CursorPosition {
  line: number
  character: number
}
