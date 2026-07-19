import { ContextIR } from "../adapters/types"

export interface ContextProbeResult {
  chunkCount: number
  tokenEstimate: number
}

export function probeContext(context: ContextIR): ContextProbeResult {
  return {
    chunkCount: context.chunks.length,
    tokenEstimate: context.tokenEstimate
  }
}
