import { IntentResult } from "../adapters/types"

export interface IntentProbeResult {
  intent: string
  confidence: number
}

export function probeIntent(intent: IntentResult): IntentProbeResult {
  return { intent: intent.intent, confidence: intent.confidence }
}
