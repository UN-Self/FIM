import { ContextAdapter, ContextAdapterInput, ContextIR } from "../types"

export const NoopContextCollector: ContextAdapter = {
  name: "noop",
  async collect(_input: ContextAdapterInput): Promise<ContextIR> {
    return { chunks: [], tokenEstimate: 0, source: "noop" }
  }
}
