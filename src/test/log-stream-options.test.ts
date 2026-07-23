import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance
} from "vitest"

import { LogLevel, logger } from "../../src/common/logger"
import { logStreamOptions } from "../../src/extension/utils"

describe("logStreamOptions", () => {
  const original = logger.getLevel()
  let logSpy: MockInstance

  const request = {
    body: { prompt: "const x = 1 +", suffix: "2" },
    options: {
      hostname: "api.deepseek.com",
      path: "/beta/completions",
      protocol: "https:",
      method: "POST",
      headers: {
        Authorization: "Bearer sk-test-key",
        "Content-Type": "application/json"
      }
    }
  }

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    logger.setLevel(original)
  })

  it("is silent at the default Info level", () => {
    logger.setLevel(LogLevel.Info)
    logStreamOptions(request)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it("dumps at Trace and redacts the API key", () => {
    logger.setLevel(LogLevel.Trace)
    logStreamOptions(request)
    expect(logSpy).toHaveBeenCalled()
    const dumped = logSpy.mock.calls.map((c) => String(c[0])).join("\n")
    expect(dumped).not.toContain("sk-test-key")
    expect(dumped).toContain("Bearer <redacted>")
  })
})
