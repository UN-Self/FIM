// ---------------------------------------------------------------------------
// Layer 4 — Graph metrics (plan §7)
//
// Evaluates the code-intelligence graph provider's output quality.
// ---------------------------------------------------------------------------

import type { GraphEvidence } from "@fim/protocol"
import type { ExpectedGraphEvidence } from "../datasets/workspace-loader"

export interface GraphMetrics {
  /** Time (ms) to complete the first index or sync. */
  indexSyncTimeMs: number
  /** P50 query latency across context assemblies (ms). */
  queryP50Ms: number
  /** P95 query latency across context assemblies (ms). */
  queryP95Ms: number
  /** Ratio of fresh evidence to total evidence (0-1). */
  freshnessRatio: number
  /** Count of evidence referencing files that should have been excluded. */
  ignoredFileLeak: number
}

export function evalGraph(
  evidence: GraphEvidence[],
  expectedEvidence: ExpectedGraphEvidence[],
  indexSyncTimeMs: number,
  queryLatenciesMs: number[]
): GraphMetrics {
  const freshCount = evidence.filter((e) => e.freshness === "fresh").length
  const freshnessRatio = evidence.length > 0 ? freshCount / evidence.length : 1

  const ignoredPatterns = ["node_modules", "dist", ".git"]
  const ignoredFileLeak = evidence.filter((e) =>
    ignoredPatterns.some((p) => e.filePath.includes(p))
  ).length

  const sorted = [...queryLatenciesMs].sort((a, b) => a - b)
  const p50 = sorted.length > 0
    ? sorted[Math.floor(sorted.length * 0.5)]
    : 0
  const p95 = sorted.length > 0
    ? sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)]
    : 0

  return { indexSyncTimeMs, queryP50Ms: p50, queryP95Ms: p95, freshnessRatio, ignoredFileLeak }
}
