// ---------------------------------------------------------------------------
// Layer 6 — Planning metrics (plan §7)
//
// Evaluates whether the intent planner correctly infers what the user wants.
// ---------------------------------------------------------------------------

import type { IntentPlan } from "@fim/protocol"

export interface PlanningMetrics {
  /** Whether intent matched expected (binary). */
  intentMatch: boolean
  /** The detected intent type. */
  detectedIntent: string
  /** F1-like score: 1.0 if match, 0.0 if not. */
  intentF1: number
  /** Fraction of constraints that passed validation. */
  constraintHitRate: number
  /** |confidence - correctness|. Lower is better. */
  calibrationError: number
  /** Whether the plan was invalid and discarded. */
  invalidPlanFallback: boolean
}

export function evalPlanning(
  plan: IntentPlan | undefined,
  validation: { valid: boolean; errors: string[] } | undefined,
  expectedIntent?: string
): PlanningMetrics {
  const intent = plan?.intent ?? "unknown"
  const intentMatch = expectedIntent ? intent === expectedIntent : undefined
  const intentF1 = intentMatch === true ? 1.0 : intentMatch === false ? 0.0 : 0.5
  const calibrationError = intentMatch !== undefined
    ? Math.abs((plan?.confidence ?? 0) - (intentMatch ? 1 : 0))
    : 0.5

  return {
    intentMatch: intentMatch ?? false,
    detectedIntent: intent,
    intentF1,
    constraintHitRate: plan && plan.constraints.length > 0
      ? (validation?.errors.length === 0 ? 1 : 0)
      : 1,
    calibrationError,
    invalidPlanFallback: !plan || (validation ? !validation.valid : false)
  }
}
