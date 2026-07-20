// ---------------------------------------------------------------------------
// Plan Validator (plan §4.3, §6 Phase 4)
//
// Validates an `IntentPlan` against the current code-graph evidence.
//
// Validation rules:
//   1. `requestedSymbolIds` must exist in `GraphEvidence[]` — non-existent
//      entries are removed silently.
//   2. `scope` must not exceed the maximum writable range for the cursor.
//   3. `constraints`: max 8 items, each max 200 chars.
//   4. `confidence`: clamped to 0-1; < 0.3 → plan is invalid (fallback).
//
// NEVER throws — always returns a `PlanValidation`.
// ---------------------------------------------------------------------------

import type { GraphEvidence, IntentPlan, PlanValidation } from "@fim/protocol"

// Scope hierarchy: wider scopes enclose narrower ones.
const SCOPE_RANK: Record<string, number> = {
  expression: 1,
  statement: 2,
  block: 3,
  function: 4
}

const MAX_CONSTRAINTS = 8
const MAX_CONSTRAINT_CHARS = 200

/**
 * Validate an `IntentPlan` against the available evidence and limits.
 *
 * @param plan       The plan produced by the intent planner.
 * @param evidence   GraphEvidence from the current code graph expansion.
 * @param maxScope   Optional maximum allowed scope for the cursor position
 *                   (defaults to `"function"` — the widest).
 * @returns          A `PlanValidation` with `valid`, `errors`, and `warnings`.
 */
export function validatePlan(
  plan: IntentPlan,
  evidence: GraphEvidence[] = [],
  maxScope?: "expression" | "statement" | "block" | "function"
): PlanValidation {
  const errors: string[] = []
  const warnings: string[] = []

  // Safety: handle null / undefined plan gracefully
  if (!plan || typeof plan !== "object") {
    return {
      valid: false,
      errors: ["Invalid plan: null or non-object"],
      warnings: []
    }
  }

  let planModified = false

  // Safety: defensive copy to avoid mutating the caller's plan.
  const cleanedPlan: IntentPlan = {
    intent: plan.intent ?? "unknown",
    confidence: plan.confidence ?? 0,
    scope: plan.scope ?? "statement",
    constraints: Array.isArray(plan.constraints) ? [...plan.constraints] : [],
    requestedSymbolIds: Array.isArray(plan.requestedSymbolIds)
      ? [...plan.requestedSymbolIds]
      : []
  }

  // ---- 1. Verify requestedSymbolIds exist in GraphEvidence --------------

  if (cleanedPlan.requestedSymbolIds.length > 0) {
    const evidenceIdSet = new Set(evidence.map((e) => e.symbolId))
    const validIds = cleanedPlan.requestedSymbolIds.filter((id) =>
      evidenceIdSet.has(id)
    )
    const removed = cleanedPlan.requestedSymbolIds.length - validIds.length
    if (removed > 0) {
      warnings.push(
        `Removed ${removed} requestedSymbolIds not found in GraphEvidence`
      )
      cleanedPlan.requestedSymbolIds = validIds
      planModified = true
    }
  }

  // ---- 2. Scope does not exceed writable range --------------------------

  const maxRank = maxScope ? SCOPE_RANK[maxScope] ?? 4 : 4
  const planRank = SCOPE_RANK[cleanedPlan.scope] ?? 2
  if (planRank > maxRank) {
    warnings.push(
      `Plan scope "${cleanedPlan.scope}" exceeds max allowed "${maxScope}"`
    )
    // Downgrade scope to the maximum allowed
    if (maxScope) {
      cleanedPlan.scope = maxScope
      planModified = true
    }
  }

  // ---- 3. Enforce constraints limits ------------------------------------

  if (cleanedPlan.constraints.length > MAX_CONSTRAINTS) {
    warnings.push(
      `Truncated constraints from ${cleanedPlan.constraints.length} to ${MAX_CONSTRAINTS}`
    )
    cleanedPlan.constraints = cleanedPlan.constraints.slice(0, MAX_CONSTRAINTS)
    planModified = true
  }

  const longCount = cleanedPlan.constraints.filter(
    (c) => c.length > MAX_CONSTRAINT_CHARS
  ).length
  if (longCount > 0) {
    warnings.push(
      `Truncated ${longCount} constraint(s) exceeding ${MAX_CONSTRAINT_CHARS} chars`
    )
    cleanedPlan.constraints = cleanedPlan.constraints.map((c) =>
      c.length > MAX_CONSTRAINT_CHARS ? c.slice(0, MAX_CONSTRAINT_CHARS) : c
    )
    planModified = true
  }

  // ---- 4. Confidence validation -----------------------------------------

  const clamped = Math.max(0, Math.min(1, cleanedPlan.confidence))
  if (clamped !== cleanedPlan.confidence) {
    cleanedPlan.confidence = clamped
    planModified = true
  }

  if (cleanedPlan.confidence < 0.3) {
    errors.push(
      `Confidence ${cleanedPlan.confidence.toFixed(2)} below threshold 0.3 — plan discarded`
    )
  }

  // Publish the cleaned values back onto the plan so callers can read them.
  plan.intent = cleanedPlan.intent
  plan.confidence = cleanedPlan.confidence
  plan.scope = cleanedPlan.scope
  plan.constraints = cleanedPlan.constraints
  plan.requestedSymbolIds = cleanedPlan.requestedSymbolIds

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}
