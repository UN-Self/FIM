import {
  ContextChunk,
  GraphBudget,
  GraphEvidence,
  GraphProvider,
  GraphRefreshRequest,
  GraphRefreshResult,
  GraphSeed,
  GraphStatus,
  TokenBudget,
  WorkspaceRef
} from "./provider"

// ── Vendor surface (what we call on @colbymchenry/codegraph) ──

interface CodeGraphInstance {
  buildContext(
    query: string,
    options: { maxNodes: number; includeCode: boolean; format: "markdown" }
  ): Promise<string>
  indexAll(options?: { onProgress?: (info: { completed: number; total: number }) => void }): Promise<void>
  close(): void
}

interface CodeGraphModule {
  init(workspaceRoot: string): Promise<CodeGraphInstance>
  open(workspaceRoot: string): Promise<CodeGraphInstance>
}

// ── Module cache and lazy loader ──

let codegraphModule: CodeGraphModule | null = null
let moduleLoadAttempted = false

function resolveRoot(workspace: WorkspaceRef): string {
  // Strip file:// prefix if present so we always pass a plain path to the vendor.
  const uri = workspace.rootUri
  if (uri.startsWith("file://")) {
    return uri.slice("file://".length)
  }
  return uri
}

function loadModule(): CodeGraphModule | null {
  if (moduleLoadAttempted) return codegraphModule
  moduleLoadAttempted = true
  try {
    // The vendor is optional. Use a dynamic require wrapped in try/catch so
    // the adapter works when @colbymchenry/codegraph is not installed.
    const loaded = require("@colbymchenry/codegraph") as
      | CodeGraphModule
      | { default: CodeGraphModule }
    codegraphModule = (loaded as { default?: CodeGraphModule }).default || (loaded as CodeGraphModule)
    return codegraphModule
  } catch {
    codegraphModule = null
    return null
  }
}

// ── Instance cache (one per workspace root) ──

const instances = new Map<string, CodeGraphInstance>()

async function getOrCreateInstance(root: string): Promise<CodeGraphInstance> {
  const existing = instances.get(root)
  if (existing) return existing

  const mod = loadModule()
  if (!mod) {
    throw new Error("CodeGraph is not installed or could not be loaded")
  }

  let instance: CodeGraphInstance
  try {
    instance = await mod.open(root)
  } catch {
    instance = await mod.init(root)
  }
  instances.set(root, instance)
  return instance
}

// ── Token estimation (rough: ~4 chars per token for code) ──

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ── Adapter ──

export class CodeGraphAdapter implements GraphProvider {
  // ── status ──

  async status(workspace: WorkspaceRef): Promise<GraphStatus> {
    const mod = loadModule()
    if (!mod) {
      return { state: "disabled" }
    }

    const root = resolveRoot(workspace)
    try {
      const instance = await getOrCreateInstance(root)
      // We have a live instance. The vendor does not expose a granular
      // progress API, so we report ready once the instance is open.
      // Callers that need more detail can watch the indexer lifecycle.
      return {
        state: "ready",
        lastIndexedAt: Date.now()
      }
    } catch (err) {
      return {
        state: "error",
        error: err instanceof Error ? err.message : "Unknown CodeGraph error"
      }
    }
  }

  // ── refresh ──

  async refresh(request: GraphRefreshRequest): Promise<GraphRefreshResult> {
    const mod = loadModule()
    if (!mod) {
      return { ok: false, indexedFiles: 0, errors: ["CodeGraph is not installed"] }
    }

    const root = resolveRoot(request.workspace)
    try {
      const instance = await getOrCreateInstance(root)
      await instance.indexAll()
      return { ok: true, indexedFiles: -1, errors: [] }
    } catch (err) {
      // Index corruption → discard bad instance and re-create on next access
      instances.delete(root)
      return {
        ok: false,
        indexedFiles: 0,
        errors: [err instanceof Error ? err.message : "Index refresh failed"]
      }
    }
  }

  // ── expand ──

  async expand(seed: GraphSeed, budget: GraphBudget): Promise<GraphEvidence[]> {
    const mod = loadModule()
    if (!mod) return []

    // Resolve workspace from the seed's filePath by walking up to the
    // nearest .codegraph/ directory. For the spike we accept the workspace
    // root via a convention: the caller should have called status/refresh
    // first, and we look up the matching instance.
    const root = findMatchingRoot(seed.filePath)
    if (!root) return []

    try {
      const instance = await getOrCreateInstance(root)
      const query = buildExpandQuery(seed)
      const text = await instance.buildContext(query, {
        maxNodes: budget.maxNodes,
        includeCode: false,
        format: "markdown"
      })
      return parseEvidence(text, seed.filePath)
    } catch {
      return []
    }
  }

  // ── read ──

  async read(symbolIds: string[], budget: TokenBudget): Promise<ContextChunk[]> {
    const mod = loadModule()
    if (!mod) return []

    if (symbolIds.length === 0) return []

    // Pick a workspace root from the first registered instance.
    const root = firstRegisteredRoot()
    if (!root) return []

    try {
      const instance = await getOrCreateInstance(root)
      const query = buildReadQuery(symbolIds)
      const text = await instance.buildContext(query, {
        maxNodes: Math.min(symbolIds.length * 3, 50),
        includeCode: true,
        format: "markdown"
      })
      // Cap output to the token budget (rough estimate)
      if (estimateTokens(text) > budget.maxTokens) {
        const maxChars = budget.maxTokens * 4
        return [
          {
            symbolId: symbolIds.join(","),
            filePath: root,
            startLine: 0,
            endLine: 0,
            text: text.slice(0, maxChars) + "\n\n[output truncated to token budget]",
            provenance: "codegraph"
          }
        ]
      }
      return [
        {
          symbolId: symbolIds.join(","),
          filePath: root,
          startLine: 0,
          endLine: 0,
          text,
          provenance: "codegraph"
        }
      ]
    } catch {
      return []
    }
  }

  // ── cleanup ──

  close(): void {
    for (const instance of instances.values()) {
      try {
        instance.close()
      } catch {
        // Best-effort cleanup
      }
    }
    instances.clear()
  }
}

// ── Helpers ──

function findMatchingRoot(filePath: string): string | null {
  // Walk up from the file path and match against known instance roots.
  // In the spike this is a simple suffix-prefix match; production would
  // canonicalize paths and handle symlinks.
  for (const root of instances.keys()) {
    if (filePath.startsWith(root)) return root
  }
  // If no match, use the only registered root (single-workspace common case)
  if (instances.size === 1) return instances.keys().next().value
  return null
}

function firstRegisteredRoot(): string | null {
  if (instances.size === 0) return null
  return instances.keys().next().value
}

function buildExpandQuery(seed: GraphSeed): string {
  const parts = [
    `File: ${seed.filePath}`,
    `Cursor: line ${seed.line}, character ${seed.character}`,
    seed.symbolId ? `Symbol: ${seed.symbolId}` : "",
    "Return the relevant symbols at this cursor position: definitions, callers, callees, and imports."
  ]
  return parts.filter(Boolean).join("\n")
}

function buildReadQuery(symbolIds: string[]): string {
  return [
    "Read the source code of the following symbols:",
    symbolIds.join(", "),
    "Include the full implementation code."
  ].join("\n")
}

function parseEvidence(text: string, fallbackFilePath: string): GraphEvidence[] {
  if (!text.trim()) return []

  const results: GraphEvidence[] = []
  // Coarse parse: each non-empty line is a potential symbol reference.
  // A proper implementation would parse structured output from CodeGraph.
  // For the spike we extract lines that look like symbol paths.
  const lines = text.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Heuristic: lines with file paths (containing a . extension, /, and
    // a : or ( or space as delimiter)
    const symbolMatch = trimmed.match(/^[\s*-]*`?([\w./-]+\.\w+)[\s:([#].*$/)
    if (symbolMatch) {
      results.push({
        symbolId: symbolMatch[1],
        filePath: symbolMatch[1],
        relation: "reference",
        freshness: "fresh",
        provenance: "codegraph"
      })
    }
  }

  // Fallback: if we extracted nothing, return one evidence pointing at the
  // seed file so callers have something to work with.
  if (results.length === 0) {
    results.push({
      symbolId: "cursor",
      filePath: fallbackFilePath,
      relation: "reference",
      freshness: "fresh",
      provenance: "codegraph"
    })
  }

  return results
}

// ── Singleton ──

let defaultAdapter: CodeGraphAdapter | null = null

export function getCodeGraphAdapter(): CodeGraphAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new CodeGraphAdapter()
  }
  return defaultAdapter
}
