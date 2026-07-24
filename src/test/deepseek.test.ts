import { describe, expect, it } from "vitest"

import {
  API_PROVIDERS,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  DEEPSEEK_PROVIDER_ID,
  DEFAULT_PROVIDER_FORM_VALUES
} from "../../src/common/deepseek"
import type { FimProvider } from "../../src/common/deepseek"

import { buildProviderBaseUrl, parseProviderBaseUrl } from "../../src/common/provider-url"

describe("DeepSeek provider defaults", () => {
  describe("DEEPSEEK_PROVIDER_ID", () => {
    it("equals 'deepseek-default'", () => {
      expect(DEEPSEEK_PROVIDER_ID).toBe("deepseek-default")
    })
  })

  describe("DEEPSEEK_DEFAULT_BASE_URL", () => {
    it("points to the DeepSeek beta completions endpoint", () => {
      expect(DEEPSEEK_DEFAULT_BASE_URL).toBe("https://api.deepseek.com/beta/completions")
    })
  })

  describe("DEEPSEEK_DEFAULT_MODEL", () => {
    it("is 'deepseek-v4-flash'", () => {
      expect(DEEPSEEK_DEFAULT_MODEL).toBe("deepseek-v4-flash")
    })
  })

  describe("API_PROVIDERS", () => {
    it("maps Deepseek to 'deepseek'", () => {
      expect(API_PROVIDERS.Deepseek).toBe("deepseek")
    })
  })

  describe("DEFAULT_PROVIDER_FORM_VALUES", () => {
    it("has all required FimProvider fields", () => {
      const fv = DEFAULT_PROVIDER_FORM_VALUES
      expect(fv).toHaveProperty("id")
      expect(fv).toHaveProperty("label")
      expect(fv).toHaveProperty("modelName")
      expect(fv).toHaveProperty("provider")
      expect(fv).toHaveProperty("type")
      expect(fv).toHaveProperty("apiHostname")
      expect(fv).toHaveProperty("apiPath")
      expect(fv).toHaveProperty("apiProtocol")
    })

    it("has id matching DEEPSEEK_PROVIDER_ID", () => {
      expect(DEFAULT_PROVIDER_FORM_VALUES.id).toBe(DEEPSEEK_PROVIDER_ID)
    })

    it("has label 'DeepSeek'", () => {
      expect(DEFAULT_PROVIDER_FORM_VALUES.label).toBe("DeepSeek")
    })

    it("has modelName matching DEEPSEEK_DEFAULT_MODEL", () => {
      expect(DEFAULT_PROVIDER_FORM_VALUES.modelName).toBe(DEEPSEEK_DEFAULT_MODEL)
    })

    it("has provider matching API_PROVIDERS.Deepseek", () => {
      expect(DEFAULT_PROVIDER_FORM_VALUES.provider).toBe(API_PROVIDERS.Deepseek)
    })

    it("has type 'fim'", () => {
      expect(DEFAULT_PROVIDER_FORM_VALUES.type).toBe("fim")
    })

    it("has apiHostname 'api.deepseek.com'", () => {
      expect(DEFAULT_PROVIDER_FORM_VALUES.apiHostname).toBe("api.deepseek.com")
    })

    it("has apiPath '/beta/completions'", () => {
      expect(DEFAULT_PROVIDER_FORM_VALUES.apiPath).toBe("/beta/completions")
    })

    it("has apiProtocol 'https'", () => {
      expect(DEFAULT_PROVIDER_FORM_VALUES.apiProtocol).toBe("https")
    })
  })

  describe("FimProvider type compliance", () => {
    function isFimProvider(obj: unknown): obj is FimProvider {
      if (typeof obj !== "object" || obj === null) return false
      const p = obj as Record<string, unknown>
      return (
        typeof p.id === "string" &&
        typeof p.label === "string" &&
        typeof p.modelName === "string" &&
        typeof p.provider === "string" &&
        typeof p.type === "string"
      )
    }

    it("DEFAULT_PROVIDER_FORM_VALUES satisfies FimProvider structure", () => {
      expect(isFimProvider(DEFAULT_PROVIDER_FORM_VALUES)).toBe(true)
    })

    it("all required string fields are non-empty", () => {
      const fv = DEFAULT_PROVIDER_FORM_VALUES
      expect(fv.id.length).toBeGreaterThan(0)
      expect(fv.label.length).toBeGreaterThan(0)
      expect(fv.modelName.length).toBeGreaterThan(0)
      expect(fv.provider.length).toBeGreaterThan(0)
      expect(fv.type.length).toBeGreaterThan(0)
    })
  })
})

describe("buildProviderBaseUrl", () => {
  it("builds a URL from complete provider fields", () => {
    const url = buildProviderBaseUrl({
      apiProtocol: "https",
      apiHostname: "api.example.com",
      apiPath: "/v1/completions"
    })
    expect(url).toBe("https://api.example.com/v1/completions")
  })

  it("includes port when apiPort is provided", () => {
    const url = buildProviderBaseUrl({
      apiProtocol: "http",
      apiHostname: "localhost",
      apiPort: 8080,
      apiPath: "/api"
    })
    expect(url).toBe("http://localhost:8080/api")
  })

  it("falls back to DEFAULT_PROVIDER_FORM_VALUES for missing fields", () => {
    const url = buildProviderBaseUrl({})
    expect(url).toBe("https://api.deepseek.com/beta/completions")
  })

  it("falls back to default protocol when not provided", () => {
    const url = buildProviderBaseUrl({
      apiHostname: "custom.example.com",
      apiPath: "/v2"
    })
    expect(url).toBe("https://custom.example.com/v2")
  })

  it("falls back to default hostname when not provided", () => {
    const url = buildProviderBaseUrl({
      apiProtocol: "http",
      apiPath: "/test"
    })
    expect(url).toBe("http://api.deepseek.com/test")
  })

  it("falls back to default path when not provided", () => {
    const url = buildProviderBaseUrl({
      apiProtocol: "https",
      apiHostname: "api2.example.com"
    })
    expect(url).toBe("https://api2.example.com/beta/completions")
  })
})

describe("parseProviderBaseUrl", () => {
  it("parses a standard HTTPS URL", () => {
    const fields = parseProviderBaseUrl("https://api.example.com/v1/completions")
    expect(fields.apiProtocol).toBe("https")
    expect(fields.apiHostname).toBe("api.example.com")
    expect(fields.apiPath).toBe("/v1/completions")
  })

  it("parses a URL with port", () => {
    const fields = parseProviderBaseUrl("http://localhost:3000/api")
    expect(fields.apiProtocol).toBe("http")
    expect(fields.apiHostname).toBe("localhost")
    expect(fields.apiPort).toBe(3000)
    expect(fields.apiPath).toBe("/api")
  })

  it("defaults to deepseek URL when called with no argument", () => {
    const fields = parseProviderBaseUrl()
    expect(fields.apiHostname).toBe("api.deepseek.com")
    expect(fields.apiPath).toBe("/beta/completions")
    expect(fields.apiProtocol).toBe("https")
  })

  it("falls back to default URL for invalid input", () => {
    const fields = parseProviderBaseUrl("not-a-valid-url!!!")
    expect(fields.apiHostname).toBe("api.deepseek.com")
    expect(fields.apiProtocol).toBe("https")
  })

  it("preserves query strings in apiPath", () => {
    const fields = parseProviderBaseUrl("https://api.example.com/v1/chat?model=gpt4")
    expect(fields.apiPath).toBe("/v1/chat?model=gpt4")
  })
})
