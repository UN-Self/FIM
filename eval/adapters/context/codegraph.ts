import path from "path"

import { ContextAdapter, ContextAdapterInput, ContextIR } from "../types"
import type {
  ContextChunk as GraphContextChunk,
  GraphBudget,
  GraphEvidence,
  GraphProvider,
  GraphRefreshRequest,
  GraphRefreshResult,
  GraphSeed,
  GraphStatus,
  TokenBudget,
  WorkspaceRef
} from "@fim/protocol"

interface CodeGraphInstance {
  buildContext(
    query: string,
    options: { maxNodes: number; includeCode: boolean; format: "markdown" }
  ): Promise<string>
  close(): void
  indexAll(options?: { onProgress?: () => void }): Promise<void>
}

interface CodeGraphModule {
  init(workspaceRoot: string): Promise<CodeGraphInstance>
  open(workspaceRoot: string): Promise<CodeGraphInstance>
}

const instances = new Map<string, Promise<CodeGraphInstance>>()

function getCodeGraphModule(): CodeGraphModule {
  try {
    // The vendor is optional outside the CodeGraph matrices.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require("@colbymchenry/codegraph")
    return (loaded.default || loaded) as CodeGraphModule
  } catch {
    throw new Error(
      "CodeGraph is not installed. Run `npm install` in eval before using CodeGraph matrices."
    )
  }
}

async function getGraph(workspaceRoot: string): Promise<CodeGraphInstance> {
  const existing = instances.get(workspaceRoot)
  if (existing) return existing

  const graph = (async () => {
    const CodeGraph = getCodeGraphModule()
    try {
      const opened = await CodeGraph.open(workspaceRoot)
      await opened.indexAll()
      return opened
    } catch {
      const created = await CodeGraph.init(workspaceRoot)
      await created.indexAll()
      return created
    }
  })()
  instances.set(workspaceRoot, graph)
  return graph
}

function toRelativePath(workspaceRoot: string, filePath: string): string {
  const relativePath = path.relative(workspaceRoot, filePath)
  return relativePath && !relativePath.startsWith("..") ? relativePath : filePath
}

function relationForSeed(source: string): GraphEvidence["relation"] {
  return source === "import" ? "import" : "reference"
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractEvidence(
  text: string,
  seed: GraphSeed,
  workspaceRoot: string,
  maxSymbols: number
): GraphEvidence[] {
  if (!text.trim()) return []

  const evidence = new Map<string, GraphEvidence>()
  const addEvidence = (
    symbolId: string,
    filePath: string,
    relation: GraphEvidence["relation"]
  ) => {
    const key = `${symbolId}:${filePath}:${relation}`
    if (!evidence.has(key)) {
      evidence.set(key, {
        symbolId,
        filePath: toRelativePath(workspaceRoot, filePath),
        relation,
        freshness: "fresh",
        provenance: "codegraph"
      })
    }
  }

  for (const symbol of seed.symbols) {
    if (new RegExp(`\\b${escapeRegExp(symbol.symbolId)}\\b`).test(text)) {
      addEvidence(symbol.symbolId, symbol.filePath, relationForSeed(symbol.source))
    }
  }

  // CodeGraph returns markdown rather than a typed edge list. Preserve the
  // symbol names it exposed while keeping the source file traceable.
  const declaration = /\b(?:class|function|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g
  for (const match of text.matchAll(declaration)) {
    const filePath = seed.symbols[0]?.filePath ?? workspaceRoot
    addEvidence(match[1], filePath, "reference")
    if (evidence.size >= maxSymbols) break
  }

  // The vendor response is markdown and can omit a parseable declaration.
  // A non-empty graph response still establishes that the cursor seed was
  // resolved, so retain it and allow read() to fetch the corresponding code.
  if (evidence.size === 0 && seed.symbols[0]) {
    const symbol = seed.symbols[0]
    addEvidence(symbol.symbolId, symbol.filePath, relationForSeed(symbol.source))
  }

  return [...evidence.values()].slice(0, maxSymbols)
}

/**
 * GraphProvider used by ChainV2. It queries the same CodeGraph instance as
 * the legacy context collector, but exposes the engine's structured contract.
 */
export class CodeGraphEvalProvider implements GraphProvider {
  constructor(
    private readonly workspaceRoot: string,
    private readonly maxNodes: number
  ) {}

  async warm(): Promise<void> {
    await getGraph(this.workspaceRoot)
  }

  async status(_workspace: WorkspaceRef): Promise<GraphStatus> {
    try {
      await this.warm()
      return { available: true, message: "ready", symbolCount: -1 }
    } catch (error) {
      return {
        available: false,
        message: error instanceof Error ? error.message : "CodeGraph unavailable",
        symbolCount: 0
      }
    }
  }

  async refresh(_request: GraphRefreshRequest): Promise<GraphRefreshResult> {
    try {
      const graph = await getGraph(this.workspaceRoot)
      await graph.indexAll()
      return { ok: true, changed: 0 }
    } catch (error) {
      return {
        ok: false,
        changed: 0,
        error: error instanceof Error ? error.message : "CodeGraph refresh failed"
      }
    }
  }

  async expand(seed: GraphSeed, budget: GraphBudget): Promise<GraphEvidence[]> {
    const graph = await getGraph(this.workspaceRoot)
    const query = [
      "Return symbols relevant to this completion, including definitions, callers, callees, references, and imports.",
      ...seed.symbols.map(
        (symbol) =>
          `Seed ${symbol.source}: ${symbol.symbolId} in ${toRelativePath(this.workspaceRoot, symbol.filePath)}`
      )
    ].join("\n")
    const text = await graph.buildContext(query, {
      maxNodes: Math.min(this.maxNodes, budget.maxSymbols),
      includeCode: false,
      format: "markdown"
    })

    return extractEvidence(text, seed, this.workspaceRoot, budget.maxSymbols)
  }

  async read(symbolIds: string[], budget: TokenBudget): Promise<GraphContextChunk[]> {
    if (symbolIds.length === 0) return []

    const graph = await getGraph(this.workspaceRoot)
    const text = await graph.buildContext(
      [
        "Read the source code for these symbols and include their implementations.",
        symbolIds.join(", ")
      ].join("\n"),
      {
        maxNodes: Math.min(this.maxNodes, Math.max(symbolIds.length * 3, 1)),
        includeCode: true,
        format: "markdown"
      }
    )
    if (!text.trim()) return []

    const maxChars = budget.maxTokens * 4
    return [
      {
        filePath: this.workspaceRoot,
        text: text.slice(0, maxChars),
        symbolId: symbolIds[0],
        reason: "CodeGraph relevant code subgraph"
      }
    ]
  }
}

export class CodeGraphContextCollector implements ContextAdapter {
  public readonly name = "codegraph"

  constructor(private readonly maxNodes: number) {}

  async collect(input: ContextAdapterInput): Promise<ContextIR> {
    const graph = await getGraph(input.workspaceRoot)
    const relativePath = path.relative(input.workspaceRoot, input.filePath)
    const query = [
      `Complete code at cursor in ${relativePath}.`,
      "Return the relevant symbols, callers, callees, types, and implementation code.",
      `Code before cursor:\n${input.prefixSuffix.prefix.slice(-2000)}`,
      `Code after cursor:\n${input.prefixSuffix.suffix.slice(0, 600)}`
    ].join("\n\n")
    const text = await graph.buildContext(query, {
      maxNodes: this.maxNodes,
      includeCode: true,
      format: "markdown"
    })

    return {
      chunks: text.trim()
        ? [
            {
              filePath: input.workspaceRoot,
              text,
              reason: "CodeGraph relevant code subgraph"
            }
          ]
        : [],
      tokenEstimate: Math.ceil(text.length / 4),
      source: "codegraph"
    }
  }
}

export function closeCodeGraphInstances() {
  for (const graph of instances.values()) {
    void graph.then((instance) => instance.close())
  }
  instances.clear()
}
