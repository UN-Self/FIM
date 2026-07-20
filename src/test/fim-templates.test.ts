import { describe, expect, it } from "vitest"

import {
  getFimSplitPrompt,
  getFimSplitPromptRepositoryLevel,
  getStopWords
} from "../../src/extension/fim-templates"
import type { PrefixSuffix } from "../../src/common/types"

describe("getStopWords", () => {
  it("returns the DeepSeek stop-word array", () => {
    const words = getStopWords("any-model", "any-format")
    expect(Array.isArray(words)).toBe(true)
    expect(words.length).toBeGreaterThan(0)
    // FIM tokens must be present as stop words
    expect(words).toContain("<｜fim▁begin｜>")
    expect(words).toContain("<｜fim▁hole｜>")
    expect(words).toContain("<｜fim▁end｜>")
    expect(words).toContain("<END>")
    expect(words).toContain("<｜end of sentence｜>")
  })
})

describe("getFimSplitPrompt", () => {
  const basePrefixSuffix: PrefixSuffix = {
    prefix: "function hello() {",
    suffix: "\n  return"
  }

  it("returns an object with prompt and suffix keys", () => {
    const result = getFimSplitPrompt({
      context: "",
      header: "",
      fileContextEnabled: false,
      prefixSuffix: basePrefixSuffix,
      language: undefined
    })
    expect(result).toHaveProperty("prompt")
    expect(result).toHaveProperty("suffix")
    expect(typeof result.prompt).toBe("string")
    expect(typeof result.suffix).toBe("string")
  })

  it("does NOT include FIM special tokens in the output", () => {
    const result = getFimSplitPrompt({
      context: "",
      header: "",
      fileContextEnabled: false,
      prefixSuffix: basePrefixSuffix,
      language: undefined
    })
    expect(result.prompt).not.toContain("<｜fim▁begin｜>")
    expect(result.prompt).not.toContain("<｜fim▁hole｜>")
    expect(result.prompt).not.toContain("<｜fim▁end｜>")
    expect(result.suffix).not.toContain("<｜fim▁begin｜>")
    expect(result.suffix).not.toContain("<｜fim▁hole｜>")
    expect(result.suffix).not.toContain("<｜fim▁end｜>")
  })

  it("includes prefix content in the prompt", () => {
    const result = getFimSplitPrompt({
      context: "",
      header: "",
      fileContextEnabled: false,
      prefixSuffix: { prefix: "const x = 1\n", suffix: "}" },
      language: undefined
    })
    expect(result.prompt).toContain("const x = 1")
  })

  it("passes suffix through unchanged", () => {
    const result = getFimSplitPrompt({
      context: "",
      header: "",
      fileContextEnabled: false,
      prefixSuffix: { prefix: "a", suffix: "}" },
      language: undefined
    })
    expect(result.suffix).toBe("}")
  })

  it("wraps context in language comments when fileContextEnabled is true for known languages", () => {
    const context = "extra context here"
    const result = getFimSplitPrompt({
      context,
      header: "",
      fileContextEnabled: true,
      prefixSuffix: basePrefixSuffix,
      language: "typescript"
    })
    // TypeScript uses block comments
    expect(result.prompt).toContain("/*")
    expect(result.prompt).toContain("*/")
    expect(result.prompt).toContain(context)
  })

  it("produces empty fileContext when fileContextEnabled is false", () => {
    const result = getFimSplitPrompt({
      context: "should not appear",
      header: "",
      fileContextEnabled: false,
      prefixSuffix: basePrefixSuffix,
      language: "typescript"
    })
    expect(result.prompt).not.toContain("/*")
    expect(result.prompt).not.toContain("should not appear")
  })

  it("prepends header before prefix when header is provided", () => {
    const result = getFimSplitPrompt({
      context: "",
      header: "// MyFile.ts",
      fileContextEnabled: false,
      prefixSuffix: basePrefixSuffix,
      language: undefined
    })
    expect(result.prompt).toContain("// MyFile.ts")
    // header should appear before prefix
    const headerIndex = result.prompt.indexOf("// MyFile.ts")
    const prefixIndex = result.prompt.indexOf("function hello()")
    expect(headerIndex).toBeGreaterThan(-1)
    expect(prefixIndex).toBeGreaterThan(-1)
    expect(headerIndex).toBeLessThan(prefixIndex)
  })

  it("handles empty context with header cleanly (no extra whitespace artifacts)", () => {
    const result = getFimSplitPrompt({
      context: "",
      header: "",
      fileContextEnabled: false,
      prefixSuffix: basePrefixSuffix,
      language: undefined
    })
    // Should start cleanly, not with extra line breaks before real content
    expect(result.prompt.trim()).toBe(result.prompt.trim())
    expect(result.prompt.length).toBeGreaterThan(0)
  })

  it("handles unknown language gracefully (empty comment syntax)", () => {
    const result = getFimSplitPrompt({
      context: "some context",
      header: "",
      fileContextEnabled: true,
      prefixSuffix: basePrefixSuffix,
      language: "nonexistent-lang"
    })
    // Unknown language should not add comment wrappers around context
    expect(result.prompt).toContain("some context")
  })
})

describe("getFimSplitPromptRepositoryLevel", () => {
  const prefixSuffix: PrefixSuffix = {
    prefix: "code before cursor",
    suffix: "code after cursor"
  }

  it("returns prompt/suffix shape", () => {
    const result = getFimSplitPromptRepositoryLevel(
      "my-repo",
      [{ uri: {} as any, text: "file content", name: "index.ts", isOpen: true, relevanceScore: 1 }],
      prefixSuffix,
      "index.ts"
    )
    expect(result).toHaveProperty("prompt")
    expect(result).toHaveProperty("suffix")
  })

  it("includes repository name in the prompt", () => {
    const result = getFimSplitPromptRepositoryLevel(
      "my-repo",
      [{ uri: {} as any, text: "content", name: "f.ts", isOpen: false, relevanceScore: 0.5 }],
      prefixSuffix,
      undefined
    )
    expect(result.prompt).toContain("Repository: my-repo")
  })

  it("includes file context in the prompt", () => {
    const result = getFimSplitPromptRepositoryLevel(
      "repo",
      [{ uri: {} as any, text: "hello world", name: "test.ts", isOpen: true, relevanceScore: 1 }],
      prefixSuffix,
      "test.ts"
    )
    expect(result.prompt).toContain("File: test.ts")
    expect(result.prompt).toContain("hello world")
  })

  it("prepends current file name header when provided", () => {
    const result = getFimSplitPromptRepositoryLevel(
      "repo",
      [],
      prefixSuffix,
      "current-file.ts"
    )
    const prompt = result.prompt
    // currentFileName goes into the header param
    expect(prompt).toContain("File: current-file.ts")
    // Repository should also be present
    expect(prompt).toContain("Repository: repo")
  })

  it("handles empty code array gracefully", () => {
    const result = getFimSplitPromptRepositoryLevel(
      "repo",
      [],
      prefixSuffix,
      undefined
    )
    expect(result.prompt).toContain("Repository: repo")
    expect(result.prompt).not.toContain("undefined")
  })
})
