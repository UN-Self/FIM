// ---------------------------------------------------------------------------
// Prompt builder tests — fixed skeleton with intent & context support
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest"

import { buildFimPrompt } from "../../services/engine-ts/src/prompt/builder"

// Local type mirrors for test construction (no runtime import needed)
interface ContextChunk {
  filePath: string
  text: string
  symbolId?: string
  relevanceScore?: number
  reason?: string
}

interface GraphEvidence {
  symbolId: string
  filePath: string
  relation: "definition" | "caller" | "callee" | "reference" | "import"
  signature?: string
  freshness: "fresh" | "stale"
  provenance: "codegraph"
}

interface IntentPlan {
  intent: string
  confidence: number
  scope: "expression" | "statement" | "block" | "function"
  constraints: string[]
  requestedSymbolIds: string[]
}

describe("buildFimPrompt", () => {
  // ---- Baseline (backward compatibility) -----------------------------------

  describe("baseline behavior", () => {
    it("returns prompt/suffix shape with prefix content", () => {
      const result = buildFimPrompt({
        prefix: "function hello() {",
        suffix: "\n  return"
      })
      expect(result).toHaveProperty("prompt")
      expect(result).toHaveProperty("suffix")
      expect(typeof result.prompt).toBe("string")
      expect(typeof result.suffix).toBe("string")
    })

    it("does NOT include FIM special tokens in output", () => {
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after"
      })
      expect(result.prompt).not.toContain("<｜fim▁begin｜>")
      expect(result.prompt).not.toContain("<｜fim▁hole｜>")
      expect(result.prompt).not.toContain("<｜fim▁end｜>")
      expect(result.suffix).not.toContain("<｜fim▁begin｜>")
    })

    it("passes suffix through unchanged", () => {
      const result = buildFimPrompt({
        prefix: "a",
        suffix: "}"
      })
      expect(result.suffix).toBe("}")
    })

    it("includes prefix in prompt", () => {
      const result = buildFimPrompt({
        prefix: "const x = 1\n",
        suffix: "}"
      })
      expect(result.prompt).toContain("const x = 1")
    })

    it("applies fileContextEnabled with language comment wrapping", () => {
      const result = buildFimPrompt({
        prefix: "function hello() {",
        suffix: "\n  return",
        context: "extra context here",
        fileContextEnabled: true,
        language: "typescript"
      })
      expect(result.prompt).toContain("/*")
      expect(result.prompt).toContain("*/")
      expect(result.prompt).toContain("extra context here")
    })

    it("prepends header before prefix", () => {
      const result = buildFimPrompt({
        prefix: "function hello() {",
        suffix: "\n  return",
        header: "// MyFile.ts"
      })
      expect(result.prompt).toContain("// MyFile.ts")
      expect(result.prompt.indexOf("// MyFile.ts")).toBeLessThan(
        result.prompt.indexOf("function hello()")
      )
    })

    it("handles empty context with header cleanly", () => {
      const result = buildFimPrompt({
        prefix: "function hello() {",
        suffix: "\n  return",
        header: ""
      })
      expect(result.prompt.trim()).toBe(result.prompt.trim())
      expect(result.prompt.length).toBeGreaterThan(0)
    })

    it("handles unknown language gracefully", () => {
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after",
        context: "some context",
        fileContextEnabled: true,
        language: "nonexistent-lang"
      })
      expect(result.prompt).toContain("some context")
    })
  })

  // ---- Phase 4: context chunks --------------------------------------------

  describe("contextChunks", () => {
    const chunks: ContextChunk[] = [
      {
        filePath: "/src/utils.ts",
        text: "export function helper() { return 42 }",
        reason: "imported by current file"
      },
      {
        filePath: "/src/types.ts",
        text: "interface Config { timeout: number }",
        symbolId: "Config"
      }
    ]

    it("includes context chunks in prompt output", () => {
      const result = buildFimPrompt({
        prefix: "function main() {",
        suffix: "\n}",
        contextChunks: chunks
      })
      expect(result.prompt).toContain("utils.ts")
      expect(result.prompt).toContain("helper() { return 42 }")
      expect(result.prompt).toContain("types.ts")
      expect(result.prompt).toContain("interface Config")
    })

    it("does NOT include chunk text when contextChunks is empty", () => {
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after",
        contextChunks: []
      })
      expect(result.prompt).toBe("code")
    })

    it("wraps chunks in comments when fileContextEnabled", () => {
      const result = buildFimPrompt({
        prefix: "function main() {",
        suffix: "\n}",
        contextChunks: chunks,
        fileContextEnabled: true,
        language: "typescript"
      })
      // Should have comment delimiters around chunk content
      expect(result.prompt).toContain("/*")
      expect(result.prompt).toContain("*/")
      expect(result.prompt).toContain("utils.ts")
    })
  })

  // ---- Phase 4: graph evidence --------------------------------------------

  describe("graphEvidence", () => {
    const evidence: GraphEvidence[] = [
      {
        symbolId: "userLogin",
        filePath: "/src/auth.ts",
        relation: "callee",
        signature: "function userLogin(cred: Credentials): Promise<User>",
        freshness: "fresh",
        provenance: "codegraph"
      },
      {
        symbolId: "User",
        filePath: "/src/models/user.ts",
        relation: "definition",
        signature: "class User",
        freshness: "fresh",
        provenance: "codegraph"
      }
    ]

    it("includes evidence in prompt output", () => {
      const result = buildFimPrompt({
        prefix: "function main() {",
        suffix: "\n}",
        graphEvidence: evidence
      })
      expect(result.prompt).toContain("Related symbols")
      expect(result.prompt).toContain("userLogin")
      expect(result.prompt).toContain("User")
      expect(result.prompt).toContain("auth.ts")
    })

    it("includes relation and freshness in evidence", () => {
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after",
        graphEvidence: evidence
      })
      expect(result.prompt).toContain("callee")
      expect(result.prompt).toContain("fresh")
    })
  })

  // ---- Phase 4: intent plan -----------------------------------------------

  describe("intentPlan", () => {
    const plan: IntentPlan = {
      intent: "block_completion",
      confidence: 0.9,
      scope: "block",
      constraints: ["use lodash for collection operations", "keep under 10 lines"],
      requestedSymbolIds: ["userLogin", "sessionStore"]
    }

    it("includes intent info in prompt output", () => {
      const result = buildFimPrompt({
        prefix: "function authenticate() {",
        suffix: "\n}",
        intentPlan: plan
      })
      expect(result.prompt).toContain("Intent: block_completion")
      expect(result.prompt).toContain("Confidence: 0.90")
      expect(result.prompt).toContain("Scope: block")
    })

    it("includes constraints in prompt output", () => {
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after",
        intentPlan: plan
      })
      expect(result.prompt).toContain("use lodash for collection operations")
      expect(result.prompt).toContain("keep under 10 lines")
    })

    it("includes requestedSymbolIds in prompt output", () => {
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after",
        intentPlan: plan
      })
      expect(result.prompt).toContain("userLogin")
      expect(result.prompt).toContain("sessionStore")
    })

    it("does NOT include intent block when intentPlan has no constraints", () => {
      const emptyPlan: IntentPlan = {
        intent: "unknown",
        confidence: 0,
        scope: "statement",
        constraints: [],
        requestedSymbolIds: []
      }
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after",
        intentPlan: emptyPlan
      })
      // No constraints → intent block should NOT appear
      // But confidence/is still shown
      expect(result.prompt).toBe("code")
    })

    it("wraps intent block in comments when fileContextEnabled", () => {
      const result = buildFimPrompt({
        prefix: "function main() {",
        suffix: "\n}",
        intentPlan: plan,
        fileContextEnabled: true,
        language: "typescript"
      })
      expect(result.prompt).toContain("/*")
      expect(result.prompt).toContain("Intent:")
      expect(result.prompt).toContain("*/")
    })
  })

  // ---- Phase 4: combined (all features) -----------------------------------

  describe("combined context + evidence + intent", () => {
    const chunks: ContextChunk[] = [
      {
        filePath: "/src/helpers.ts",
        text: "export const MAX_RETRIES = 3",
        reason: "local usage"
      }
    ]
    const evidence: GraphEvidence[] = [
      {
        symbolId: "auth",
        filePath: "/src/auth.ts",
        relation: "callee",
        freshness: "fresh",
        provenance: "codegraph"
      }
    ]
    const plan: IntentPlan = {
      intent: "function_completion" as any, /* test will pass string through */
      confidence: 0.8,
      scope: "function",
      constraints: ["return a Promise<User>"],
      requestedSymbolIds: []
    }

    it("assembles everything in the fixed skeleton order", () => {
      const result = buildFimPrompt({
        prefix: "function login(",
        suffix: "\n}",
        contextChunks: chunks,
        graphEvidence: evidence,
        intentPlan: plan,
        fileContextEnabled: false,
        language: "typescript",
        header: "// auth.ts"
      })

      // The output should contain all pieces
      expect(result.prompt).toContain("MAX_RETRIES")
      expect(result.prompt).toContain("auth")
      expect(result.prompt).toContain("Intent:")
      expect(result.prompt).toContain("// auth.ts")
      expect(result.prompt).toContain("function login(")

      // Project context (intent + evidence + chunks) should come before header/prefix
      const intentIndex = result.prompt.indexOf("Intent:")
      const headerIndex = result.prompt.indexOf("// auth.ts")
      const prefixIndex = result.prompt.indexOf("function login(")
      expect(intentIndex).toBeLessThan(headerIndex)
      expect(headerIndex).toBeLessThan(prefixIndex)
    })

    it("prefix is always the last piece in the prompt", () => {
      const result = buildFimPrompt({
        prefix: "const x = 1",
        suffix: ";",
        intentPlan: {
          intent: "line_continuation",
          confidence: 0.9,
          scope: "statement",
          constraints: ["use const"],
          requestedSymbolIds: []
        }
      })
      expect(result.prompt).toMatch(/const x = 1$/)
    })
  })

  // ---- Edge cases ---------------------------------------------------------

  describe("edge cases", () => {
    it("handles undefined contextChunks gracefully", () => {
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after",
        contextChunks: undefined
      })
      expect(result.prompt).toBe("code")
    })

    it("handles undefined graphEvidence gracefully", () => {
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after",
        graphEvidence: undefined
      })
      expect(result.prompt).toBe("code")
    })

    it("handles undefined intentPlan gracefully", () => {
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after",
        intentPlan: undefined
      })
      expect(result.prompt).toBe("code")
    })

    it("handles all optional fields undefined", () => {
      const result = buildFimPrompt({
        prefix: "hello",
        suffix: "world"
      })
      expect(result.prompt).toBe("hello")
      expect(result.suffix).toBe("world")
    })

    it("does not duplicate or mix context and contextChunks", () => {
      // context is the legacy field (requires fileContextEnabled)
      // contextChunks is Phase 4 (always included)
      const result = buildFimPrompt({
        prefix: "code",
        suffix: "after",
        context: "legacy context",       // only appears when fileContextEnabled=true
        contextChunks: [
          { filePath: "f.ts", text: "chunk context" }
        ],
        fileContextEnabled: false,
        language: "typescript"
      })
      // Phase 4 contextChunks appear unconditionally
      expect(result.prompt).toContain("chunk context")
      // legacy context requires fileContextEnabled; absent here
      expect(result.prompt).not.toContain("legacy context")
    })
  })
})
