import { IntentAdapter, IntentAdapterInput, IntentResult } from "../types"

export const NoopIntentDetector: IntentAdapter = {
  name: "noop",
  async detect(_input: IntentAdapterInput): Promise<IntentResult> {
    return { intent: "unknown", confidence: 0, signals: [] }
  }
}
