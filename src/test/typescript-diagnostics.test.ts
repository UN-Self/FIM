import { describe, expect, it } from "vitest"

import { validateTypeScriptCompletion } from "../../src/extension/typescript-diagnostics"

describe("validateTypeScriptCompletion", () => {
  const base = {
    fileName: "/tmp/fim-diagnostics.ts",
    languageId: "typescript",
    originalText: "const value: number = 1\n",
    offset: "const value: number = 1\n".length
  }

  it("accepts a completion that adds no TypeScript errors", () => {
    const result = validateTypeScriptCompletion({ ...base, completionText: "const next: number = value\n" })
    expect(result.checked).toBe(true)
    expect(result.valid).toBe(true)
  })

  it("rejects a completion that introduces a TypeScript error", () => {
    const result = validateTypeScriptCompletion({ ...base, completionText: "const next: number = 'wrong'\n" })
    expect(result.checked).toBe(true)
    expect(result.valid).toBe(false)
    expect(result.newErrorCount).toBeGreaterThan(0)
  })

  it("does not check unsupported languages", () => {
    const result = validateTypeScriptCompletion({ ...base, languageId: "python", completionText: "not python" })
    expect(result.checked).toBe(false)
    expect(result.valid).toBe(true)
  })
})
