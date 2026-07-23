import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance
} from "vitest"

import { logger } from "../../src/common/logger"
import {
  LogLevel,
  parseLogLevel,
  redactSecrets,
  resolveLevel
} from "../../src/common/logger"

describe("parseLogLevel", () => {
  it("maps canonical names case-insensitively", () => {
    expect(parseLogLevel("error")).toBe(LogLevel.Error)
    expect(parseLogLevel("WARN")).toBe(LogLevel.Warn)
    expect(parseLogLevel("Info")).toBe(LogLevel.Info)
    expect(parseLogLevel("debug")).toBe(LogLevel.Debug)
    expect(parseLogLevel("trace")).toBe(LogLevel.Trace)
  })

  it("accepts 'warning' as warn", () => {
    expect(parseLogLevel("warning")).toBe(LogLevel.Warn)
  })

  it("falls back to Info on invalid or missing input", () => {
    expect(parseLogLevel(undefined)).toBe(LogLevel.Info)
    expect(parseLogLevel("verbose")).toBe(LogLevel.Info)
    expect(parseLogLevel("")).toBe(LogLevel.Info)
  })
})

describe("resolveLevel", () => {
  it("setting wins when provided", () => {
    expect(resolveLevel("debug", "trace")).toBe(LogLevel.Debug)
  })
  it("env wins when setting is absent", () => {
    expect(resolveLevel(undefined, "warn")).toBe(LogLevel.Warn)
  })
  it("defaults to Info when neither is provided", () => {
    expect(resolveLevel(undefined, undefined)).toBe(LogLevel.Info)
  })
})

describe("redactSecrets", () => {
  it("redacts Authorization header", () => {
    const out = redactSecrets({
      hostname: "api.x",
      headers: {
        Authorization: "Bearer sk-secret",
        "Content-Type": "application/json"
      }
    })
    expect(out.headers.Authorization).toBe("Bearer <redacted>")
    expect(out.headers["Content-Type"]).toBe("application/json")
  })

  it("redacts apiKey fields", () => {
    const out = redactSecrets({ apiKey: "sk-secret", model: "x" })
    expect(out.apiKey).toBe("<redacted>")
    expect(out.model).toBe("x")
  })

  it("does not mutate the original", () => {
    const orig = { headers: { Authorization: "Bearer sk-secret" } }
    redactSecrets(orig)
    expect(orig.headers.Authorization).toBe("Bearer sk-secret")
  })

  it("leaves primitives untouched", () => {
    expect(redactSecrets("x")).toBe("x")
    expect(redactSecrets(42)).toBe(42)
  })
})

describe("Logger threshold", () => {
  const original = logger.getLevel()
  let logSpy: MockInstance
  let errSpy: MockInstance

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    errSpy.mockRestore()
    logger.setLevel(original)
  })

  it("emits info at Info and uses the [fim] console tag", () => {
    logger.setLevel(LogLevel.Info)
    logger.info("hello")
    expect(logSpy).toHaveBeenCalledWith("[fim] hello")
  })

  it("suppresses debug/trace at Info", () => {
    logger.setLevel(LogLevel.Info)
    logger.debug("d")
    logger.trace("t")
    expect(logSpy).not.toHaveBeenCalled()
  })

  it("only emits error at Error threshold", () => {
    logger.setLevel(LogLevel.Error)
    logger.error("boom")
    logger.warn("w")
    logger.info("i")
    expect(errSpy).toHaveBeenCalledWith("[fim:ERROR] boom")
    expect(logSpy).not.toHaveBeenCalled()
  })

  it("emits everything at Trace", () => {
    logger.setLevel(LogLevel.Trace)
    logger.trace("deep")
    expect(logSpy).toHaveBeenCalledWith("[fim:TRACE] deep")
  })

  it("log() is an alias for info()", () => {
    logger.setLevel(LogLevel.Info)
    logger.log("legacy")
    expect(logSpy).toHaveBeenCalledWith("[fim] legacy")
  })

  it("error accepts Error or string", () => {
    logger.setLevel(LogLevel.Error)
    logger.error(new Error("oops"))
    expect(errSpy).toHaveBeenCalledWith("[fim:ERROR] oops")
  })
})
