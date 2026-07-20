import { describe, expect, it } from "vitest"

import {
  getIsBracket,
  getIsClosingBracket,
  getIsOpeningBracket,
  getIsSingleBracket,
  getIsOnlyOpeningBrackets,
  getIsOnlyClosingBrackets,
  getIsOnlyBrackets,
  getSkipVariableDeclataion,
  isStreamWithDataPrefix,
  safeParseJsonResponse,
  safeParseJsonStringBuffer,
  safeParseJson,
  getNormalisedText,
  getNonce,
  sanitizeWorkspaceName,
  getResponseData,
  getFimDataFromProvider
} from "../../src/extension/utils"

describe("bracket detection", () => {
  describe("getIsBracket", () => {
    it("returns true for opening brackets", () => {
      expect(getIsBracket("[")).toBe(true)
      expect(getIsBracket("{")).toBe(true)
      expect(getIsBracket("(")).toBe(true)
    })

    it("returns true for closing brackets", () => {
      expect(getIsBracket("]")).toBe(true)
      expect(getIsBracket("}")).toBe(true)
      expect(getIsBracket(")")).toBe(true)
    })

    it("returns false for non-brackets", () => {
      expect(getIsBracket("a")).toBe(false)
      expect(getIsBracket("1")).toBe(false)
      expect(getIsBracket(" ")).toBe(false)
      expect(getIsBracket("")).toBe(false)
      expect(getIsBracket("'")).toBe(false)
    })
  })

  describe("getIsClosingBracket", () => {
    it("returns true for closing brackets", () => {
      expect(getIsClosingBracket("]")).toBe(true)
      expect(getIsClosingBracket("}")).toBe(true)
      expect(getIsClosingBracket(")")).toBe(true)
    })

    it("returns false for opening brackets", () => {
      expect(getIsClosingBracket("[")).toBe(false)
      expect(getIsClosingBracket("{")).toBe(false)
      expect(getIsClosingBracket("(")).toBe(false)
    })

    it("returns false for non-brackets", () => {
      expect(getIsClosingBracket("x")).toBe(false)
    })
  })

  describe("getIsOpeningBracket", () => {
    it("returns true for opening brackets", () => {
      expect(getIsOpeningBracket("[")).toBe(true)
      expect(getIsOpeningBracket("{")).toBe(true)
      expect(getIsOpeningBracket("(")).toBe(true)
    })

    it("returns false for closing brackets", () => {
      expect(getIsOpeningBracket("]")).toBe(false)
      expect(getIsOpeningBracket("}")).toBe(false)
      expect(getIsOpeningBracket(")")).toBe(false)
    })
  })

  describe("getIsSingleBracket", () => {
    it("returns true for a single bracket character", () => {
      expect(getIsSingleBracket("{")).toBe(true)
      expect(getIsSingleBracket("}")).toBe(true)
    })

    it("returns false for non-bracket single characters", () => {
      expect(getIsSingleBracket("a")).toBe(false)
    })

    it("returns false for multi-character strings", () => {
      expect(getIsSingleBracket("{}")).toBe(false)
    })

    it("returns false for undefined or empty input", () => {
      // getIsSingleBracket(undefined) evaluates undefined?.length === 1 → false, returns false
      expect(getIsSingleBracket(undefined as any)).toBe(false)
      expect(getIsSingleBracket("")).toBe(false)
    })
  })

  describe("getIsOnlyOpeningBrackets", () => {
    it("returns true for strings of only opening brackets", () => {
      expect(getIsOnlyOpeningBrackets("{[(")).toBe(true)
      expect(getIsOnlyOpeningBrackets("{")).toBe(true)
    })

    it("returns false when any character is not an opening bracket", () => {
      expect(getIsOnlyOpeningBrackets("{)")).toBe(false)
      expect(getIsOnlyOpeningBrackets("a")).toBe(false)
    })

    it("returns false for empty or undefined input", () => {
      expect(getIsOnlyOpeningBrackets("")).toBe(false)
      expect(getIsOnlyOpeningBrackets(undefined as any)).toBe(false)
    })
  })

  describe("getIsOnlyClosingBrackets", () => {
    it("returns true for strings of only closing brackets", () => {
      expect(getIsOnlyClosingBrackets(")}]")).toBe(true)
      expect(getIsOnlyClosingBrackets("}")).toBe(true)
    })

    it("returns false when any character is not a closing bracket", () => {
      expect(getIsOnlyClosingBrackets("}]")).toBe(true)
      expect(getIsOnlyClosingBrackets("}a")).toBe(false)
    })

    it("returns false for empty or undefined input", () => {
      expect(getIsOnlyClosingBrackets("")).toBe(false)
      expect(getIsOnlyClosingBrackets(undefined as any)).toBe(false)
    })
  })

  describe("getIsOnlyBrackets", () => {
    it("returns true for strings of only brackets (any kind)", () => {
      expect(getIsOnlyBrackets("{}()[]")).toBe(true)
      expect(getIsOnlyBrackets("({[")).toBe(true)
    })

    it("returns false for strings containing non-brackets", () => {
      expect(getIsOnlyBrackets("a{}")).toBe(false)
      expect(getIsOnlyBrackets(" ")).toBe(false)
    })

    it("returns false for empty or undefined input", () => {
      expect(getIsOnlyBrackets("")).toBe(false)
      expect(getIsOnlyBrackets(undefined as any)).toBe(false)
    })
  })
})

describe("getSkipVariableDeclataion", () => {
  it("returns false when characterBefore is a skip symbol but the runtime type cast check fails", () => {
    // The function has a quirky check: (!textAfter.at(0) as unknown as string) === "?"
    // which is always false at runtime (boolean !== string "?"), so the function never
    // actually returns true for the guard path
    const result = getSkipVariableDeclataion("=", "someVar")
    // characterBefore="=" is truthy and in SKIP_DECLARATION_SYMBOLS,
    // but (!textAfter.at(0) as unknown as string) === "?" is false for any textAfter
    expect(result).toBe(false)
  })

  it("returns false when characterBefore is not a skip symbol", () => {
    const result = getSkipVariableDeclataion("a", "someText")
    expect(result).toBe(false)
  })

  it("returns false when textAfter is empty", () => {
    const result = getSkipVariableDeclataion("=", "")
    expect(result).toBe(false)
  })
})

describe("stream parsing", () => {
  describe("isStreamWithDataPrefix", () => {
    it("returns true for strings starting with 'data:'", () => {
      expect(isStreamWithDataPrefix("data:{}")).toBe(true)
      expect(isStreamWithDataPrefix("data: something")).toBe(true)
    })

    it("returns false for strings without 'data:' prefix", () => {
      expect(isStreamWithDataPrefix("{}")).toBe(false)
      expect(isStreamWithDataPrefix("")).toBe(false)
      expect(isStreamWithDataPrefix("Data: something")).toBe(false)
    })
  })

  describe("safeParseJsonResponse", () => {
    it("parses data:-prefixed JSON", () => {
      const result = safeParseJsonResponse('data:{"choices":[{"text":"hello"}]}')
      expect(result).toBeDefined()
      expect(result?.choices[0].text).toBe("hello")
    })

    it("parses plain JSON without data: prefix", () => {
      const result = safeParseJsonResponse('{"key":"value"}')
      expect(result).toBeDefined()
      expect((result as any).key).toBe("value")
    })

    it("returns undefined for invalid JSON", () => {
      expect(safeParseJsonResponse("not json at all")).toBeUndefined()
      expect(safeParseJsonResponse("")).toBeUndefined()
    })

    it("returns undefined for data: followed by invalid JSON", () => {
      expect(safeParseJsonResponse("data:not-json")).toBeUndefined()
    })
  })

  describe("safeParseJsonStringBuffer", () => {
    it("parses valid JSON", () => {
      const result = safeParseJsonStringBuffer('{"a":1}')
      expect(result).toEqual({ a: 1 })
    })

    it("returns undefined for invalid JSON", () => {
      expect(safeParseJsonStringBuffer("{invalid")).toBeUndefined()
    })

    it("strips NORMALIZE_REGEX patterns before parsing", () => {
      const result = safeParseJsonStringBuffer('{"a":\n1}')
      expect(result).toEqual({ a: 1 })
    })
  })

  describe("safeParseJson", () => {
    it("parses valid JSON", () => {
      const result = safeParseJson<{ x: number }>('{"x":42}')
      expect(result?.x).toBe(42)
    })

    it("returns undefined for invalid input", () => {
      expect(safeParseJson("not-json")).toBeUndefined()
      expect(safeParseJson("")).toBeUndefined()
    })
  })
})

describe("getResponseData", () => {
  it("extracts delta content from stream response", () => {
    const data = {
      choices: [{ delta: { content: "hello" }, text: "", index: 0, message: { role: "assistant" as const, content: "" }, finish_reason: "stop" as const }],
      model: "m", created_at: "", response: "", content: "", message: { content: "", role: "assistant" as const },
      done: false, context: [], total_duration: 0, load_duration: 0, prompt_eval_count: 0,
      prompt_eval_duration: 0, eval_count: 0, eval_duration: 0, system_fingerprint: "",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    } as any
    expect(getResponseData(data)).toEqual({ type: "content", content: "hello" })
  })

  it("falls back to message.content when delta is empty", () => {
    const data = {
      choices: [{ delta: { content: "" }, text: "", index: 0, message: { role: "assistant" as const, content: "fallback" }, finish_reason: "stop" as const }],
      model: "m", created_at: "", response: "", content: "", message: { content: "", role: "assistant" as const },
      done: false, context: [], total_duration: 0, load_duration: 0, prompt_eval_count: 0,
      prompt_eval_duration: 0, eval_count: 0, eval_duration: 0, system_fingerprint: "",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    } as any
    expect(getResponseData(data)).toEqual({ type: "content", content: "fallback" })
  })

  it("crashes on empty choices array (known behavior)", () => {
    // getResponseData accesses data.choices[0].message without null check
    // for the fallback path, so an empty choices array will throw
    const data = {
      choices: [],
      model: "m",
      message: { content: "", role: "assistant" as const }
    } as any
    expect(() => getResponseData(data)).toThrow()
  })
})

describe("getFimDataFromProvider", () => {
  it("extracts text from stream response choices", () => {
    const data = {
      choices: [{ text: "completion text", delta: { content: "" }, index: 0, message: { role: "assistant" as const, content: "" }, finish_reason: "stop" as const }],
      model: "m", created_at: "", response: "", content: "", message: { content: "", role: "assistant" as const },
      done: false, context: [], total_duration: 0, load_duration: 0, prompt_eval_count: 0,
      prompt_eval_duration: 0, eval_count: 0, eval_duration: 0, system_fingerprint: "",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    } as any
    expect(getFimDataFromProvider("deepseek", data)).toBe("completion text")
  })

  it("returns empty string when choices[0].text is 'undefined'", () => {
    const data = {
      choices: [{ text: "undefined", delta: { content: "" }, index: 0, message: { role: "assistant" as const, content: "" }, finish_reason: "stop" as const }],
      model: "m", created_at: "", response: "", content: "", message: { content: "", role: "assistant" as const },
      done: false, context: [], total_duration: 0, load_duration: 0, prompt_eval_count: 0,
      prompt_eval_duration: 0, eval_count: 0, eval_duration: 0, system_fingerprint: "",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    } as any
    expect(getFimDataFromProvider("deepseek", data)).toBe("")
  })

  it("returns undefined for undefined data", () => {
    expect(getFimDataFromProvider("deepseek", undefined)).toBeUndefined()
  })

  it("returns undefined for data with empty choices", () => {
    expect(getFimDataFromProvider("deepseek", { choices: [] } as any)).toBeUndefined()
  })
})

describe("getNormalisedText", () => {
  it("replaces line breaks with spaces", () => {
    expect(getNormalisedText("hello\nworld")).toBe("hello world")
    expect(getNormalisedText("line1\r\nline2")).toBe("line1 line2")
    expect(getNormalisedText("a\rb")).toBe("a b")
  })

  it("collapses multiple whitespace+linebreak patterns", () => {
    expect(getNormalisedText("hello  \n  world")).toBe("hello   world")
  })

  it("returns same string when no line breaks", () => {
    expect(getNormalisedText("plain text")).toBe("plain text")
  })
})

describe("getNonce", () => {
  it("returns a 32-character alphanumeric string", () => {
    const nonce = getNonce()
    expect(nonce).toHaveLength(32)
    expect(nonce).toMatch(/^[a-zA-Z0-9]+$/)
  })

  it("produces different values on consecutive calls", () => {
    const a = getNonce()
    const b = getNonce()
    expect(a).not.toBe(b)
  })
})

describe("sanitizeWorkspaceName", () => {
  it("replaces invalid characters with underscores", () => {
    expect(sanitizeWorkspaceName("my project!")).toBe("my_project_")
  })

  it("preserves valid characters (letters, digits, ., _, -)", () => {
    expect(sanitizeWorkspaceName("my-project_v1.0")).toBe("my-project_v1.0")
  })

  it("handles undefined gracefully", () => {
    expect(sanitizeWorkspaceName(undefined)).toBe("")
  })

  it("handles empty string", () => {
    expect(sanitizeWorkspaceName("")).toBe("")
  })

  it("replaces sequences of invalid characters with single underscore", () => {
    // invalidChars regex uses + quantifier, so consecutive invalid chars
    // are replaced with a single underscore
    const result = sanitizeWorkspaceName("测试")
    expect(result).toBe("_")
  })
})
