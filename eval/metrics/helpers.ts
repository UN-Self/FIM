// ---------------------------------------------------------------------------
// Shared metric helpers — extracted from metrics-v2.ts to avoid duplication
// with layer2_syntax.ts and across the new metric layers.
// ---------------------------------------------------------------------------

/**
 * Check bracket balance in a code string.
 * Mirrors layer2_syntax.ts:16-26 — keep both in sync.
 */
export function checkBracketBalance(text: string): boolean {
  const stack: string[] = []
  const pairs: Record<string, string> = { "]": "[", "}": "{", ")": "(" }
  for (const char of text) {
    if (["[", "{", "("].includes(char)) stack.push(char)
    else if (["]", "}", ")"].includes(char)) {
      if (stack.pop() !== pairs[char]) return false
    }
  }
  return stack.length === 0
}

/**
 * Suffix alignment: longest common substring between completion end and suffix start,
 * normalized to [0,1]. Higher = completion flows cleanly into suffix.
 */
export function computeSuffixAlignment(completion: string, suffix: string): number {
  if (!completion || !suffix) return 1
  const minLen = Math.min(completion.length, suffix.length)
  let matchLen = 0
  for (let i = 1; i <= minLen; i++) {
    if (completion.slice(-i) === suffix.slice(0, i)) matchLen = i
  }
  return matchLen / Math.min(completion.length, 20)
}

/**
 * Duplication rate: fraction of suffix tokens that already appear in the completion.
 * Lower is better — duplication means the model is regurgitating existing code.
 */
export function computeDuplicationRate(completion: string, suffix: string): number {
  if (!completion || !suffix) return 0
  const trimmedSuffix = suffix.trim()
  const trimmedCompletion = completion.trim()
  if (!trimmedSuffix || !trimmedCompletion) return 0

  const completionTokens = new Set(trimmedCompletion.split(/\s+/))
  const suffixTokens = trimmedSuffix.split(/\s+/)
  const overlap = suffixTokens.filter((t) => completionTokens.has(t)).length
  return suffixTokens.length > 0 ? overlap / suffixTokens.length : 0
}
