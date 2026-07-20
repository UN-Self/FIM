// ---------------------------------------------------------------------------
// Layer 5 — Context metrics (plan §7)
//
// Evaluates whether the context assembler brings relevant cross-file code.
// ---------------------------------------------------------------------------

import type { ContextChunk } from "@fim/protocol"
import type { ExpectedGraphEvidence } from "../datasets/workspace-loader"

export interface ContextMetrics {
  /** Fraction of expected symbols that appeared in context chunks. */
  symbolRecall: number
  /** Fraction of expected files that appeared in context chunks. */
  fileRecall: number
  /** Fraction of expected symbols/files in top-K chunks. */
  topKRecall: number
  /** Ratio of relevant tokens to total context tokens. */
  tokenEfficiency: number
  /** Ratio of chunks that include symbolId or reason annotation. */
  traceabilityRate: number
}

export function evalContext(
  chunks: ContextChunk[],
  tokenEstimate: number,
  expectedEvidence: ExpectedGraphEvidence[],
  topK: number = 5
): ContextMetrics {
  const expectedSymbols = new Set(expectedEvidence.map((e) => e.symbolId))
  const expectedFiles = new Set(expectedEvidence.map((e) => e.filePath))

  const foundSymbols = new Set<string>()
  const foundFiles = new Set<string>()
  let traceableCount = 0

  for (const chunk of chunks) {
    if (chunk.symbolId && expectedSymbols.has(chunk.symbolId)) {
      foundSymbols.add(chunk.symbolId)
    }
    foundFiles.add(chunk.filePath)
    if (chunk.symbolId) traceableCount++
  }

  const symbolRecall = expectedSymbols.size > 0
    ? foundSymbols.size / expectedSymbols.size : 0
  const fileRecall = expectedFiles.size > 0
    ? [...expectedFiles].filter((f) => foundFiles.has(f)).length / expectedFiles.size : 0

  const topKChunks = chunks.slice(0, topK)
  const topKSymbols = new Set(topKChunks.map((c) => c.symbolId).filter(Boolean) as string[])
  const topKRecall = expectedSymbols.size > 0
    ? [...expectedSymbols].filter((s) => topKSymbols.has(s)).length / expectedSymbols.size : 0

  const relevantTokens = topKChunks.reduce((sum, c) => sum + Math.ceil(c.text.length / 4), 0)
  const tokenEfficiency = tokenEstimate > 0 ? relevantTokens / tokenEstimate : 0

  const traceabilityRate = chunks.length > 0 ? traceableCount / chunks.length : 0

  return { symbolRecall, fileRecall, topKRecall, tokenEfficiency, traceabilityRate }
}
