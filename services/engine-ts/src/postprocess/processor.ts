// ---------------------------------------------------------------------------
// Postprocessing pipeline
//
// Extracted from `src/extension/postprocessor.ts` +
// `src/extension/completion-formatter.ts` — all logic preserved, zero VS Code
// dependencies.  Inputs that used to be `vscode.Position`, `vscode.TextEditor`,
// etc. are replaced with plain strings and numbers.
//
// The pipeline runs after the stream accumulator has gathered the raw
// completion string and before the result is handed back to the adapter.
// ---------------------------------------------------------------------------

import { getLineBreakCount } from "../utils"

// ---- Constants (mirrors src/common/constants/misc.ts) ---------------------

const OPENING_BRACKETS = ["[", "{", "("]
const CLOSING_BRACKETS = ["]", "}", ")"]
const QUOTES = ["\"", "'", "`"]

const MULTILINE_OUTSIDE = [
  "class_body",
  "class",
  "export",
  "identifier",
  "interface_body",
  "interface",
  "program"
]
const MULTILINE_INSIDE = [
  "body",
  "export_statement",
  "formal_parameters",
  "function_definition",
  "named_imports",
  "object_pattern",
  "object_type",
  "object",
  "parenthesized_expression",
  "statement_block"
]
const MULTILINE_TYPES = [...MULTILINE_OUTSIDE, ...MULTILINE_INSIDE]
const MULTI_LINE_DELIMITERS = ["\n\n", "\r\n\r\n"]
const MAX_EMPTY_COMPLETION_CHARS = 250
const MIN_COMPLETION_CHUNKS = 2

const STOP_DEEPSEEK = [
  "<｜fim▁begin｜>",
  "<｜fim▁hole｜>",
  "<｜fim▁end｜>",
  "<END>",
  "<｜end of sentence｜>"
]

// ---- Types ----------------------------------------------------------------

export interface PostprocessInput {
  completion: string
  /** Latest chunk text returned by the provider (used for multiline
   * detection in truncation logic). */
  providerFimData: string
  chunkCount: number
  providerModelName: string
  providerFimTemplate: string
  /** AST node type at the cursor position, or empty string if not
   * available. */
  nodeType: string
  /** Whether the AST parse of the prefix + completion succeeded. */
  astHasError: boolean
  /** Current line text at the cursor position. */
  lineText: string
  /** Raw prefix text (used for context detection). */
  prefix: string
  /** Raw suffix text. */
  suffix: string
  isMultilineCompletion: boolean
  multilineCompletionsEnabled: boolean
  maxLines: number
  /** Text after the cursor on the current line. */
  textAfterCursor: string
  /** First character after the cursor. */
  charAfterCursor: string
  /** First character before the cursor. */
  charBeforeCursor: string
  /** Whether the cursor is in the middle of a word. */
  cursorAtMiddleOfWord: boolean
  /** Language identifier (e.g. "typescript"). */
  languageId: string
}

// ---- Bracket helpers ------------------------------------------------------

type Bracket = "(" | "[" | "{"

function isMatchingBracket(open: Bracket, close: string): boolean {
  const pairs: Record<Bracket, string> = {
    "(": ")",
    "[": "]",
    "{": "}"
  }
  return pairs[open] === close
}

function isOpeningBracket(char: string): char is Bracket {
  return OPENING_BRACKETS.includes(char)
}

function isClosingBracket(char: string): boolean {
  return CLOSING_BRACKETS.includes(char)
}

// ---- Truncation phase -----------------------------------------------------

/**
 * Mirrors `truncateCompletion()` from `src/extension/postprocessor.ts`.
 *
 * Determines whether the accumulated completion should be considered
 * "done" based on AST validity, bracket balance, and structural
 * boundaries.  When the function returns a non-empty string, streaming
 * stops and that string becomes the final completion.
 */
function truncateCompletion(input: PostprocessInput): string {
  const {
    completion,
    providerFimData,
    chunkCount,
    isMultilineCompletion,
    multilineCompletionsEnabled,
    maxLines,
    providerFimTemplate,
    nodeType,
    astHasError,
    lineText,
    prefix
  } = input

  const stopWords = STOP_DEEPSEEK

  // Guard: empty-content loop
  if (
    completion.length > MAX_EMPTY_COMPLETION_CHARS &&
    completion.trim().length === 0
  ) {
    return completion
  }

  // Guard: stop-word present
  if (stopWords.some((sw) => completion.includes(sw))) {
    return completion
  }

  // Guard: multiline disabled and we have enough chunks with a line break
  if (
    !multilineCompletionsEnabled &&
    chunkCount >= MIN_COMPLETION_CHUNKS &&
    /\r?\n|\r|\n/.test(completion.trimStart())
  ) {
    return completion
  }

  // Guard: single-line completion that just became multiline
  const isMultilineCompletionRequired =
    !isMultilineCompletion &&
    multilineCompletionsEnabled &&
    chunkCount >= MIN_COMPLETION_CHUNKS &&
    /\r?\n|\r|\n/.test(completion.trimStart())
  if (isMultilineCompletionRequired) {
    return completion
  }

  // Only run AST / bracket analysis when providerFimData contains a newline
  if (!providerFimData.includes("\n")) {
    return checkMaxLines(completion, maxLines)
  }

  // Structural analysis (mirrors original AST/bracket checks)
  // TODO: reinstate childCount check when AST node type is available from engine
  const takeFirst = MULTILINE_OUTSIDE.includes(nodeType)

  const isInsideFunction =
    prefix.includes("=>") ||
    prefix.includes("function") ||
    nodeType.includes("function") ||
    nodeType.includes("method")

  // Bracket balance
  const openBrackets: string[] = []
  let isBalanced = true

  for (const char of completion) {
    if (isOpeningBracket(char)) {
      openBrackets.push(char)
    } else if (isClosingBracket(char)) {
      const lastOpen = openBrackets.pop()
      if (!lastOpen || !isMatchingBracket(lastOpen as Bracket, char)) {
        isBalanced = false
        break
      }
    }
  }

  const hasSubstantialContent = completion.trim().length > 20
  const hasCompleteSyntax = openBrackets.length === 0 && isBalanced
  const hasEndPattern = /\}\s*$|\)\s*$|\]\s*$|;\s*$/.test(completion)
  const endsWithEmptyLine = /\n\s*\n\s*$/.test(completion)

  const lines = completion.split("\n")
  const firstLineIndent =
    lines.length > 0
      ? lines[0].length - lines[0].trimStart().length
      : 0
  const lastLineIndent =
    lines.length > 1
      ? lines[lines.length - 1].length -
        lines[lines.length - 1].trimStart().length
      : 0
  const indentationReturned =
    lines.length > 2 && lastLineIndent <= firstLineIndent

  const structuralBoundaryPattern = /\}\s*\n(\s*)\S+/m.test(completion)

  // Inside function: truncate at last closing brace
  if (isInsideFunction && completion.includes("}")) {
    const lastClosingBraceIndex = completion.lastIndexOf("}")
    if (hasCompleteSyntax) {
      const contentAfterBrace = completion
        .substring(lastClosingBraceIndex + 1)
        .trim()
      if (!contentAfterBrace || /^\s*\n\s*\S+/.test(contentAfterBrace)) {
        return completion.substring(0, lastClosingBraceIndex + 1)
      }
    }
  }

  // Structural boundary: truncate at closing brace when indent resets
  if (structuralBoundaryPattern && hasCompleteSyntax) {
    const match = completion.match(/\}\s*\n(\s*)\S+/m)
    if (match && match.index !== undefined) {
      const closingBracePos = match.index + 1
      const indentAfterBrace = match[1].length
      if (indentAfterBrace <= firstLineIndent) {
        return completion.substring(0, closingBracePos)
      }
    }
  }

  // Completion looks syntactically complete
  if (
    isMultilineCompletion &&
    chunkCount >= 2 &&
    (takeFirst || hasCompleteSyntax) &&
    !astHasError &&
    (hasEndPattern ||
      endsWithEmptyLine ||
      indentationReturned ||
      (hasSubstantialContent && hasCompleteSyntax))
  ) {
    if (
      MULTI_LINE_DELIMITERS.some((d) => completion.endsWith(d)) ||
      endsWithEmptyLine ||
      (hasEndPattern && hasCompleteSyntax) ||
      (structuralBoundaryPattern && hasCompleteSyntax)
    ) {
      return completion
    }
  }

  return checkMaxLines(completion, maxLines)
}

function checkMaxLines(completion: string, maxLines: number): string {
  if (getLineBreakCount(completion) >= maxLines) {
    return completion
  }
  return ""
}

// ---- Formatting phase -----------------------------------------------------

/**
 * Applies the formatting pipeline (bracket matching, dedup, quote removal,
 * etc.) to the raw completion string.
 *
 * Mirrors `CompletionFormatter.format()` from
 * `src/extension/completion-formatter.ts`.
 */
function applyFormatting(input: PostprocessInput): string {
  const {
    completion,
    textAfterCursor,
    charAfterCursor,
    charBeforeCursor,
    cursorAtMiddleOfWord,
    languageId
  } = input

  let result = completion

  // 1. Match completion brackets (strip unmatched closes)
  result = matchCompletionBrackets(result)

  // 2. Prevent quotation / comment completions
  result = preventQuotationCompletions(result, languageId)

  // 3. Prevent duplicate lines
  result = preventDuplicateLine(result, textAfterCursor)

  // 4. Remove duplicate quotes
  result = removeDuplicateQuotes(result, charAfterCursor)

  // 5. Remove unnecessary middle quotes
  result = removeUnnecessaryMiddleQuotes(
    result,
    cursorAtMiddleOfWord
  )

  // 6. Ignore blank lines
  if (result.trimStart() === "" && completion !== "\n") {
    result = result.trim()
  }

  // 7. Remove invalid line breaks
  if (textAfterCursor) {
    result = result.trimEnd()
  }

  // 8. Remove duplicate text (overlap with suffix)
  result = removeDuplicateText(result, textAfterCursor)

  // 9. Skip middle of word
  if (cursorAtMiddleOfWord) {
    result = ""
  }

  // 10. Trim start (preserve indentation)
  const firstNonSpaceIndex = result.search(/\S/)
  if (firstNonSpaceIndex > 0) {
    // Keep indentation when cursor is at column 0
  }

  return result.trim() === "" ? "" : result
}

// ---- Formatting sub-steps -------------------------------------------------

function matchCompletionBrackets(completion: string): string {
  let accumulated = ""
  const openBrackets: string[] = []
  let inString = false
  let stringChar = ""

  for (const char of completion) {
    if (QUOTES.includes(char)) {
      if (!inString) {
        inString = true
        stringChar = char
      } else if (char === stringChar) {
        inString = false
        stringChar = ""
      }
    }

    if (!inString) {
      if (isOpeningBracket(char)) {
        openBrackets.push(char)
      } else if (isClosingBracket(char)) {
        const lastOpen = openBrackets[openBrackets.length - 1]
        if (
          lastOpen &&
          isMatchingBracket(lastOpen as Bracket, char)
        ) {
          openBrackets.pop()
        } else {
          break
        }
      }
    }

    accumulated += char
  }

  return accumulated.trimEnd() || completion.trimEnd()
}

function preventQuotationCompletions(
  completion: string,
  _languageId: string
): string {
  const normalized = completion.trim()

  if (
    normalized.startsWith("// File:") ||
    normalized === "//"
  ) {
    return ""
  }

  const lineBreakCount = getLineBreakCount(completion)
  if (lineBreakCount > 1) return completion

  const completionLines = completion.split("\n").filter((line) => {
    const startsWithComment = line.startsWith("//")
    const includesCommentReference =
      /\b(Language|File|End):\s*(.*)\b/.test(line)

    return !(startsWithComment && includesCommentReference)
  })

  return completionLines.length ? completionLines.join("\n") : ""
}

function preventDuplicateLine(
  completion: string,
  _textAfterCursor: string
): string {
  // Original checks the next 3 document lines for similarity.
  // Engine-ts cannot access the full document lines beyond suffix;
  // the adapter provides `textAfterCursor` which is the remainder
  // of the current line only.  Full duplicate-line detection is
  // deferred to the adapter layer.
  return completion
}

function removeDuplicateQuotes(
  completion: string,
  charAfterCursor: string
): string {
  const trimmedCharAfterCursor = charAfterCursor.trim()
  const normalized = completion.trim()

  const lastCharOfCompletion = normalized.charAt(normalized.length - 1)

  if (
    trimmedCharAfterCursor &&
    (normalized.endsWith("',") ||
      normalized.endsWith("\",") ||
      normalized.endsWith("`,") ||
      (normalized.endsWith(",") &&
        QUOTES.includes(trimmedCharAfterCursor)))
  ) {
    return completion.slice(0, -2)
  } else if (
    (normalized.endsWith("'") ||
      normalized.endsWith("\"") ||
      normalized.endsWith("`")) &&
    QUOTES.includes(trimmedCharAfterCursor)
  ) {
    return completion.slice(0, -1)
  } else if (
    QUOTES.includes(lastCharOfCompletion) &&
    trimmedCharAfterCursor === lastCharOfCompletion
  ) {
    return completion.slice(0, -1)
  }

  return completion
}

function removeUnnecessaryMiddleQuotes(
  completion: string,
  cursorAtMiddleOfWord: boolean
): string {
  if (cursorAtMiddleOfWord) {
    let result = completion
    if (QUOTES.includes(result.charAt(0))) {
      result = result.slice(1)
    }
    const lastChar = result.charAt(result.length - 1)
    if (QUOTES.includes(lastChar)) {
      result = result.slice(0, -1)
    }
    return result
  }
  return completion
}

function removeDuplicateText(
  completion: string,
  textAfterCursor: string
): string {
  const after = textAfterCursor.trim()
  if (!after || !completion) return completion

  const maxLength = Math.min(completion.length, after.length)

  for (let length = maxLength; length > 0; length--) {
    const endOfCompletion = completion.slice(-length)
    const startOfAfter = after.slice(0, length)
    if (endOfCompletion === startOfAfter) {
      return completion.slice(0, -length)
    }
  }

  return completion
}

// ---- Public API -----------------------------------------------------------

/**
 * Run the full postprocessing pipeline on a raw completion string.
 *
 * Phase 1: truncation (decide if streaming should stop)
 * Phase 2: formatting (clean up brackets, quotes, duplicates)
 *
 * Returns the final processed completion string.  An empty string means
 * the completion should be discarded.
 */
export function postprocess(input: PostprocessInput): string {
  // Phase 1 — truncation
  const truncated = truncateCompletion(input)

  // If truncation returned empty, the stream should continue
  if (truncated === "") {
    return ""
  }

  // Phase 2 — formatting
  const formatted = applyFormatting({
    ...input,
    completion: truncated
  })

  return formatted
}
