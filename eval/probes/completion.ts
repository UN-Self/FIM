import { Layer1Result, Layer2Result, Layer3Result, evalLayer1, evalLayer2, evalLayer3 } from "../metrics"
import { EvalConfig } from "../config"

export interface CompletionProbeResult {
  layer1: Layer1Result
  layer2: Layer2Result
  layer3: Layer3Result
}

export async function probeCompletion(
  completionText: string,
  modelError: string | undefined,
  latencyMs: number,
  prefix: string,
  suffix: string,
  filePath: string,
  languageId: string,
  config: EvalConfig
): Promise<CompletionProbeResult> {
  const layer1 = evalLayer1(completionText, modelError, latencyMs)
  const layer2 = await evalLayer2(prefix, completionText, suffix, filePath, languageId)
  const layer3 = await evalLayer3(prefix, completionText, suffix, config.judge)
  return { layer1, layer2, layer3 }
}
