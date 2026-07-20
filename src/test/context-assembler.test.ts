// ---------------------------------------------------------------------------
// ContextAssembler tests (Phase 3)
//
// Tests for graph seed generation, context assembly, budget trimming,
// fallback behavior, and deduplication.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest"

import {
  ContextAssembler,
  deduplicateChunks,
  deduplicateEvidence,
  deduplicateSymbolIds,
  estimateTokens,
  extractImports,
  extractLocalIdentifiers,
  extractParentScope,
  formatContextChunks,
  generateGraphSeed,
  sortEvidence,
  trimToBudget
} from "../../services/engine-ts/src/context/graph-assembler"
import type {
  AssemblyResult,
  GraphSeedInput
} from "../../services/engine-ts/src/context/graph-assembler"
import type {
  ContextChunk,
  GraphBudget,
  GraphEvidence,
  GraphProvider,
  GraphSeed,
  GraphStatus,
  TokenBudget
} from "@fim/protocol"

// ---- Helpers ---------------------------------------------------------------

function makeSeedInput(overrides: Partial<GraphSeedInput> = {}): GraphSeedInput {
  return {
    filePath: "/src/utils.ts",
    languageId: "typescript",
    prefix: "",
    suffix: "",
    cursorLine: 10,
    cursorCharacter: 5,
    ...overrides
  }
}

/** A graph provider that always returns empty / disabled. */
function nullGraphProvider(): GraphProvider {
  return {
    status: async () => ({
      available: false,
      message: "disabled",
      symbolCount: 0
    }),
    refresh: async () => ({ ok: false, changed: 0, error: "disabled" }),
    expand: async () => [],
    read: async () => []
  }
}

/** A graph provider that throws from expand(). */
function throwingGraphProvider(): GraphProvider {
  return {
    status: async () => ({
      available: true,
      message: "ready",
      symbolCount: 100
    }),
    refresh: async () => ({ ok: true, changed: 0 }),
    expand: async () => {
      throw new Error("CodeGraph connection refused")
    },
    read: async () => []
  }
}

/** A graph provider that returns mock evidence and chunks. */
function mockGraphProvider(
  evidence: GraphEvidence[],
  chunks: ContextChunk[]
): GraphProvider {
  return {
    status: async () => ({
      available: true,
      message: "ready",
      symbolCount: 200
    }),
    refresh: async () => ({ ok: true, changed: 0 }),
    expand: async () => evidence,
    read: async (symbolIds: string[], _budget: TokenBudget) => {
      return chunks.filter(c =>
        symbolIds.includes(c.symbolId ?? "")
      )
    }
  }
}

// ---- GraphSeed generation tests -------------------------------------------

describe("generateGraphSeed", () => {
  it("returns a seed with at least the file path cursor symbol", () => {
    const input = makeSeedInput()
    const seed = generateGraphSeed(input)

    expect(seed.symbols.length).toBeGreaterThanOrEqual(1)
    expect(seed.symbols[0].symbolId).toBe("/src/utils.ts")
    expect(seed.symbols[0].source).toBe("cursor")
    expect(seed.maxDepth).toBe(2)
  })

  it("extracts a parent scope from a JavaScript function", () => {
    const prefix = "import foo from 'bar'\n\nfunction calculateSum(a: number, b: number) {\n  const result = "
    const input = makeSeedInput({ prefix })
    const seed = generateGraphSeed(input)

    const parentScopes = seed.symbols.filter(s => s.source === "parent_scope")
    expect(parentScopes.length).toBeGreaterThanOrEqual(1)
    expect(parentScopes[0].symbolId).toBe("calculateSum")
  })

  it("extracts a parent scope from a Python def", () => {
    const prefix =
      "import os\n\ndef process_data(items):\n    result = "
    const input = makeSeedInput({
      prefix,
      languageId: "python"
    })
    const seed = generateGraphSeed(input)

    const parentScopes = seed.symbols.filter(s => s.source === "parent_scope")
    expect(parentScopes.length).toBeGreaterThanOrEqual(1)
    expect(parentScopes[0].symbolId).toBe("process_data")
  })

  it("extracts a parent scope from a class declaration", () => {
    const prefix = "class UserService {\n  constructor(\n    private db: Database\n  ) {}\n\n  async findById(id: string) {\n    return this.db."
    const input = makeSeedInput({ prefix })
    const seed = generateGraphSeed(input)

    const scopes = seed.symbols
      .filter(s => s.source === "parent_scope")
      .map(s => s.symbolId)
    // Class name takes priority over method name for graph seed purposes
    expect(scopes).toContain("UserService")
  })

  it("extracts imported symbols from JS/TS named imports", () => {
    const prefix =
      "import { useState, useEffect } from 'react'\nimport { formatDate, parseDate } from './date-utils'\n\nfunction MyComponent() {\n  const [date, setDate] = "
    const input = makeSeedInput({ prefix })
    const seed = generateGraphSeed(input)

    const imports = seed.symbols.filter(s => s.source === "import")
    const importNames = imports.map(s => s.symbolId)
    expect(importNames).toContain("useState")
    expect(importNames).toContain("useEffect")
    expect(importNames).toContain("formatDate")
    expect(importNames).toContain("parseDate")
  })

  it("extracts JS/TS default imports", () => {
    const prefix = "import React from 'react'\nimport _ from 'lodash'\n\nconst App = "
    const input = makeSeedInput({ prefix })
    const seed = generateGraphSeed(input)

    const imports = seed.symbols.filter(s => s.source === "import")
    const importNames = imports.map(s => s.symbolId)
    expect(importNames).toContain("React")
    expect(importNames).toContain("_")
  })

  it("handles import aliases (import { x as y })", () => {
    const prefix =
      "import { useState as useReactState } from 'react'\n\nfunction App() {\n  const s = "
    const input = makeSeedInput({ prefix })
    const seed = generateGraphSeed(input)

    const imports = seed.symbols.filter(s => s.source === "import")
    const importNames = imports.map(s => s.symbolId)
    expect(importNames).toContain("useReactState")
  })

  it("extracts Python imports", () => {
    const prefix =
      "from datetime import datetime, timedelta\nimport json\n\ndef handler():\n    now = "
    const input = makeSeedInput({
      prefix,
      languageId: "python"
    })
    const seed = generateGraphSeed(input)

    const imports = seed.symbols.filter(s => s.source === "import")
    const names = imports.map(s => s.symbolId)
    expect(names).toContain("datetime")
    expect(names).toContain("timedelta")
    expect(names).toContain("json")
  })

  it("extracts Go import package names", () => {
    const prefix =
      'package main\n\nimport (\n  "fmt"\n  "net/http"\n  "github.com/user/lib"\n)\n\nfunc main() {\n  fmt.'
    const input = makeSeedInput({
      prefix,
      languageId: "go"
    })
    const seed = generateGraphSeed(input)

    const imports = seed.symbols.filter(s => s.source === "import")
    const names = imports.map(s => s.symbolId)
    expect(names).toContain("fmt")
    expect(names).toContain("http")
    expect(names).toContain("lib")
  })

  it("extracts local identifiers near cursor", () => {
    const prefix =
      "function processOrder(order: Order, customer: Customer) {\n  const totalAmount = order.items.reduce((sum, item) => sum + item.price, 0)\n  const discount = getDiscount(customer)\n  return total"
    const input = makeSeedInput({ prefix })
    const seed = generateGraphSeed(input)

    // Also test extractLocalIdentifiers directly
    const directResult = extractLocalIdentifiers(prefix, "", 10)
    expect(directResult).toContain("getDiscount")

    const locals = seed.symbols.filter(s => s.source === "local_identifier")
    const names = locals.map(s => s.symbolId)
    // Should contain identifiers from the last few lines
    expect(names).toContain("totalAmount")
    expect(names).toContain("discount")
    expect(names).toContain("getDiscount")
    expect(names).toContain("customer")
  })

  it("filters out keywords from local identifiers", () => {
    const prefix =
      "function test() {\n  const x = 1\n  if (true) {\n    return new Promise("
    const input = makeSeedInput({ prefix })
    const seed = generateGraphSeed(input)

    const locals = seed.symbols.filter(s => s.source === "local_identifier")
    const names = locals.map(s => s.symbolId)
    expect(names).not.toContain("if")
    expect(names).not.toContain("return")
    expect(names).not.toContain("new")
    expect(names).not.toContain("const")
    expect(names).not.toContain("function")
    expect(names).not.toContain("true")
    // "Promise" should be present (not a keyword)
    expect(names).toContain("Promise")
  })

  it("deduplicates symbols by symbolId", () => {
    const prefix =
      "import { foo } from 'bar'\n\nconst foo = 123\n\nfunction foo() {\n  return "
    const input = makeSeedInput({ prefix })
    const seed = generateGraphSeed(input)

    const fooSymbols = seed.symbols.filter(s => s.symbolId === "foo")
    // Should be deduplicated — at most 1 per symbolId
    expect(fooSymbols.length).toBeLessThanOrEqual(1)
  })
})

// ---- Parent scope extraction tests ----------------------------------------

describe("extractParentScope", () => {
  it("extracts a JavaScript function name", () => {
    const prefix = "import x from 'y'\n\nfunction helloWorld() {\n  const a = "
    expect(extractParentScope(prefix, "typescript")).toBe("helloWorld")
  })

  it("extracts an async function name", () => {
    const prefix = "async function fetchData(url: string) {\n  const resp = await "
    expect(extractParentScope(prefix, "typescript")).toBe("fetchData")
  })

  it("extracts a class name", () => {
    const prefix = "class MyService {\n  constructor() {\n    this."
    expect(extractParentScope(prefix, "typescript")).toBe("MyService")
  })

  it("extracts a Python function name", () => {
    const prefix = "def calculate_total(items):\n    result = "
    expect(extractParentScope(prefix, "python")).toBe("calculate_total")
  })

  it("extracts a Rust fn name", () => {
    const prefix = "fn process_input(data: &[u8]) -> Result<()> {\n    let x = "
    expect(extractParentScope(prefix, "rust")).toBe("process_input")
  })

  it("returns null for empty prefix", () => {
    expect(extractParentScope("", "typescript")).toBeNull()
  })

  it("returns null when no function/class is found", () => {
    const prefix = "const x = 1\nconst y = 2\nconst z = "
    expect(extractParentScope(prefix, "typescript")).toBeNull()
  })

  it("extracts PHP function name", () => {
    const prefix = "public function handleRequest(Request $req): Response {\n    $data = "
    expect(extractParentScope(prefix, "php")).toBe("handleRequest")
  })
})

// ---- Import extraction tests ----------------------------------------------

describe("extractImports", () => {
  it("extracts named JS/TS imports", () => {
    const prefix =
      "import { foo, bar, baz } from './module'\n\nconst x = "
    const result = extractImports(prefix, "typescript")
    expect(result).toContain("foo")
    expect(result).toContain("bar")
    expect(result).toContain("baz")
  })

  it("extracts default imports", () => {
    const prefix = "import React from 'react'\n\nconst App = "
    const result = extractImports(prefix, "typescript")
    expect(result).toContain("React")
  })

  it("extracts namespace imports", () => {
    const prefix = "import * as utils from './utils'\n\nconst result = "
    const result = extractImports(prefix, "typescript")
    expect(result).toContain("utils")
  })

  it("extracts require() calls", () => {
    const prefix = "const fs = require('fs')\n\nconst data = "
    const result = extractImports(prefix, "typescript")
    expect(result).toContain("fs")
  })

  it("extracts Python from-imports", () => {
    const prefix =
      "from datetime import datetime, timedelta, timezone\n\nnow = "
    const result = extractImports(prefix, "python")
    expect(result).toContain("datetime")
    expect(result).toContain("timedelta")
    expect(result).toContain("timezone")
  })

  it("extracts Python direct imports", () => {
    const prefix = "import os\nimport json\n\ndata = "
    const result = extractImports(prefix, "python")
    expect(result).toContain("os")
    expect(result).toContain("json")
  })

  it("handles Python import with alias", () => {
    const prefix =
      "from collections import defaultdict as dd\n\nd = "
    const result = extractImports(prefix, "python")
    expect(result).toContain("dd")
  })

  it("extracts Rust use statements", () => {
    const prefix =
      "use std::collections::HashMap;\nuse crate::utils::parse;\n\nfn main() {\n    let map = "
    const result = extractImports(prefix, "rust")
    expect(result).toContain("HashMap")
    expect(result).toContain("parse")
  })

  it("returns empty array for empty prefix", () => {
    expect(extractImports("", "typescript")).toEqual([])
  })
})

// ---- Local identifier extraction tests ------------------------------------

describe("extractLocalIdentifiers", () => {
  it("extracts identifiers from prefix lines near cursor", () => {
    const prefix =
      "function process(order: Order, user: User) {\n  const totalAmount = order.calculate()\n  const discount = user.getDiscount()\n  return total"
    const result = extractLocalIdentifiers(prefix, "", 10)
    expect(result).toContain("totalAmount")
    expect(result).toContain("discount")
    expect(result).toContain("user")
    expect(result).toContain("order")
  })

  it("extracts identifiers from suffix", () => {
    const suffix = "customer.applyDiscount(discount)"
    const result = extractLocalIdentifiers("", suffix, 0)
    expect(result).toContain("customer")
    expect(result).toContain("applyDiscount")
    expect(result).toContain("discount")
  })

  it("filters out short identifiers (< 3 chars)", () => {
    const prefix = "const a = 1\nconst b = 2\nconst meaningful = a + "
    const result = extractLocalIdentifiers(prefix, "", 10)
    expect(result).not.toContain("a")
    expect(result).not.toContain("b")
    expect(result).toContain("meaningful")
  })

  it("returns empty for empty prefix and suffix", () => {
    expect(extractLocalIdentifiers("", "", 0)).toEqual([])
  })
})

// ---- Evidence sorting tests -----------------------------------------------

describe("sortEvidence", () => {
  it("sorts by relationship priority (definition first)", () => {
    const evidence: GraphEvidence[] = [
      {
        symbolId: "ref",
        filePath: "/a.ts",
        relation: "reference",
        freshness: "fresh",
        provenance: "codegraph"
      },
      {
        symbolId: "def",
        filePath: "/a.ts",
        relation: "definition",
        freshness: "fresh",
        provenance: "codegraph"
      },
      {
        symbolId: "imp",
        filePath: "/a.ts",
        relation: "import",
        freshness: "fresh",
        provenance: "codegraph"
      }
    ]

    const sorted = sortEvidence(evidence)
    expect(sorted[0].relation).toBe("definition")
    expect(sorted[1].relation).toBe("reference")
    expect(sorted[2].relation).toBe("import")
  })

  it("sorts stale after fresh when same relation", () => {
    const evidence: GraphEvidence[] = [
      {
        symbolId: "staleRef",
        filePath: "/a.ts",
        relation: "reference",
        freshness: "stale",
        provenance: "codegraph"
      },
      {
        symbolId: "freshRef",
        filePath: "/a.ts",
        relation: "reference",
        freshness: "fresh",
        provenance: "codegraph"
      }
    ]

    const sorted = sortEvidence(evidence)
    expect(sorted[0].symbolId).toBe("freshRef")
    expect(sorted[1].symbolId).toBe("staleRef")
  })
})

// ---- Deduplication tests --------------------------------------------------

describe("deduplicateEvidence", () => {
  it("removes duplicate symbolIds keeping first occurrence", () => {
    const evidence: GraphEvidence[] = [
      {
        symbolId: "foo",
        filePath: "/a.ts",
        relation: "definition",
        freshness: "fresh",
        provenance: "codegraph"
      },
      {
        symbolId: "foo",
        filePath: "/b.ts",
        relation: "reference",
        freshness: "stale",
        provenance: "codegraph"
      },
      {
        symbolId: "bar",
        filePath: "/c.ts",
        relation: "caller",
        freshness: "fresh",
        provenance: "codegraph"
      }
    ]

    const result = deduplicateEvidence(evidence)
    expect(result.length).toBe(2)
    expect(result[0].symbolId).toBe("foo")
    expect(result[0].relation).toBe("definition") // first wins
    expect(result[1].symbolId).toBe("bar")
  })
})

describe("deduplicateSymbolIds", () => {
  it("returns unique ordered symbol IDs", () => {
    const evidence: GraphEvidence[] = [
      {
        symbolId: "a",
        filePath: "/a.ts",
        relation: "definition",
        freshness: "fresh",
        provenance: "codegraph"
      },
      {
        symbolId: "b",
        filePath: "/b.ts",
        relation: "caller",
        freshness: "fresh",
        provenance: "codegraph"
      },
      {
        symbolId: "a",
        filePath: "/a.ts",
        relation: "reference",
        freshness: "fresh",
        provenance: "codegraph"
      }
    ]

    const ids = deduplicateSymbolIds(evidence)
    expect(ids).toEqual(["a", "b"])
  })
})

describe("deduplicateChunks", () => {
  it("removes duplicate chunks by symbolId", () => {
    const chunks: ContextChunk[] = [
      {
        filePath: "/a.ts",
        text: "function foo() {}",
        symbolId: "foo"
      },
      {
        filePath: "/b.ts",
        text: "function foo() {}",
        symbolId: "foo"
      },
      {
        filePath: "/c.ts",
        text: "function bar() {}",
        symbolId: "bar"
      }
    ]

    const result = deduplicateChunks(chunks)
    expect(result.length).toBe(2)
    const ids = result.map(c => c.symbolId)
    expect(ids).toEqual(["foo", "bar"])
  })

  it("falls back to filePath dedup when no symbolId", () => {
    const chunks: ContextChunk[] = [
      { filePath: "/a.ts", text: "code a" },
      { filePath: "/a.ts", text: "code a again" },
      { filePath: "/b.ts", text: "code b" }
    ]

    const result = deduplicateChunks(chunks)
    expect(result.length).toBe(2)
  })
})

// ---- Token estimation and budget trimming tests ----------------------------

describe("estimateTokens", () => {
  it("estimates tokens as chars/4", () => {
    const chunks: ContextChunk[] = [
      { filePath: "/a.ts", text: "12345678" } // 8 chars -> 2 tokens
    ]
    expect(estimateTokens(chunks)).toBe(2)
  })

  it("returns 0 for empty chunks", () => {
    expect(estimateTokens([])).toBe(0)
  })
})

describe("trimToBudget", () => {
  it("keeps chunks that fit within the token budget", () => {
    const chunks: ContextChunk[] = [
      { filePath: "/a.ts", text: "a".repeat(400) }, // ~100 tokens
      { filePath: "/b.ts", text: "b".repeat(400) }, // ~100 tokens
      { filePath: "/c.ts", text: "c".repeat(400) } // ~100 tokens
    ]
    const budget: TokenBudget = { maxTokens: 250 }

    const result = trimToBudget(chunks, budget)
    // First two (200 tokens) fit, third would push to 300 > 250
    expect(result.length).toBe(2)
  })

  it("always keeps at least one chunk regardless of budget", () => {
    const chunks: ContextChunk[] = [
      { filePath: "/huge.ts", text: "x".repeat(10000) } // ~2500 tokens
    ]
    const budget: TokenBudget = { maxTokens: 100 }

    const result = trimToBudget(chunks, budget)
    expect(result.length).toBe(1)
  })

  it("returns empty for empty input", () => {
    expect(trimToBudget([], { maxTokens: 100 })).toEqual([])
  })
})

// ---- Context chunk formatting tests ----------------------------------------

describe("formatContextChunks", () => {
  it("formats chunks with file paths and symbol IDs", () => {
    const chunks: ContextChunk[] = [
      {
        filePath: "/src/utils.ts",
        text: "export function helper() { return 42 }",
        symbolId: "helper",
        reason: "definition"
      }
    ]

    const result = formatContextChunks(chunks)
    expect(result).toContain("/src/utils.ts")
    expect(result).toContain("(helper)")
    expect(result).toContain("helper()")
    expect(result).toContain("reason: definition")
  })

  it("returns empty string for empty chunks", () => {
    expect(formatContextChunks([])).toBe("")
  })
})

// ---- ContextAssembler integration tests ------------------------------------

describe("ContextAssembler.assemble", () => {
  const defaultBudget: GraphBudget = { maxEdges: 50, maxSymbols: 30 }
  const defaultTokenBudget: TokenBudget = { maxTokens: 2000 }

  it("returns fallback when graph provider has no data", async () => {
    const provider = nullGraphProvider()
    const assembler = new ContextAssembler(provider)
    const input = makeSeedInput({
      prefix: "function test() {\n  const x = "
    })

    const result = await assembler.assemble(
      input,
      defaultBudget,
      defaultTokenBudget
    )

    expect(result.source).toBe("fallback")
    expect(result.chunks).toEqual([])
    expect(result.evidence).toEqual([])
    expect(result.tokenEstimate).toBe(0)
  })

  it("returns fallback when expand() throws", async () => {
    const provider = throwingGraphProvider()
    const assembler = new ContextAssembler(provider)
    const input = makeSeedInput()

    const result = await assembler.assemble(
      input,
      defaultBudget,
      defaultTokenBudget
    )

    expect(result.source).toBe("fallback")
    expect(result.chunks).toEqual([])
    expect(result.evidence).toEqual([])
    // Must not throw
  })

  it("returns codegraph result when evidence and chunks are available", async () => {
    const evidence: GraphEvidence[] = [
      {
        symbolId: "calculateSum",
        filePath: "/src/utils.ts",
        relation: "definition",
        freshness: "fresh",
        provenance: "codegraph"
      },
      {
        symbolId: "formatCurrency",
        filePath: "/src/format.ts",
        relation: "import",
        freshness: "fresh",
        provenance: "codegraph"
      }
    ]

    const chunks: ContextChunk[] = [
      {
        filePath: "/src/utils.ts",
        text: "function calculateSum(a: number, b: number): number { return a + b }",
        symbolId: "calculateSum"
      },
      {
        filePath: "/src/format.ts",
        text: "export function formatCurrency(amount: number, currency: string): string { return '' }",
        symbolId: "formatCurrency"
      }
    ]

    const provider = mockGraphProvider(evidence, chunks)
    const assembler = new ContextAssembler(provider)
    const input = makeSeedInput({
      prefix: "import { formatCurrency } from './format'\n\nfunction main() {\n  const result = calculateSum(1, 2)\n  return format"
    })

    const result = await assembler.assemble(
      input,
      defaultBudget,
      defaultTokenBudget
    )

    expect(result.source).toBe("codegraph")
    expect(result.evidence.length).toBe(2)
    expect(result.chunks.length).toBe(2)
    expect(result.tokenEstimate).toBeGreaterThan(0)
  })

  it("returns fallback when expand returns empty evidence", async () => {
    const provider = mockGraphProvider([], [])
    const assembler = new ContextAssembler(provider)
    const input = makeSeedInput()

    const result = await assembler.assemble(
      input,
      defaultBudget,
      defaultTokenBudget
    )

    expect(result.source).toBe("fallback")
    expect(result.evidence).toEqual([])
    expect(result.chunks).toEqual([])
  })
})

// ---- Degradation strategy tests -------------------------------------------

describe("ContextAssembler degradation", () => {
  it("returns fallback when read() throws but expand() succeeded", async () => {
    const evidence: GraphEvidence[] = [
      {
        symbolId: "helper",
        filePath: "/src/helper.ts",
        relation: "callee",
        freshness: "fresh",
        provenance: "codegraph"
      }
    ]

    // Provider where read() throws but expand() works
    const provider: GraphProvider = {
      status: async () => ({
        available: true,
        message: "ready",
        symbolCount: 50
      }),
      refresh: async () => ({ ok: true, changed: 0 }),
      expand: async () => evidence,
      read: async () => {
        throw new Error("Read failed")
      }
    }

    const assembler = new ContextAssembler(provider)
    const input = makeSeedInput()

    const result = await assembler.assemble(
      input,
      { maxEdges: 50, maxSymbols: 30 },
      { maxTokens: 2000 }
    )

    // Evidence should still be returned even though read() failed
    expect(result.evidence.length).toBe(1)
  })

  it("never throws from assemble() on any provider error", async () => {
    // Provider where everything throws
    const provider: GraphProvider = {
      status: async () => {
        throw new Error("status failed")
      },
      refresh: async () => {
        throw new Error("refresh failed")
      },
      expand: async () => {
        throw new Error("expand failed")
      },
      read: async () => {
        throw new Error("read failed")
      }
    }

    const assembler = new ContextAssembler(provider)
    const input = makeSeedInput()

    // Should not throw
    const result = await assembler.assemble(
      input,
      { maxEdges: 50, maxSymbols: 30 },
      { maxTokens: 2000 }
    )

    expect(result.source).toBe("fallback")
  })
})

// ---- Edge-case tests ------------------------------------------------------

describe("ContextAssembler edge cases", () => {
  it("handles empty prefix and suffix gracefully", async () => {
    const provider = nullGraphProvider()
    const assembler = new ContextAssembler(provider)
    const input = makeSeedInput({ prefix: "", suffix: "" })

    const result = await assembler.assemble(
      input,
      { maxEdges: 50, maxSymbols: 30 },
      { maxTokens: 2000 }
    )

    expect(result.source).toBe("fallback")
    expect(result.chunks).toEqual([])
  })

  it("handles very large prefix by only scanning visible context", () => {
    // Generate a huge prefix (10K lines) — should not crash or OOM
    const hugePrefix = Array(10000)
      .fill(null)
      .map((_, i) => `const var${i} = ${i}`)
      .join("\n")
    const input = makeSeedInput({ prefix: hugePrefix })

    // Should not throw
    const seed = generateGraphSeed(input)
    expect(seed.symbols.length).toBeGreaterThan(0)
  })

  it("generates GraphSeed with correct filePath and maxDepth", () => {
    const input = makeSeedInput({
      filePath: "/home/user/project/src/index.ts",
      languageId: "typescript"
    })
    const seed = generateGraphSeed(input)

    expect(seed.symbols[0].filePath).toBe(
      "/home/user/project/src/index.ts"
    )
    expect(seed.maxDepth).toBe(2)
  })
})
