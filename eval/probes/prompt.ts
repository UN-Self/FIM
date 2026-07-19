const FIM_TOKENS = ["<｜fim_begin｜>", "<｜fim_hole｜>", "<｜fim_end｜>"]

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
