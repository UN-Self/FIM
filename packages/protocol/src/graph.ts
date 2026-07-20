// ---------------------------------------------------------------------------
// Code-graph protocol types (plan §4.2)
//
// `GraphProvider` is the single contract the engine uses to talk to any
// code-intelligence backend (CodeGraph, a fork, or a future replacement).
// All types are JSON-serialisable so they can cross process / RPC boundaries.
// ---------------------------------------------------------------------------

/** Identifies a workspace for graph operations. */
export interface WorkspaceRef {
  id: string
  rootUri: string
}

// ---- Graph provider contract ----------------------------------------------

/**
 * A code-intelligence backend that the engine consults for cross-file
 * structural information.
 *
 * Implementations live in `services/code-intelligence/` and are **not**
 * part of the engine core — the engine only imports this interface.
 */
export interface GraphProvider {
  /** Quick health / availability check. */
  status(workspace: WorkspaceRef): Promise<GraphStatus>

  /** Trigger a full or incremental refresh of the workspace index. */
  refresh(request: GraphRefreshRequest): Promise<GraphRefreshResult>

  /**
   * Expand from a seed symbol to discover related symbols.
   *
   * Returns structural evidence (edges) only — no raw code.  Use `read()`
   * to fetch actual source text for symbols the context assembler decides
   * to include.
   */
  expand(seed: GraphSeed, budget: GraphBudget): Promise<GraphEvidence[]>

  /**
   * Read raw source code for a set of symbol identifiers.
   *
   * The returned chunks are the building blocks of the context assembly
   * pipeline.  `budget` caps the total token count across all chunks.
   */
  read(symbolIds: string[], budget: TokenBudget): Promise<ContextChunk[]>
}

// ---- Supporting types -----------------------------------------------------

export interface GraphStatus {
  /** Whether the index is ready to serve queries. */
  available: boolean
  /** Human-readable status message (e.g. "indexing 45%"). */
  message: string
  /** Approximate count of indexed symbols, or -1 if unknown. */
  symbolCount: number
  /** ISO-8601 timestamp of the last successful refresh. */
  lastRefreshedAt?: string
}

export interface GraphRefreshRequest {
  workspace: WorkspaceRef
  /** If true, discard the existing index and rebuild from scratch. */
  full?: boolean
  /** Limit refresh to these paths only. */
  paths?: string[]
}

export interface GraphRefreshResult {
  ok: boolean
  /** Symbols added or updated during this refresh. */
  changed: number
  error?: string
}

/**
 * Starting point for graph expansion — derived from the cursor position,
 * current AST node, surrounding imports, and local identifiers.
 */
export interface GraphSeed {
  symbols: SeedSymbol[]
  /** Maximum graph distance from the seed symbols to explore. */
  maxDepth: number
}

export interface SeedSymbol {
  symbolId: string
  filePath: string
  /** One of: "cursor", "import", "local_identifier", "parent_scope" */
  source: string
}

/** Caps the number of edges / nodes returned by a single `expand()` call. */
export interface GraphBudget {
  maxEdges: number
  maxSymbols: number
}

/** Caps the token count returned by `read()`. */
export interface TokenBudget {
  maxTokens: number
}

/**
 * A single piece of structural evidence returned by `expand()`.
 *
 * Each edge connects a source symbol (the seed or a previously-expanded
 * symbol) to a discovered target, with a typed relationship.
 */
export interface GraphEvidence {
  symbolId: string
  filePath: string
  relation: "definition" | "caller" | "callee" | "reference" | "import"
  signature?: string
  /** Whether the underlying source file matches the on-disk version. */
  freshness: "fresh" | "stale"
  /** Provenance label — allows auditing which vendor produced the edge. */
  provenance: "codegraph"
}

/**
 * A chunk of raw source code returned by `read()`.
 *
 * The context assembler packs these into the final prompt, respecting the
 * token budget and relevance ordering.
 */
export interface ContextChunk {
  filePath: string
  text: string
  symbolId?: string
  relevanceScore?: number
  reason?: string
}
