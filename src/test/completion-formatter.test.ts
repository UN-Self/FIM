import { describe, expect, it } from "vitest"

import { CompletionFormatter } from "../../src/extension/completion-formatter"

describe("CompletionFormatter", () => {
  // Build a minimal fake editor that satisfies CompletionFormatter constructor
  function makeFakeEditor(overrides: Record<string, unknown> = {}) {
    const selectionActive = { line: 0, character: 0, ...(overrides.selectionActive || {}) }
    const documentLine = {
      text: "",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      ...(overrides.documentLine || {})
    }
    return {
      selection: { active: selectionActive },
      document: {
        languageId: "typescript",
        lineCount: 1,
        lineAt: () => documentLine,
        getText: () => "",
        ...(overrides.document || {})
      },
      ...overrides.editor
    } as any
  }

  describe("constructor", () => {
    it("sets cursorPosition from editor.selection.active", () => {
      const editor = makeFakeEditor({
        selectionActive: { line: 5, character: 42 }
      })
      const formatter = new CompletionFormatter(editor as any)
      expect(formatter.cursorPosition.line).toBe(5)
      expect(formatter.cursorPosition.character).toBe(42)
    })

    it("sets languageId from document", () => {
      const editor = makeFakeEditor({
        document: {
          languageId: "python",
          lineCount: 1,
          lineAt: () => ({
            text: "",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
          }),
          getText: () => ""
        }
      })
      const formatter = new CompletionFormatter(editor as any)
      expect(formatter.languageId).toBe("python")
    })

    it("captures charBeforeCursor from line text", () => {
      const editor = makeFakeEditor({
        selectionActive: { line: 0, character: 3 },
        documentLine: { text: "abc" }
      })
      const formatter = new CompletionFormatter(editor as any)
      const f = formatter as any
      expect(f.charBeforeCursor).toBe("c")
    })

    it("captures charAfterCursor from the remainder of the line", () => {
      const editor = makeFakeEditor({
        selectionActive: { line: 0, character: 2 },
        documentLine: { text: "hello" },
        document: {
          languageId: "typescript",
          lineCount: 1,
          lineAt: () => ({
            text: "hello",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
          }),
          getText: (range: any) => {
            if (range) return "llo"
            return ""
          }
        }
      })
      const formatter = new CompletionFormatter(editor as any)
      expect(formatter.textAfterCursor).toBe("llo")
      const f = formatter as any
      expect(f.charAfterCursor).toBe("l")
    })
  })

  describe("format() pipeline", () => {
    it("returns empty string for an empty completion input", () => {
      const editor = makeFakeEditor()
      const formatter = new CompletionFormatter(editor as any)
      const result = formatter.format("")
      expect(result).toBe("")
    })

    it("returns whitespace-only for whitespace input", () => {
      const editor = makeFakeEditor()
      const formatter = new CompletionFormatter(editor as any)
      const result = formatter.format("   ")
      expect(result.trim()).toBe("")
    })

    it("passes through simple valid completion", () => {
      const editor = makeFakeEditor({
        selectionActive: { line: 0, character: 0 },
        document: {
          languageId: "typescript",
          lineCount: 1,
          lineAt: () => ({
            text: "",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
          }),
          getText: () => ""
        }
      })
      const formatter = new CompletionFormatter(editor as any)
      const result = formatter.format("const x = 1;")
      expect(result.length).toBeGreaterThan(0)
      expect(result).toContain("const x = 1")
    })

    it("strips leading whitespace when cursor is at beginning of line", () => {
      const editor = makeFakeEditor({
        selectionActive: { line: 0, character: 0 }
      })
      const formatter = new CompletionFormatter(editor as any)
      const result = formatter.format("    indented")
      expect(result.startsWith(" ")).toBe(false)
    })

    it("preserves leading whitespace when cursor already has indentation", () => {
      const editor = makeFakeEditor({
        selectionActive: { line: 0, character: 4 }
      })
      const formatter = new CompletionFormatter(editor as any)
      const result = formatter.format("  content")
      expect(result).toBe("  content")
    })

    it("detects middle-of-word and clears completion when charBefore and charAfter are word chars", () => {
      // Cursor at position 3 in "hel", charBefore = "l", textAfterCursor = "lo" from getText, charAfter = "l"
      const editor = makeFakeEditor({
        selectionActive: { line: 0, character: 3 },
        documentLine: { text: "hello" },
        document: {
          languageId: "typescript",
          lineCount: 1,
          lineAt: () => ({
            text: "hello",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
          }),
          getText: (_range?: any) => "lo"
        }
      })
      const formatter = new CompletionFormatter(editor as any)
      // isCursorAtMiddleOfWord: charAfter="l", charBefore="l" → both are \w → true
      // skipMiddleOfWord sets completion to ""
      const result = formatter.format("extra")
      expect(result).toBe("")
    })
  })

  describe("format() edge cases", () => {
    it("handles completions with trailing whitespace", () => {
      const editor = makeFakeEditor()
      const formatter = new CompletionFormatter(editor as any)
      const result = formatter.format("foo   ")
      expect(result).toBe("foo")
    })

    it("handles multi-line completions", () => {
      const editor = makeFakeEditor({
        selectionActive: { line: 0, character: 0 }
      })
      const formatter = new CompletionFormatter(editor as any)
      const result = formatter.format("line1\nline2\nline3")
      expect(result.length).toBeGreaterThan(0)
    })

    it("handles code that starts with comment syntax for typescript", () => {
      const editor = makeFakeEditor({
        selectionActive: { line: 0, character: 0 }
      })
      const formatter = new CompletionFormatter(editor as any)
      const result = formatter.format("/* comment */ const x = 1;")
      // normalize() strips comment prefix only when getLanguage() finds a known language;
      // with mock activeTextEditor=undefined, languageId is undefined, so prefix stays.
      // The format pipeline still processes it usefully.
      expect(result.length).toBeGreaterThan(0)
      // The content after normalization should still contain the variable declaration
      expect(result).toContain("x = 1")
    })
  })

  describe("string similarity", () => {
    it("calculateStringSimilarity returns 1.0 for identical strings", () => {
      const editor = makeFakeEditor()
      const formatter = new CompletionFormatter(editor as any)
      const sim = (formatter as any).calculateStringSimilarity("hello", "hello")
      expect(sim).toBe(1.0)
    })

    it("calculateStringSimilarity returns 0.0 for empty strings", () => {
      const editor = makeFakeEditor()
      const formatter = new CompletionFormatter(editor as any)
      expect((formatter as any).calculateStringSimilarity("", "hello")).toBe(0.0)
      expect((formatter as any).calculateStringSimilarity("hello", "")).toBe(0.0)
    })

    it("calculateStringSimilarity returns value between 0 and 1 for similar strings", () => {
      const editor = makeFakeEditor()
      const formatter = new CompletionFormatter(editor as any)
      const sim = (formatter as any).calculateStringSimilarity("hello", "hallo")
      expect(sim).toBeGreaterThan(0)
      expect(sim).toBeLessThan(1)
    })
  })
})
