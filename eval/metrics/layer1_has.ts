export interface Layer1Result {
  hasCompletion: boolean
  noError: boolean
  latencyMs: number
}

export function evalLayer1(
  completionText: string,
  modelError: string | undefined,
  latencyMs: number
): Layer1Result {
  return {
    hasCompletion: completionText.trim().length > 0,
    noError: !modelError,
    latencyMs
  }
}
