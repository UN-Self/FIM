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
    runs: number
    pairwiseRuns: number
  }
  writerRuns: number
  contextLength: number
  dataset: "synthetic" | "fim-self" | "workspace" | "all"
  codegraph: {
    maxNodes: number
  }
  planner: {
    apiKey: string
    baseUrl: string
    maxContextChars: number
    model: string
  }
  matrices: Array<"baseline" | "codegraph" | "codegraph-planner" | "codegraph-planner-direct-writer">
  /** Use the Engine-based ChainV2 instead of the legacy ChainV1 (Phase 6).
   * Controlled by EVAL_USE_ENGINE_CHAIN env var (default false). */
  useEngineChain: boolean
}

export function loadConfig(): EvalConfig {
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || ""
  const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat"
  const judgeBaseUrl = process.env.JUDGE_BASE_URL || ""
  const judgeApiKey = process.env.JUDGE_API_KEY || ""
  const judgeModel = process.env.JUDGE_MODEL || ""
  const writerRuns = positiveInteger(process.env.EVAL_WRITER_RUNS, 3)
  const judgeRuns = positiveInteger(process.env.EVAL_JUDGE_RUNS, 3)
  const pairwiseJudgeRuns = positiveInteger(process.env.EVAL_PAIRWISE_JUDGE_RUNS, 3)
  const dataset = (process.env.EVAL_DATASET as EvalConfig["dataset"]) || "all"
  const matrixValues = (process.env.EVAL_MATRICES || "baseline,codegraph,codegraph-planner")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is EvalConfig["matrices"][number] =>
      ["baseline", "codegraph", "codegraph-planner", "codegraph-planner-direct-writer"].includes(value)
    )
  const useEngineChain = process.env.EVAL_USE_ENGINE_CHAIN === "true"

  return {
    deepseek: { apiKey: deepseekApiKey, model: deepseekModel },
    judge: {
      baseUrl: judgeBaseUrl,
      apiKey: judgeApiKey,
      model: judgeModel,
      enabled: Boolean(judgeBaseUrl && judgeApiKey && judgeModel),
      runs: judgeRuns,
      pairwiseRuns: pairwiseJudgeRuns
    },
    writerRuns,
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
    matrices: matrixValues.length ? matrixValues : ["baseline"],
    useEngineChain
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
