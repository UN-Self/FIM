// ---------------------------------------------------------------------------
// Completion orchestrator
//
// Extracted from `src/extension/providers/completion.ts` —
// `provideInlineCompletionItems()` and `buildFimRequest()`.
//
// The orchestrator is the central entry-point that wires together:
//   1. Prefix/suffix extraction (current-file context)
//   2. Graph context assembly (Phase 3 — CodeGraph subgraph)
//   3. Intent planning (Phase 4 — local heuristics + LLM fallback)
//   4. Plan validation
//   5. Prompt assembly (fixed-skeleton builder with intent + context)
//   6. Streaming completion (DeepSeek FIM client)
//   7. Postprocessing (truncation + formatting)
//   8. Caching (LRU)
//   9. Request dedup, concurrency lock, timeout, and cancellation
//
// Zero VS Code dependencies — all editor interaction happens in the adapter.
// ---------------------------------------------------------------------------

import AsyncLock from "async-lock"
import type {
  CompletionConfig,
  CompletionRequest,
  CompletionResult,
  DeepSeekProviderConfig,
  GraphProvider,
  IntentPlan,
  StreamEvent
} from "@fim/protocol"

import { LRUCache } from "../cache"
import { extractPrefixSuffix } from "../context/current-file"
import {
  ContextAssembler,
  formatContextChunks,
  GraphSeedInput
} from "../context/graph-assembler"
import { DeepSeekFimClient } from "../model/deepseek-fim"
import {
  detectIntentLlm,
  detectIntentLocal,
  PlannerLlmConfig
} from "../planning/intent-planner"
import { validatePlan } from "../planning/plan-validator"
import { postprocess, PostprocessInput } from "../postprocess/processor"
import { buildFimPrompt } from "../prompt/builder"
import { PrefixSuffix } from "../types"
import { getLineBreakCount } from "../utils"

// ---- Orchestrator ---------------------------------------------------------

export interface OrchestratorOptions {
  /** Concurrency lock domain (default "fim.completion"). */
  lockDomain?: string
  /** Deferred execution delay in ms (default 300). */
  debounceWait?: number
  /** Timeout for the upstream HTTP request (ms, default 60 000). */
  timeoutMs?: number
  /** Optional graph provider for cross-file context (Phase 3).
   * When omitted, graph context assembly is skipped. */
  graphProvider?: GraphProvider
  /** Phase 4: enable the intent planning pipeline (local + LLM).
   * When false (default), intent planning is skipped entirely. */
  enableIntentPlanner?: boolean
  /** Phase 4: configuration for the LLM-based intent planner.
   * Required when `enableIntentPlanner` is true and LLM fallback is
   * desired.  The chat endpoint (not the FIM endpoint) is used. */
  intentPlannerConfig?: PlannerLlmConfig
}

const LOCAL_CONFIDENCE_THRESHOLD = 0.7

export class CompletionOrchestrator {
  private _client: DeepSeekFimClient
  private _cache: LRUCache<string>
  private _lock: AsyncLock
  private _debouncer: ReturnType<typeof setTimeout> | undefined
  private _debounceWait: number
  private _assembler: ContextAssembler | null
  private _enableIntentPlanner: boolean
  private _intentPlannerConfig?: PlannerLlmConfig

  constructor(options: OrchestratorOptions = {}) {
    this._client = new DeepSeekFimClient({ timeoutMs: options.timeoutMs })
    this._cache = new LRUCache<string>(50)
    this._lock = new AsyncLock()
    this._debounceWait = options.debounceWait ?? 300
    this._assembler = options.graphProvider
      ? new ContextAssembler(options.graphProvider)
      : null
    this._enableIntentPlanner = options.enableIntentPlanner ?? false
    this._intentPlannerConfig = options.intentPlannerConfig
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Cancel an in-flight request.
   *
   * Calls `AbortController.abort()` on the underlying HTTP fetch and
   * clears any pending debounce timer.
   */
  cancel(): void {
    if (this._debouncer) {
      clearTimeout(this._debouncer)
      this._debouncer = undefined
    }
    this._client.abort()
  }

  /**
   * Request a completion from the engine.
   *
   * Returns a `CompletionResult` with the postprocessed text.
   * Events emitted during streaming are delivered via `onEvent`.
   *
   * Throws when the request is invalid or the upstream provider returns
   * an unrecoverable error.
   */
  async complete(
    request: CompletionRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<CompletionResult> {
    const { config, provider } = request

    // 1. Extract prefix/suffix
    const prefixSuffix = extractPrefixSuffix(
      request.document.text,
      request.cursor,
      config.contextLength
    )

    // 2. Check cache (skip when planner is active — prompt differs)
    if (config.completionCacheEnabled && !this._enableIntentPlanner) {
      const cached = this._cache.getCache(prefixSuffix)
      if (cached) {
        return {
          requestId: request.requestId,
          completion: cached,
          finishReason: "stop",
          latencyMs: 0
        }
      }
    }

    // 3. Assemble graph context (Phase 3)
    let assembledContext = ""
    let contextChunksResult: import("@fim/protocol").ContextChunk[] | undefined
    let graphEvidenceResult: import("@fim/protocol").GraphEvidence[] | undefined

    if (config.graphContextEnabled && this._assembler) {
      try {
        const seedInput: GraphSeedInput = {
          filePath: request.document.uri,
          languageId: request.document.languageId,
          prefix: prefixSuffix.prefix,
          suffix: prefixSuffix.suffix,
          cursorLine: request.cursor.line,
          cursorCharacter: request.cursor.character
        }
        const assembly = await this._assembler.assemble(
          seedInput,
          { maxEdges: 50, maxSymbols: 30 },
          { maxTokens: Math.floor(config.maxTokens * 0.3) }
        )
        if (assembly.source === "codegraph" && assembly.chunks.length > 0) {
          assembledContext = formatContextChunks(assembly.chunks)
          contextChunksResult = assembly.chunks
          graphEvidenceResult = assembly.evidence
        }
      } catch {
        // ContextAssembler never throws, but guard defensively
        assembledContext = ""
      }
    }

    // 4. Intent planning (Phase 4)
    let intentPlan: IntentPlan | undefined
    if (this._enableIntentPlanner) {
      intentPlan = await this.runIntentPlanning(
        prefixSuffix,
        request,
        contextChunksResult,
        graphEvidenceResult
      )
    }

    // 5. Build prompt (with intent + context if available)
    const prompt = buildFimPrompt({
      prefix: prefixSuffix.prefix,
      suffix: prefixSuffix.suffix,
      header: "", // adapter is responsible for header assembly
      context: assembledContext || undefined,
      fileContextEnabled: config.fileContextEnabled,
      language: request.document.languageId,
      contextChunks: contextChunksResult,
      graphEvidence: graphEvidenceResult,
      intentPlan
    })

    // 6. Build request body
    const body = {
      max_tokens: config.maxTokens,
      model: provider.modelName,
      prompt: prompt.prompt,
      suffix: prompt.suffix,
      stream: true,
      temperature: config.temperature
    }

    // 7. Acquire concurrency lock and stream
    return new Promise<CompletionResult>((resolve, reject) => {
      if (this._debouncer) clearTimeout(this._debouncer)
      this._debouncer = setTimeout(() => {
        this._lock.acquire("fim.completion", async () => {
          let accumulated = ""
          let chunkCount = 0

          try {
            // Collect all chunks into accumulated text
            // (we wrap onEvent so we can accumulate locally)
            const wrappedOnEvent = (event: StreamEvent) => {
              if (event.type === "chunk") {
                accumulated += event.text
                chunkCount++
              }
              onEvent(event)
            }

            const streamResult = await this._client.stream(
              provider,
              body,
              request.requestId,
              wrappedOnEvent
            )

            // If cancelled or timed out, return early — no postprocessing,
            // no caching, no partial completions.
            if (streamResult.finishReason !== "stop") {
              resolve({ ...streamResult, completion: "" })
              return
            }

            // 8. Postprocess
            const postprocessInput = this.buildPostprocessInput(
              accumulated,
              chunkCount,
              request,
              prefixSuffix
            )

            const processed = postprocess(postprocessInput)

            // 9. Cache result (only when planner is off — prompt varies per plan)
            if (config.completionCacheEnabled && !this._enableIntentPlanner && processed) {
              this._cache.setCache(prefixSuffix, processed)
            }

            resolve({
              requestId: request.requestId,
              completion: processed,
              finishReason: "stop",
              latencyMs: 0 // caller should measure wall-clock
            })
          } catch (error) {
            reject(error)
          }
        })
      }, this._debounceWait)
    })
  }

  // ---- Private: intent planning pipeline -----------------------------------

  private async runIntentPlanning(
    prefixSuffix: PrefixSuffix,
    request: CompletionRequest,
    contextChunks?: import("@fim/protocol").ContextChunk[],
    graphEvidence?: import("@fim/protocol").GraphEvidence[]
  ): Promise<IntentPlan | undefined> {
    const { config } = request

    try {
      // Step A: local rule-based detection (always runs first)
      const localPlan = detectIntentLocal(
        prefixSuffix.prefix,
        prefixSuffix.suffix,
        request.document.languageId
      )

      // If high confidence or automatic mode, validate and maybe return
      const isManual = request.mode === "manual"
      const needsLlm =
        isManual ||
        localPlan.confidence < LOCAL_CONFIDENCE_THRESHOLD ||
        localPlan.intent === "unknown"

      let plan = localPlan

      // Step B: LLM fallback for complex / low-confidence cases
      if (needsLlm && this._intentPlannerConfig) {
        try {
          const llmPlan = await detectIntentLlm(
            prefixSuffix.prefix,
            prefixSuffix.suffix,
            request.document.languageId,
            this._intentPlannerConfig,
            contextChunks,
            graphEvidence
          )
          // Use LLM plan if it has higher confidence
          if (llmPlan.confidence > localPlan.confidence) {
            plan = llmPlan
          }
        } catch {
          // LLM call failed — keep local plan
        }
      }

      // Step C: validate the plan
      const validation = validatePlan(plan, graphEvidence ?? [])

      // If the plan was modified by the validator, the changes are
      // already written back into the plan object.
      if (!validation.valid) {
        // Plan was invalid — discard but don't block completion
        return undefined
      }

      return plan
    } catch {
      // Any error in the planning pipeline → skip and continue
      return undefined
    }
  }

  // ---- Private helpers ----------------------------------------------------

  private buildPostprocessInput(
    accumulated: string,
    chunkCount: number,
    request: CompletionRequest,
    prefixSuffix: PrefixSuffix
  ): PostprocessInput {
    const lines = request.document.text.split("\n")
    const lineText = lines[request.cursor.line] ?? ""
    const textAfterCursor =
      lineText.substring(request.cursor.character) ?? ""
    const charAfterCursor = textAfterCursor.charAt(0) ?? ""
    const charBeforeCursor =
      request.cursor.character > 0
        ? lineText.charAt(request.cursor.character - 1)
        : ""
    const cursorAtMiddleOfWord =
      /\w/.test(charBeforeCursor) && /\w/.test(charAfterCursor)

    return {
      completion: accumulated,
      providerFimData: accumulated, // accumulated is the full text
      chunkCount,
      providerModelName: request.provider.modelName,
      providerFimTemplate:
        request.provider.fimTemplate || "automatic",
      nodeType: "", // no AST in engine core — adapter may inject
      astHasError: false, // no AST in engine core
      lineText,
      prefix: prefixSuffix.prefix,
      suffix: prefixSuffix.suffix,
      isMultilineCompletion:
        getLineBreakCount(accumulated) > 1,
      multilineCompletionsEnabled:
        request.config.multilineCompletionsEnabled,
      maxLines: request.config.maxLines,
      textAfterCursor,
      charAfterCursor,
      charBeforeCursor,
      cursorAtMiddleOfWord,
      languageId: request.document.languageId
    }
  }
}
