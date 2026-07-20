// ---------------------------------------------------------------------------
// Shared pure-utility functions
//
// Extracted from `src/webview/utils.ts` — zero VS Code dependencies.
// These are deliberately kept as standalone functions (not a class) so
// every engine module can import them without ceremony.
// ---------------------------------------------------------------------------

/**
 * Count the number of lines in `str` by splitting on `\n`.
 *
 * A single-line string returns 1; an empty string returns 1.
 */
export function getLineBreakCount(str: string): number {
  return str.split("\n").length
}

/**
 * Convert a kebab-case identifier into Title Case.
 *
 *   kebabToSentence("hello-world")  // "Hello world"
 *   kebabToSentence("")             // ""
 */
export function kebabToSentence(kebabStr: string): string {
  if (!kebabStr) {
    return ""
  }

  const words = kebabStr.split("-")

  if (!words.length) {
    return kebabStr
  }

  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)

  return words.join(" ")
}

/**
 * Truncate a model name to at most 40 characters for display purposes.
 *
 *   getModelShortName("deepseek-chat")             // "deepseek-chat"
 *   getModelShortName("a-very-long-model-name-...") // "a-very-long-model-name-..."
 */
export function getModelShortName(name: string): string {
  if (name.length > 40) {
    return `${name.substring(0, 35)}...`
  }
  return name
}

/**
 * Extract a `<think>` / `<thinking>` block from the start of a model
 * response, returning the thinking text and the remainder separately.
 *
 * Returns `{ thinking: null, message: content }` when no block is present.
 */
export function getThinkingMessage(content: string): {
  thinking: string | null
  message: string
} {
  const thinkMatch = content.match(
    /<(?:think|thinking)>([\s\S]*?)(?:<\/(?:think|thinking)>|$)/
  )
  if (!thinkMatch) return { thinking: null, message: content }

  const thinking = thinkMatch[1].trim()
  const message = content
    .replace(
      /<(?:think|thinking)>[\s\S]*?(?:<\/(?:think|thinking)>|$)/,
      ""
    )
    .trim()
  return { thinking, message }
}

// ---- SSE / JSON helpers (extracted from src/extension/utils.ts) -----------

/**
 * Check whether `stringBuffer` is an SSE `data:` line.
 */
export function isStreamWithDataPrefix(stringBuffer: string): boolean {
  return stringBuffer.startsWith("data:")
}

/**
 * Safely parse an SSE line as JSON, stripping the optional `data:` prefix.
 *
 * Returns `undefined` when the line is not valid JSON (no throw).
 */
export function safeParseJsonResponse<T = Record<string, unknown>>(
  stringBuffer: string
): T | undefined {
  try {
    if (isStreamWithDataPrefix(stringBuffer)) {
      return JSON.parse(stringBuffer.split("data:")[1])
    }
    return JSON.parse(stringBuffer)
  } catch {
    return undefined
  }
}
