const FIM_TOKENS = ["<｜fim▁begin｜>", "<｜fim▁hole｜>", "<｜fim▁end｜>"]

export interface PromptProbeResult {
  length: number
  tokenEstimate: number
  hasFimTokens: boolean
}

export function probePrompt(prompt: string): PromptProbeResult {
  return {
    length: prompt.length,
    tokenEstimate: Math.ceil(prompt.length / 4),
    hasFimTokens: FIM_TOKENS.some((t) => prompt.includes(t))
  }
}
