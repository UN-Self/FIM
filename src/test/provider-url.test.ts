import { describe, it, expect } from "vitest"
import {
  buildProviderBaseUrl,
  parseProviderBaseUrl,
  ProviderUrlFields
} from "../common/provider-url"

describe("buildProviderBaseUrl", () => {
  it("builds a URL from provider fields", () => {
    const result = buildProviderBaseUrl({
      apiHostname: "api.example.com",
      apiPath: "/v1/completions",
      apiProtocol: "https"
    })
    expect(result).toBe("https://api.example.com/v1/completions")
  })

  it("includes port when specified", () => {
    const result = buildProviderBaseUrl({
      apiHostname: "api.example.com",
      apiPath: "/v1/chat",
      apiPort: 8080,
      apiProtocol: "http"
    })
    expect(result).toBe("http://api.example.com:8080/v1/chat")
  })

  it("falls back to defaults when fields are missing", () => {
    const result = buildProviderBaseUrl({})
    expect(result).toBe("https://api.deepseek.com/beta/completions")
  })

  it("uses default protocol when only hostname is provided", () => {
    const result = buildProviderBaseUrl({
      apiHostname: "custom.api.com"
    })
    expect(result).toBe("https://custom.api.com/beta/completions")
  })

  it("uses default hostname when only protocol is provided", () => {
    const result = buildProviderBaseUrl({
      apiProtocol: "http"
    })
    expect(result).toBe("http://api.deepseek.com/beta/completions")
  })

  it("uses default path when only hostname and protocol are provided", () => {
    const result = buildProviderBaseUrl({
      apiHostname: "my-api.local",
      apiProtocol: "http"
    })
    expect(result).toBe("http://my-api.local/beta/completions")
  })

  it("handles custom apiPath", () => {
    const result = buildProviderBaseUrl({
      apiHostname: "api.deepseek.com",
      apiPath: "/custom/path"
    })
    expect(result).toBe("https://api.deepseek.com/custom/path")
  })

  it("handles all fields provided", () => {
    const result = buildProviderBaseUrl({
      apiHostname: "gateway.example.com",
      apiPath: "/llm/v1/complete",
      apiPort: 9443,
      apiProtocol: "https"
    })
    expect(result).toBe("https://gateway.example.com:9443/llm/v1/complete")
  })
})

describe("parseProviderBaseUrl", () => {
  it("parses a complete URL into provider fields", () => {
    const result = parseProviderBaseUrl("https://api.example.com/v1/completions")
    expect(result).toEqual({
      apiHostname: "api.example.com",
      apiPath: "/v1/completions",
      apiPort: undefined,
      apiProtocol: "https"
    })
  })

  it("parses a URL with port", () => {
    const result = parseProviderBaseUrl("http://localhost:8080/api/chat")
    expect(result).toEqual({
      apiHostname: "localhost",
      apiPath: "/api/chat",
      apiPort: 8080,
      apiProtocol: "http"
    })
  })

  it("parses URLs with query strings", () => {
    const result = parseProviderBaseUrl("https://api.example.com/v1/complete?model=deepseek")
    expect(result).toEqual({
      apiHostname: "api.example.com",
      apiPath: "/v1/complete?model=deepseek",
      apiPort: undefined,
      apiProtocol: "https"
    })
  })

  it("falls back to DeepSeek default when URL is invalid", () => {
    const result = parseProviderBaseUrl("not-a-valid-url!!!")
    expect(result).toEqual({
      apiHostname: "api.deepseek.com",
      apiPath: "/beta/completions",
      apiPort: undefined,
      apiProtocol: "https"
    })
  })

  it("falls back to DeepSeek default when URL is empty", () => {
    const result = parseProviderBaseUrl("")
    expect(result).toEqual({
      apiHostname: "api.deepseek.com",
      apiPath: "/beta/completions",
      apiPort: undefined,
      apiProtocol: "https"
    })
  })

  it("falls back to DeepSeek default when URL is undefined", () => {
    const result = parseProviderBaseUrl(undefined)
    expect(result).toEqual({
      apiHostname: "api.deepseek.com",
      apiPath: "/beta/completions",
      apiPort: undefined,
      apiProtocol: "https"
    })
  })

  it("round-trips: build(parse(url)) === url for DeepSeek default", () => {
    const url = "https://api.deepseek.com/beta/completions"
    const parsed = parseProviderBaseUrl(url)
    const rebuilt = buildProviderBaseUrl(parsed)
    expect(rebuilt).toBe(url)
  })

  it("round-trips: build(parse(url)) preserves custom port and path", () => {
    const url = "http://my-proxy.internal:11434/v1/completions"
    const parsed = parseProviderBaseUrl(url)
    const rebuilt = buildProviderBaseUrl(parsed)
    expect(rebuilt).toBe(url)
  })
})

describe("ProviderUrlFields type", () => {
  it("allows empty object", () => {
    const fields: ProviderUrlFields = {}
    expect(fields).toBeDefined()
  })

  it("allows partial fields", () => {
    const fields: ProviderUrlFields = {
      apiHostname: "host.com",
      apiProtocol: "https"
    }
    expect(fields.apiHostname).toBe("host.com")
    expect(fields.apiPort).toBeUndefined()
  })

  it("allows all fields", () => {
    const fields: ProviderUrlFields = {
      apiHostname: "host.com",
      apiPath: "/path",
      apiPort: 443,
      apiProtocol: "https"
    }
    expect(fields.apiPort).toBe(443)
  })
})
