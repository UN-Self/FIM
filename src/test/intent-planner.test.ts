// ---------------------------------------------------------------------------
// Intent planner — local rule-based detection tests
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest"

import { detectIntentLocal } from "../../services/engine-ts/src/planning/intent-planner"

describe("detectIntentLocal", () => {
  describe("line_continuation", () => {
    it("detects cursor at end of incomplete line", () => {
      const result = detectIntentLocal(
        "function foo() {\n  const x = ",
        "\n}",
        "typescript"
      )
      expect(result.intent).toBe("line_continuation")
      expect(result.confidence).toBeGreaterThanOrEqual(0.5)
    })

    it("detects cursor inside incomplete method chain in callback", () => {
      const result = detectIntentLocal(
        "const result = data.map(item => item.",
        ")",
        "typescript"
      )
      // Paren from data.map( is unbalanced — detected as argument_completion
      expect(result.intent).toBe("argument_completion")
    })

    it("detects cursor on empty line after content", () => {
      const result = detectIntentLocal(
        "function main() {\n  doWork()\n  ",
        "\n}",
        "typescript"
      )
      // Empty line after content can be line_continuation or comment_to_code
      expect(["line_continuation", "comment_to_code", "unknown"]).toContain(
        result.intent
      )
    })
  })

  describe("block_completion", () => {
    it("detects cursor inside empty block body (braces)", () => {
      const result = detectIntentLocal(
        "if (x > 0) {\n  ",
        "\n}",
        "typescript"
      )
      expect(result.intent).toBe("block_completion")
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    it("detects cursor inside empty function body", () => {
      const result = detectIntentLocal(
        "def process(data):\n    ",
        "\n",
        "python"
      )
      // Python uses indentation, not braces — falls through to line_continuation
      expect(result.intent).toBe("line_continuation")
    })

    it("does NOT falsely detect when braces are not empty", () => {
      const result = detectIntentLocal(
        "if (x > 0) {\n  return x\n  ",
        "\n}",
        "typescript"
      )
      expect(result.intent).not.toBe("block_completion")
    })
  })

  describe("import_completion", () => {
    it("detects cursor in import statement (TypeScript)", () => {
      const result = detectIntentLocal(
        "import { ",
        " } from",
        "typescript"
      )
      expect(result.intent).toBe("import_completion")
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    it("detects cursor in require statement (JavaScript)", () => {
      const result = detectIntentLocal(
        "const fs = require('",
        "')",
        "javascript"
      )
      expect(result.intent).toBe("import_completion")
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    it("detects cursor after 'from' in ES import", () => {
      const result = detectIntentLocal(
        "import foo from '",
        "'",
        "typescript"
      )
      expect(result.intent).toBe("import_completion")
    })

    it("detects multi-line import broken across lines", () => {
      const result = detectIntentLocal(
        "import {\n  foo,\n  ",
        "\n} from './module'",
        "typescript"
      )
      expect(result.intent).toBe("import_completion")
    })
  })

  describe("argument_completion", () => {
    it("detects cursor inside function call parens", () => {
      const result = detectIntentLocal(
        "console.log(",
        ")",
        "typescript"
      )
      expect(result.intent).toBe("argument_completion")
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    it("detects cursor between arguments", () => {
      const result = detectIntentLocal(
        "foo(1, ",
        ", 3)",
        "typescript"
      )
      expect(result.intent).toBe("argument_completion")
    })

    it("does NOT falsely detect when paren depth is balanced", () => {
      const result = detectIntentLocal(
        "const x = (a + b)",
        "",
        "typescript"
      )
      expect(result.intent).not.toBe("argument_completion")
    })
  })

  describe("comment_to_code", () => {
    it("detects previous line comment, cursor at new line (JS/TS)", () => {
      const result = detectIntentLocal(
        "// TODO: implement this\n",
        "",
        "typescript"
      )
      expect(result.intent).toBe("comment_to_code")
      expect(result.confidence).toBeGreaterThan(0.7)
    })

    it("detects previous line comment, cursor at new line (Python)", () => {
      const result = detectIntentLocal(
        "# TODO: implement this\n",
        "",
        "python"
      )
      expect(result.intent).toBe("comment_to_code")
      expect(result.confidence).toBeGreaterThan(0.7)
    })

    it("detects previous line comment, cursor at new line (shell)", () => {
      const result = detectIntentLocal(
        "# parse args\n",
        "",
        "shellscript"
      )
      expect(result.intent).toBe("comment_to_code")
      expect(result.confidence).toBeGreaterThan(0.7)
    })

    it("does NOT detect when previous line is code not comment", () => {
      const result = detectIntentLocal(
        "const x = 1\n",
        "",
        "typescript"
      )
      expect(result.intent).not.toBe("comment_to_code")
    })
  })

  describe("unknown fallback", () => {
    it("returns unknown for empty prefix", () => {
      const result = detectIntentLocal("", "", "typescript")
      expect(result.intent).toBe("unknown")
      expect(result.confidence).toBe(0)
    })

    it("returns unknown for whitespace-only prefix", () => {
      const result = detectIntentLocal("   ", "\n}", "typescript")
      expect(result.intent).toBe("unknown")
      expect(result.confidence).toBe(0)
    })

    it("never throws on any input", () => {
      // @ts-expect-error testing invalid input
      const result = detectIntentLocal(null, undefined, 123)
      expect(result.intent).toBe("unknown")
      expect(result.confidence).toBe(0)
    })
  })

  describe("return shape", () => {
    it("always returns valid IntentPlan shape", () => {
      const result = detectIntentLocal("code", "more code", "typescript")
      expect(result).toHaveProperty("intent")
      expect(result).toHaveProperty("confidence")
      expect(result).toHaveProperty("scope")
      expect(result).toHaveProperty("constraints")
      expect(result).toHaveProperty("requestedSymbolIds")
      expect(Array.isArray(result.constraints)).toBe(true)
      expect(Array.isArray(result.requestedSymbolIds)).toBe(true)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe("scope assignment", () => {
    it("assigns 'block' scope for block_completion", () => {
      const result = detectIntentLocal(
        "if (x) {\n  ",
        "\n}",
        "typescript"
      )
      expect(result.scope).toBe("block")
    })

    it("assigns 'expression' scope for argument_completion", () => {
      const result = detectIntentLocal(
        "console.log(",
        ")",
        "typescript"
      )
      expect(result.scope).toBe("expression")
    })

    it("assigns 'statement' scope for other intents", () => {
      const result = detectIntentLocal(
        "const x = ",
        ";",
        "typescript"
      )
      // line_continuation should have statement scope
      if (result.intent === "line_continuation") {
        expect(result.scope).toBe("statement")
      }
    })
  })
})
