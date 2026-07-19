export interface EvalConfig {
  deepseek: {
    apiKey: string
    model: string
  }
  judge: {
    baseUrl: string
    apiKey: string
    model: string
    enabled: boolean
  }
  contextLength: number
  dataset: "synthetic" | "fim-self" | "all"
}

export function loadConfig(): EvalConfig {
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || ""
  const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat"
  const judgeBaseUrl = process.env.JUDGE_BASE_URL || ""
  const judgeApiKey = process.env.JUDGE_API_KEY || ""
  const judgeModel = process.env.JUDGE_MODEL || ""
  const dataset = (process.env.EVAL_DATASET as EvalConfig["dataset"]) || "all"

  return {
    deepseek: { apiKey: deepseekApiKey, model: deepseekModel },
    judge: {
      baseUrl: judgeBaseUrl,
      apiKey: judgeApiKey,
      model: judgeModel,
      enabled: Boolean(judgeBaseUrl && judgeApiKey && judgeModel)
    },
    contextLength: 100,
    dataset
  }
}
