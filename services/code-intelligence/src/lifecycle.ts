import { CodeGraphAdapter, getCodeGraphAdapter } from "./codegraph-adapter"
import { Indexer } from "./indexer"
import {
  GraphRefreshResult,
  GraphSeed,
  GraphBudget,
  GraphEvidence,
  GraphStatus,
  GraphRefreshRequest,
  TokenBudget,
  ContextChunk,
  WorkspaceRef
} from "./provider"

// ── Lifecycle state for a single workspace ──

export interface WorkspaceSession {
  workspace: WorkspaceRef
  indexer: Indexer
}

// ── Lifecycle manager ──

/**
 * Top-level manager for the code-intelligence service.
 *
 * Owns the adapter singleton and one Indexer per workspace. Handles
 * init/sync/status/close with error recovery. All public methods are
 * safe to call even when CodeGraph is not installed.
 */
export class CodeIntelligenceLifecycle {
  private adapter: CodeGraphAdapter
  private sessions: Map<string, WorkspaceSession>
  private closed: boolean

  constructor() {
    this.adapter = getCodeGraphAdapter()
    this.sessions = new Map()
    this.closed = false
  }

  // ── Workspace management ──

  private ensureSession(workspace: WorkspaceRef): WorkspaceSession {
    const existing = this.sessions.get(workspace.id)
    if (existing) return existing
    const session: WorkspaceSession = { workspace, indexer: new Indexer() }
    this.sessions.set(workspace.id, session)
    return session
  }

  private getSession(workspace: WorkspaceRef): WorkspaceSession | undefined {
    return this.sessions.get(workspace.id)
  }

  // ── status ──

  /**
   * Returns the combined status from the adapter and indexer.
   * Always returns a valid object — never throws.
   */
  async status(workspace: WorkspaceRef): Promise<GraphStatus> {
    if (this.closed) return { state: "disabled" }

    try {
      const base = await this.adapter.status(workspace)
      const session = this.getSession(workspace)
      if (session) {
        return session.indexer.getStatus(base)
      }
      return base
    } catch (err) {
      return {
        state: "error",
        error: err instanceof Error ? err.message : "status check failed"
      }
    }
  }

  // ── init ──

  /**
   * Ensure a workspace is indexed. Creates or opens the .codegraph/ index
   * and returns a result. Safe to call repeatedly — subsequent calls are
   * no-ops when the index is already ready.
   */
  async init(workspace: WorkspaceRef): Promise<GraphRefreshResult> {
    if (this.closed) {
      return { ok: false, indexedFiles: 0, errors: ["Service is closed"] }
    }

    const session = this.ensureSession(workspace)
    const idx = session.indexer

    // If already ready and not stale, skip
    if (idx.getIndexState().phase === "ready" && !idx.isStale()) {
      return { ok: true, indexedFiles: idx.getIndexState().completedFiles, errors: [] }
    }

    idx.startScanning(-1) // total unknown until scan completes
    idx.startIndexing()

    const request: GraphRefreshRequest = { workspace }
    const result = await this.adapter.refresh(request)

    if (result.ok) {
      idx.markReady()
    } else {
      idx.markError(result.errors.join("; "))
    }

    return result
  }

  // ── sync ──

  /**
   * Perform incremental refresh for any pending file changes.
   * Returns the refresh result, or null if no changes were pending.
   */
  async sync(workspace: WorkspaceRef): Promise<GraphRefreshResult | null> {
    if (this.closed) return null

    const session = this.getSession(workspace)
    if (!session) return null

    const request = session.indexer.buildRefreshRequest(workspace)
    if (!request) return null

    session.indexer.startIndexing()
    const result = await this.adapter.refresh(request)

    if (result.ok) {
      session.indexer.markReady()
    } else {
      session.indexer.markError(result.errors.join("; "))
    }

    return result
  }

  // ── expand ──

  /**
   * Traverse from a seed symbol/position and return evidence.
   * Gracefully returns [] on any failure.
   */
  async expand(seed: GraphSeed, budget: GraphBudget): Promise<GraphEvidence[]> {
    if (this.closed) return []
    try {
      return await this.adapter.expand(seed, budget)
    } catch {
      return []
    }
  }

  // ── read ──

  /**
   * Read raw source code for requested symbols.
   * Gracefully returns [] on any failure.
   */
  async read(symbolIds: string[], budget: TokenBudget): Promise<ContextChunk[]> {
    if (this.closed) return []
    try {
      return await this.adapter.read(symbolIds, budget)
    } catch {
      return []
    }
  }

  // ── file change notifications ──

  notifyChange(workspace: WorkspaceRef, filePath: string): void {
    if (this.closed) return
    const session = this.ensureSession(workspace)
    session.indexer.enqueueChange({ type: "changed", filePath })
  }

  notifyDelete(workspace: WorkspaceRef, filePath: string): void {
    if (this.closed) return
    const session = this.ensureSession(workspace)
    session.indexer.enqueueChange({ type: "deleted", filePath })
  }

  notifyAdd(workspace: WorkspaceRef, filePath: string): void {
    if (this.closed) return
    const session = this.ensureSession(workspace)
    session.indexer.enqueueChange({ type: "added", filePath })
  }

  // ── cleanup ──

  /**
   * Close all sessions and the underlying adapter.
   * Safe to call multiple times.
   */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.adapter.close()
    this.sessions.clear()
  }

  /**
   * Re-open after a previous close. Resets all state.
   */
  reopen(): void {
    this.closed = false
    this.adapter = getCodeGraphAdapter()
  }

  get isClosed(): boolean {
    return this.closed
  }
}

// ── Singleton ──

let defaultLifecycle: CodeIntelligenceLifecycle | null = null

export function getCodeIntelligenceLifecycle(): CodeIntelligenceLifecycle {
  if (!defaultLifecycle || defaultLifecycle.isClosed) {
    defaultLifecycle = new CodeIntelligenceLifecycle()
  }
  return defaultLifecycle
}
