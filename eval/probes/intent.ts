import { IntentResult } from "../adapters/types"

export interface IntentProbeResult {
  intent: string
  confidence: number
  expectedIntent?: string
  matchesExpected?: boolean
  constraintCount: number
  requestedSymbolCount: number
}

export function probeIntent(
  intent: IntentResult,
  expectedIntent?: string
): IntentProbeResult {
  return {
    intent: intent.intent,
    confidence: intent.confidence,
    expectedIntent,
    matchesExpected: expectedIntent ? intent.intent === expectedIntent : undefined,
    constraintCount: intent.constraints.length,
    requestedSymbolCount: intent.requestedSymbols.length
  }
}
