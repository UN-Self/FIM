import { describe, expect, it } from "vitest"

import { truncateCompletion } from "../../src/extension/postprocessor"
import type { TruncateArgs } from "../../src/extension/postprocessor"
import type { PrefixSuffix } from "../../src/common/types"
import type Parser from "web-tree-sitter"
import type { SyntaxNode } from "web-tree-sitter"
import { Position } from "../test/__mocks__/vscode"

// Helper to build minimal TruncateArgs
function makeArgs(overrides: Partial<TruncateArgs> = {}): TruncateArgs {
  return {
    completion: "",
    providerFimData: "",
    chunkCount: 0,
    providerModelName: "deepseek-chat",
    providerFimTemplate: "deepseek",
    nodeAtPosition: null,
    parser: undefined,
    position: null,
    prefixSuffix: { prefix: "", suffix: "" },
    isMultilineCompletion: false,
    multilineCompletionsEnabled: false,
    maxLines: 40,
    ...overrides
  }
}

describe("truncateCompletion", () => {
  describe("empty / trivial input", () => {
    it("returns empty string for empty completion with default args", () => {
      const result = truncateCompletion(makeArgs({ completion: "" }))
      expect(result).toBe("")
    })

    it("returns whitespace-only completion when below MAX_EMPTY_COMPLETION_CHARS", () => {
      const spaces = " ".repeat(100)
      // maxLines is 40, getLineBreakCount(spaces) = 1, which is < 40, so returns ""
      const result = truncateCompletion(makeArgs({ completion: spaces }))
      expect(result).toBe("")
    })

    it("returns whitespace completion when above MAX_EMPTY_COMPLETION_CHARS (250)", () => {
      const spaces = " ".repeat(300)
      // result.length > 250 and result.trim().length === 0 → returns result
      const result = truncateCompletion(makeArgs({ completion: spaces }))
      expect(result).toBe(spaces)
    })
  })

  describe("stop words", () => {
    it("returns completion that contains stop words", () => {
      const completion = "some code <｜fim▁end｜>"
      const result = truncateCompletion(makeArgs({ completion }))
      // Contains stop word → returns result (the completion itself, early return)
      expect(result).toBe(completion)
    })

    it("does not falsely match stop words", () => {
      const completion = "no stop tokens here, just code"
      // This may still be empty due to other checks, but it should NOT match stop words
      const result = truncateCompletion(makeArgs({
        completion,
        maxLines: 999
      }))
      // With high maxLines, line break count won't trigger the final guard
      // Without any stop words or AST, it will fall to maxLines check
      // getLineBreakCount("no stop tokens here, just code") = 1 < 999 → returns ""
      expect(result).toBe("")
    })
  })

  describe("multiline guard (no multiline enabled)", () => {
    it("returns completion when NOT multiline enabled and chunkCount >= 2 with line breaks", () => {
      const completion = "line1\nline2\n"
      const result = truncateCompletion(makeArgs({
        completion,
        chunkCount: 2,
        multilineCompletionsEnabled: false
      }))
      // LINE_BREAK_REGEX.test("line1\nline2\n".trimStart()) = true
      // chunkCount >= MIN_COMPLETION_CHUNKS (2) → returns result
      expect(result).toBe(completion)
    })

    it("passes through single-line when not multiline", () => {
      const completion = "singleLineCompletion"
      const result = truncateCompletion(makeArgs({
        completion,
        chunkCount: 2,
        multilineCompletionsEnabled: false,
        maxLines: 999
      }))
      // No line breaks → no multiline guard match → reaches maxLines
      expect(result).toBe("")
    })
  })

  describe("multiline required guard", () => {
    it("returns result when multiline is enabled, chunkCount >= 2, and has line breaks, but !isMultilineCompletion", () => {
      const completion = "a\nb\nc"
      const result = truncateCompletion(makeArgs({
        completion,
        chunkCount: 3,
        multilineCompletionsEnabled: true,
        isMultilineCompletion: false
      }))
      // isMultilineCompletionRequired → true → returns result
      expect(result).toBe(completion)
    })
  })

  describe("balanced brackets", () => {
    it("empty result when completion is just balanced brackets with no substantial content", () => {
      // balanced brackets, but no substantial content or end pattern
      const completion = "{}"
      // This has no line breaks, so providerFimData.includes("\n") is false, AST branch not entered.
      // Falls to maxLines check. getLineBreakCount("{}") = 1 < 40 → returns ""
      const result = truncateCompletion(makeArgs({ completion }))
      expect(result).toBe("")
    })
  })

  describe("maxLines guard", () => {
    it("returns empty string when line count is less than maxLines (no prior early return)", () => {
      const completion = "abc"
      const result = truncateCompletion(makeArgs({
        completion,
        maxLines: 100
      }))
      expect(result).toBe("")
    })

    it("returns completion when line count equals or exceeds maxLines", () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line${i}`).join("\n")
      const result = truncateCompletion(makeArgs({
        completion: lines,
        maxLines: 40
      }))
      expect(result).toBe(lines)
    })
  })

  describe("combined scenarios", () => {
    it("multi-line completion with balanced brackets and end pattern returns result", () => {
      // This tests the AST branch when providerFimData contains newlines
      const completion = "const x = 1;\nconst y = 2;\n}"
      const result = truncateCompletion(makeArgs({
        completion,
        providerFimData: "const x = 1;\nconst y = 2;\n}",
        chunkCount: 3,
        isMultilineCompletion: true,
        multilineCompletionsEnabled: true,
        multilineCompletionsEnabled: true,
        maxLines: 40
      }))
      // Without a parser/nodeAtPosition, the AST branch won't enter
      // It will fall through to maxLines check
      // getLineBreakCount(completion) = 3 < 40
      expect(result).toBe("")
    })

    it("returns result when line breaks reach maxLines threshold", () => {
      const lines = Array.from({ length: 41 }, (_, i) => `line${i}`).join("\n")
      const result = truncateCompletion(makeArgs({
        completion: lines,
        maxLines: 40
      }))
      // getLineBreakCount >= maxLines → returns result
      expect(result).toBe(lines)
    })

    it("handles mixed whitespace and line breaks", () => {
      const completion = "  \n  \n  "
      // whitespace-only, length 9 < 250 → not caught by MAX_EMPTY_COMPLETION_CHARS
      // No stop words, no multiline, no multiline required
      // No providerFimData newline → skip AST
      // getLineBreakCount = 3 < 40 → returns ""
      const result = truncateCompletion(makeArgs({
        completion,
        maxLines: 40
      }))
      expect(result).toBe("")
    })
  })
})
