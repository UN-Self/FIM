import { GraphRefreshRequest, GraphRefreshResult, GraphStatus, WorkspaceRef } from "./provider"

// ── Index state tracking ──

export type IndexPhase =
  | "idle"
  | "scanning"
  | "indexing"
  | "ready"
  | "error"

export interface IndexState {
  phase: IndexPhase
  completedFiles: number
  totalFiles: number
  lastIndexedAt: number
  error?: string
}

// ── File watch events (structural, not the actual FS watcher) ──

export interface FileChange {
  type: "added" | "changed" | "deleted"
  filePath: string
}

// ── Indexer config ──

export interface IndexerConfig {
  /** Glob patterns to ignore during indexing (gitignore syntax). */
  ignorePatterns: string[]
  /** Index events older than this many ms are considered stale. */
  stalenessThresholdMs: number
  /** File watcher throttle delay in ms. */
  watchDebounceMs: number
}

export const DEFAULT_INDEXER_CONFIG: IndexerConfig = {
  ignorePatterns: [],
  stalenessThresholdMs: 5 * 60 * 1000, // 5 minutes
  watchDebounceMs: 2000
}

// ── Indexer class ──

/**
 * Tracks the indexing lifecycle for a single workspace.
 *
 * This is a pure state machine — it does not call CodeGraph directly.
 * The CodeGraphAdapter pushes state transitions through this indexer
 * when it refreshes or detects file changes.
 */
export class Indexer {
  private state: IndexState = { phase: "idle", completedFiles: 0, totalFiles: 0, lastIndexedAt: 0 }
  private pendingChanges: FileChange[] = []
  private config: IndexerConfig
  private changeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: Partial<IndexerConfig> = {}) {
    this.config = { ...DEFAULT_INDEXER_CONFIG, ...config }
  }

  // ── Accessors ──

  getStatus(baseState: GraphStatus): GraphStatus {
    return {
      ...baseState,
      indexedFileCount: this.state.completedFiles,
      totalFileCount: this.state.totalFiles || undefined,
      lastIndexedAt: this.state.lastIndexedAt || undefined
    }
  }

  getIndexState(): Readonly<IndexState> {
    return { ...this.state }
  }

  isStale(): boolean {
    if (this.state.phase !== "ready") return true
    return Date.now() - this.state.lastIndexedAt > this.config.stalenessThresholdMs
  }

  // ── Lifecycle ──

  startScanning(totalFiles: number): void {
    this.state = {
      phase: "scanning",
      completedFiles: 0,
      totalFiles,
      lastIndexedAt: this.state.lastIndexedAt
    }
  }

  startIndexing(): void {
    this.state = {
      phase: "indexing",
      completedFiles: 0,
      totalFiles: this.state.totalFiles,
      lastIndexedAt: this.state.lastIndexedAt
    }
  }

  progress(completedFiles: number): void {
    this.state = {
      ...this.state,
      completedFiles,
      phase: completedFiles >= this.state.totalFiles ? "ready" : "indexing"
    }
    if (this.state.phase === "ready") {
      this.state = { ...this.state, lastIndexedAt: Date.now() }
    }
  }

  markReady(): void {
    this.state = {
      phase: "ready",
      completedFiles: this.state.totalFiles,
      totalFiles: this.state.totalFiles,
      lastIndexedAt: Date.now()
    }
  }

  markError(error: string): void {
    this.state = {
      phase: "error",
      completedFiles: this.state.completedFiles,
      totalFiles: this.state.totalFiles,
      lastIndexedAt: this.state.lastIndexedAt,
      error
    }
  }

  reset(): void {
    this.state = { phase: "idle", completedFiles: 0, totalFiles: 0, lastIndexedAt: 0 }
    this.pendingChanges = []
    this.clearChangeTimer()
  }

  // ── File changes (structural) ──

  enqueueChange(change: FileChange): void {
    this.pendingChanges.push(change)
    this.scheduleChangeFlush()
  }

  enqueueChanges(changes: FileChange[]): void {
    this.pendingChanges.push(...changes)
    this.scheduleChangeFlush()
  }

  drainChanges(): FileChange[] {
    const changes = this.pendingChanges.slice()
    this.pendingChanges = []
    return changes
  }

  hasPendingChanges(): boolean {
    return this.pendingChanges.length > 0
  }

  buildRefreshRequest(workspace: WorkspaceRef): GraphRefreshRequest | null {
    if (this.pendingChanges.length === 0) return null
    const paths = this.pendingChanges.map((c) => c.filePath)
    this.pendingChanges = []
    this.clearChangeTimer()
    return { workspace, paths }
  }

  // ── Internal ──

  private scheduleChangeFlush(): void {
    if (this.changeTimer) return
    this.changeTimer = setTimeout(() => {
      this.changeTimer = null
      // Flush happens when buildRefreshRequest is called by the lifecycle loop
    }, this.config.watchDebounceMs)
  }

  private clearChangeTimer(): void {
    if (this.changeTimer) {
      clearTimeout(this.changeTimer)
      this.changeTimer = null
    }
  }
}
