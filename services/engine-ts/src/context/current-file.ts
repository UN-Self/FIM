// ---------------------------------------------------------------------------
// Current-file context extraction (VS Code-free)
//
// Extracted from `src/extension/utils.ts` `getPrefixSuffix()`.
// Takes raw document text + cursor position and returns the prefix/suffix
// pair that forms the core of every FIM prompt.
// ---------------------------------------------------------------------------

import { CursorPosition, PrefixSuffix } from "../types"

/**
 * Extract prefix and suffix text from a document given a cursor position
 * and a target total line count.
 *
 * `contextRatio` controls how the total lines are split between prefix
 * and suffix.  The default `[0.85, 0.15]` allocates 85 % to prefix and
 * 15 % to suffix.
 *
 * This is a pure function — it operates on plain strings and numbers so
 * it can be tested without any editor or filesystem mock.
 */
export function extractPrefixSuffix(
  documentText: string,
  cursor: CursorPosition,
  numLines: number,
  contextRatio: [number, number] = [0.85, 0.15]
): PrefixSuffix {
  const lines = documentText.split("\n")
  const currentLine = cursor.line
  const totalLines = lines.length

  let numLinesPrefix = Math.floor(Math.abs(numLines * contextRatio[0]))
  let numLinesSuffix = Math.ceil(Math.abs(numLines * contextRatio[1]))

  // Clamp prefix to available lines above cursor
  if (numLinesPrefix > currentLine) {
    numLinesSuffix += numLinesPrefix - currentLine
    numLinesPrefix = currentLine
  }

  // Clamp suffix to available lines below cursor
  const numLinesToEnd = totalLines - currentLine
  if (numLinesSuffix > numLinesToEnd) {
    numLinesPrefix += numLinesSuffix - numLinesToEnd
    numLinesSuffix = numLinesToEnd
  }

  const prefixStartLine = Math.max(0, currentLine - numLinesPrefix)
  const suffixEndLine = currentLine + numLinesSuffix

  // Prefix: from `prefixStartLine` up to (but not including) the cursor
  // character on the current line.
  const prefixLines = lines.slice(prefixStartLine, currentLine)
  const prefixPartial =
    lines[currentLine]?.substring(0, cursor.character) ?? ""
  const prefix = [...prefixLines, prefixPartial].join("\n")

  // Suffix: from the cursor character on the current line through
  // `suffixEndLine`.
  const suffixPartial =
    lines[currentLine]?.substring(cursor.character) ?? ""
  const suffixLines = lines.slice(currentLine + 1, suffixEndLine)
  const suffix = [suffixPartial, ...suffixLines].join("\n")

  return { prefix, suffix }
}
