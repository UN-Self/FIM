// ---------------------------------------------------------------------------
// Plan validator tests
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest"

import { validatePlan } from "../../services/engine-ts/src/planning/plan-validator"

// Local type mirrors for test construction (no runtime import needed)
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

function makePlan(overrides: Partial<IntentPlan> = {}): IntentPlan {
  return {
    intent: "block_completion",
    confidence: 0.9,
    scope: "block",
    constraints: [],
    requestedSymbolIds: [],
    ...overrides
  }
}

function makeEvidence(
  overrides: Partial<GraphEvidence> = {}
): GraphEvidence {
  return {
    symbolId: "testSymbol",
    filePath: "/src/test.ts",
    relation: "definition",
    freshness: "fresh",
    provenance: "codegraph",
    ...overrides
  }
}

describe("validatePlan", () => {
  describe("requestedSymbolIds validation", () => {
    it("removes symbols not present in evidence", () => {
      const plan = makePlan({
        requestedSymbolIds: ["exists", "missing"]
      })
      const evidence = [
        makeEvidence({ symbolId: "exists" })
      ]
      const result = validatePlan(plan, evidence)
      expect(result.valid).toBe(true)
      expect(plan.requestedSymbolIds).toEqual(["exists"])
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain("Removed 1")
    })

    it("keeps all symbols when all are present", () => {
      const plan = makePlan({
        requestedSymbolIds: ["a", "b"]
      })
      const evidence = [
        makeEvidence({ symbolId: "a" }),
        makeEvidence({ symbolId: "b" })
      ]
      const result = validatePlan(plan, evidence)
      expect(result.valid).toBe(true)
      expect(plan.requestedSymbolIds).toEqual(["a", "b"])
      expect(result.warnings.length).toBe(0)
    })

    it("handles empty requestedSymbolIds", () => {
      const plan = makePlan({ requestedSymbolIds: [] })
      const result = validatePlan(plan, [])
      expect(result.valid).toBe(true)
      expect(plan.requestedSymbolIds).toEqual([])
    })

    it("removes all when none exist in evidence", () => {
      const plan = makePlan({
        requestedSymbolIds: ["nonexistent"]
      })
      const result = validatePlan(plan, [])
      expect(result.valid).toBe(true)
      expect(plan.requestedSymbolIds).toEqual([])
    })
  })

  describe("scope validation", () => {
    it("downgrades scope when it exceeds max allowed", () => {
      const plan = makePlan({ scope: "function" })
      const result = validatePlan(plan, [], "statement")
      // Plan should still be valid, but scope downgraded
      expect(plan.scope).toBe("statement")
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it("allows scope equal to max allowed", () => {
      const plan = makePlan({ scope: "block" })
      const result = validatePlan(plan, [], "block")
      expect(result.valid).toBe(true)
      expect(plan.scope).toBe("block")
      expect(result.warnings.length).toBe(0)
    })

    it("allows scope narrower than max allowed", () => {
      const plan = makePlan({ scope: "expression" })
      const result = validatePlan(plan, [], "function")
      expect(result.valid).toBe(true)
      expect(plan.scope).toBe("expression")
      expect(result.warnings.length).toBe(0)
    })

    it("defaults maxScope to function when not provided", () => {
      const plan = makePlan({ scope: "function" })
      const result = validatePlan(plan, [])
      expect(result.valid).toBe(true)
      expect(plan.scope).toBe("function")
    })
  })

  describe("constraints limits", () => {
    it("truncates constraints exceeding the max count (8)", () => {
      const constraints = Array.from(
        { length: 12 },
        (_, i) => `constraint ${i}`
      )
      const plan = makePlan({ constraints })
      const result = validatePlan(plan, [])
      expect(result.valid).toBe(true)
      expect(plan.constraints.length).toBe(8)
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it("truncates individual constraints exceeding 200 chars", () => {
      const longConstraint = "x".repeat(300)
      const plan = makePlan({
        constraints: [longConstraint, "short"]
      })
      const result = validatePlan(plan, [])
      expect(result.valid).toBe(true)
      expect(plan.constraints[0].length).toBe(200)
      expect(plan.constraints[1]).toBe("short")
    })

    it("handles both count and length truncation together", () => {
      const longConstraint = "y".repeat(250)
      const constraints = [
        longConstraint,
        ...Array.from({ length: 10 }, (_, i) => `c${i}`)
      ]
      const plan = makePlan({ constraints })
      const result = validatePlan(plan, [])
      expect(result.valid).toBe(true)
      expect(plan.constraints.length).toBe(8)
      expect(plan.constraints[0].length).toBe(200)
    })

    it("handles empty constraints array", () => {
      const plan = makePlan({ constraints: [] })
      const result = validatePlan(plan, [])
      expect(result.valid).toBe(true)
      expect(plan.constraints).toEqual([])
    })
  })

  describe("confidence validation", () => {
    it("clamps confidence above 1 to 1", () => {
      const plan = makePlan({ confidence: 1.5 })
      const result = validatePlan(plan, [])
      expect(plan.confidence).toBe(1)
      expect(result.valid).toBe(true)
    })

    it("clamps confidence below 0 to 0", () => {
      const plan = makePlan({ confidence: -0.5 })
      const result = validatePlan(plan, [])
      expect(plan.confidence).toBe(0)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it("invalidates plan when confidence < 0.3", () => {
      const plan = makePlan({ confidence: 0.25 })
      const result = validatePlan(plan, [])
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain("below threshold")
    })

    it("considers plan valid when confidence >= 0.3", () => {
      const plan = makePlan({ confidence: 0.3 })
      const result = validatePlan(plan, [])
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it("clamps and invalidates when confidence is way below 0", () => {
      const plan = makePlan({ confidence: -10 })
      const result = validatePlan(plan, [])
      expect(plan.confidence).toBe(0)
      expect(result.valid).toBe(false)
    })
  })

  describe("never throws", () => {
    it("never throws on any input", () => {
      // Test with various invalid-ish inputs
      const inputs: Array<[any, any, any]> = [
        [null, null, null],
        [undefined, undefined, undefined],
        [{}, [], "invalid"],
        [{ intent: "unknown" }, undefined, "expression"]
      ]

      for (const [plan, evidence, maxScope] of inputs) {
        // @ts-expect-error testing invalid input
        const result = validatePlan(plan, evidence, maxScope)
        expect(result).toHaveProperty("valid")
        expect(result).toHaveProperty("errors")
        expect(result).toHaveProperty("warnings")
        expect(Array.isArray(result.errors)).toBe(true)
        expect(Array.isArray(result.warnings)).toBe(true)
      }
    })

    it("handles undefined/null evidence gracefully", () => {
      const plan = makePlan({
        requestedSymbolIds: ["a", "b"]
      })
      const result = validatePlan(plan, undefined as any)
      expect(result.valid).toBe(true)
      expect(plan.requestedSymbolIds).toEqual([])
    })
  })

  describe("return shape", () => {
    it("returns PlanValidation with correct shape", () => {
      const plan = makePlan()
      const result = validatePlan(plan, [])
      expect(result).toHaveProperty("valid")
      expect(result).toHaveProperty("errors")
      expect(result).toHaveProperty("warnings")
      expect(typeof result.valid).toBe("boolean")
      expect(Array.isArray(result.errors)).toBe(true)
      expect(Array.isArray(result.warnings)).toBe(true)
    })
  })
})
