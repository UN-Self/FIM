// ---- Re-export protocol types for convenience --------------------------
export type {
  CompletionConfig,
  CompletionError,
  CompletionErrorCode,
  CompletionRequest,
  CompletionResult,
  DeepSeekProviderConfig,
  StreamEvent
} from "@fim/protocol"

// ---- Engine core -------------------------------------------------------
export { CompletionOrchestrator } from "./completion/orchestrator"
export type { OrchestratorOptions } from "./completion/orchestrator"

export { extractPrefixSuffix } from "./context/current-file"

export { ContextAssembler, formatContextChunks, generateGraphSeed } from "./context/graph-assembler"
export type { AssemblyResult, GraphSeedInput } from "./context/graph-assembler"

export { buildFimPrompt } from "./prompt/builder"
export type { FimPrompt, FimPromptInput } from "./prompt/builder"

export { detectIntentLocal, detectIntentLlm } from "./planning/intent-planner"
export type { PlannerLlmConfig } from "./planning/intent-planner"

export { validatePlan } from "./planning/plan-validator"

export { DeepSeekFimClient } from "./model/deepseek-fim"
export type {
  DeepSeekFimClientOptions,
  DeepSeekFimRequestBody,
  DeepSeekStreamChunk
} from "./model/deepseek-fim"

export { postprocess } from "./postprocess/processor"
export type { PostprocessInput } from "./postprocess/processor"

export { LRUCache } from "./cache"
export type { CompletionCache } from "./cache"

export type { CursorPosition, PrefixSuffix } from "./types"

export {
  getLineBreakCount,
  getModelShortName,
  getThinkingMessage,
  isStreamWithDataPrefix,
  kebabToSentence,
  safeParseJsonResponse
} from "./utils"
