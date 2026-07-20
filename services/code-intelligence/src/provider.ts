// ── Workspace ──

export interface WorkspaceRef {
  id: string
  rootUri: string
  revision?: string
}

// ── Status ──

export type GraphState =
  | "disabled"
  | "uninitialized"
  | "indexing"
  | "ready"
  | "error"

export interface GraphStatus {
  state: GraphState
  indexedFileCount?: number
  totalFileCount?: number
  lastIndexedAt?: number
  error?: string
}

// ── Refresh ──

export interface GraphRefreshRequest {
  workspace: WorkspaceRef
  paths?: string[]
}

export interface GraphRefreshResult {
  ok: boolean
  indexedFiles: number
  errors: string[]
}

// ── Expand ──

export interface GraphSeed {
  symbolId?: string
  filePath: string
  line: number
  character: number
}

export interface GraphBudget {
  maxNodes: number
  maxDepth: number
}

export type GraphRelation =
  | "definition"
  | "caller"
  | "callee"
  | "reference"
  | "import"

export interface GraphEvidence {
  symbolId: string
  filePath: string
  relation: GraphRelation
  signature?: string
  freshness: "fresh" | "stale"
  provenance: "codegraph"
}

// ── Read ──

export interface TokenBudget {
  maxTokens: number
}

export interface ContextChunk {
  symbolId: string
  filePath: string
  startLine: number
  endLine: number
  text: string
  provenance: "codegraph"
}

// ── Provider ──

export interface GraphProvider {
  status(workspace: WorkspaceRef): Promise<GraphStatus>
  refresh(request: GraphRefreshRequest): Promise<GraphRefreshResult>
  expand(seed: GraphSeed, budget: GraphBudget): Promise<GraphEvidence[]>
  read(symbolIds: string[], budget: TokenBudget): Promise<ContextChunk[]>
}
