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
  codegraph: {
    maxNodes: number
  }
  planner: {
    apiKey: string
    baseUrl: string
    maxContextChars: number
    model: string
  }
  matrices: Array<"baseline" | "codegraph" | "codegraph-planner">
}

export function loadConfig(): EvalConfig {
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || ""
  const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat"
  const judgeBaseUrl = process.env.JUDGE_BASE_URL || ""
  const judgeApiKey = process.env.JUDGE_API_KEY || ""
  const judgeModel = process.env.JUDGE_MODEL || ""
  const dataset = (process.env.EVAL_DATASET as EvalConfig["dataset"]) || "all"
  const matrixValues = (process.env.EVAL_MATRICES || "baseline,codegraph,codegraph-planner")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is EvalConfig["matrices"][number] =>
      ["baseline", "codegraph", "codegraph-planner"].includes(value)
    )

  return {
    deepseek: { apiKey: deepseekApiKey, model: deepseekModel },
    judge: {
      baseUrl: judgeBaseUrl,
      apiKey: judgeApiKey,
      model: judgeModel,
      enabled: Boolean(judgeBaseUrl && judgeApiKey && judgeModel)
    },
    contextLength: 100,
    dataset,
    codegraph: {
      maxNodes: Number(process.env.CODEGRAPH_MAX_NODES) || 12
    },
    planner: {
      apiKey: process.env.INTENT_API_KEY || deepseekApiKey,
      baseUrl: process.env.INTENT_BASE_URL || "https://api.deepseek.com/chat/completions",
      maxContextChars: Number(process.env.INTENT_MAX_CONTEXT_CHARS) || 24000,
      model: process.env.INTENT_MODEL || deepseekModel
    },
    matrices: matrixValues.length ? matrixValues : ["baseline"]
  }
}
