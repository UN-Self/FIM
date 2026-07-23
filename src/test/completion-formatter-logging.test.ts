import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"

import { LogLevel, logger } from "../../src/common/logger"
import { CompletionFormatter } from "../../src/extension/completion-formatter"

describe("CompletionFormatter logging", () => {
  const original = logger.getLevel()
  let logSpy: MockInstance

  function makeFakeEditor() {
    const line = {
      text: "",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
    }
    return {
      selection: { active: { line: 0, character: 0 } },
      document: {
        languageId: "typescript",
        lineCount: 1,
        lineAt: () => line,
        getText: () => ""
      }
    } as any
  }

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    logger.setLevel(original)
  })

  it("format() is silent at the default Info level", () => {
    logger.setLevel(LogLevel.Info)
    const formatter = new CompletionFormatter(makeFakeEditor())
    formatter.format("const result = 1 + 2")
    expect(logSpy).not.toHaveBeenCalled()
  })

  it("emits step traces at Debug level", () => {
    logger.setLevel(LogLevel.Debug)
    const formatter = new CompletionFormatter(makeFakeEditor())
    formatter.format("const result = 1 + 2")
    expect(logSpy).toHaveBeenCalled()
  })
})
