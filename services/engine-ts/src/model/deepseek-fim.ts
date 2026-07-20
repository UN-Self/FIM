// ---------------------------------------------------------------------------
// DeepSeek FIM streaming client
//
// Extracted from `src/extension/llm.ts` — identical SSE-parsing logic,
// zero VS Code dependencies.  Uses the global `fetch` API (Node 18+).
//
// The client is a thin wrapper around a POST to the DeepSeek `/beta`
// completions endpoint.  It handles:
//   - AbortController-based timeout (60 s default)
//   - SSE line-by-line parsing
//   - Per-chunk `onData` callbacks
//   - Clean-up via `onEnd` / `onError`
// ---------------------------------------------------------------------------

import type {
  CompletionResult,
  DeepSeekProviderConfig,
  StreamEvent
} from "@fim/protocol"

import { safeParseJsonResponse } from "../utils"

// ---- Request shape --------------------------------------------------------

export interface DeepSeekFimRequestBody {
  max_tokens: number
  model: string
  prompt: string
  suffix: string
  stream: boolean
  temperature: number
}

export interface DeepSeekStreamChunk {
  model?: string
  choices?: [
    {
      text?: string
      delta?: { content?: string }
      index?: number
      finish_reason?: string
      message?: { role?: string; content?: string }
    }
  ]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ---- Client configuration -------------------------------------------------

export interface DeepSeekFimClientOptions {
  /** Timeout in ms for the entire request (default 60 000). */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 60_000

// ---- Client ---------------------------------------------------------------

export class DeepSeekFimClient {
  private controller: AbortController | null = null

  constructor(private options: DeepSeekFimClientOptions = {}) {}

  /**
   * Abort the in-flight request (if any).
   *
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  abort(): void {
    this.controller?.abort()
    this.controller = null
  }

  /**
   * Stream a FIM completion from the DeepSeek `/beta` endpoint.
   *
   * Calls `onEvent` for each chunk, end, or error.  Returns a
   * `CompletionResult` on success.
   */
  async stream(
    provider: DeepSeekProviderConfig,
    body: DeepSeekFimRequestBody,
    requestId: string,
    onEvent: (event: StreamEvent) => void
  ): Promise<CompletionResult> {
    const startTime = Date.now()
    this.controller = new AbortController()
    const { signal } = this.controller

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      this.controller?.abort()
    }, timeoutMs)

    try {
      const url = `${provider.apiProtocol}://${provider.apiHostname}${
        provider.apiPort ? `:${provider.apiPort}` : ""
      }${provider.apiPath}`

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(body),
        signal
      })

      if (!response.ok) {
        const errorEvent: StreamEvent = {
          type: "error",
          requestId,
          error: {
            code: "PROVIDER_ERROR",
            message: `Server responded with status ${response.status}`,
            statusCode: response.status
          }
        }
        onEvent(errorEvent)
        throw new Error(
          `Server responded with status code: ${response.status}`
        )
      }

      if (!response.body) {
        const errorEvent: StreamEvent = {
          type: "error",
          requestId,
          error: {
            code: "NETWORK_ERROR",
            message: "Failed to get a ReadableStream from the response"
          }
        }
        onEvent(errorEvent)
        throw new Error("Failed to get a ReadableStream from the response")
      }

      let buffer = ""

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(
          new TransformStream<string, string>({
            start() {
              buffer = ""
            },
            transform(chunk, controller) {
              buffer += chunk
              let position: number
              while ((position = buffer.indexOf("\n")) !== -1) {
                const line = buffer.substring(0, position)
                buffer = buffer.substring(position + 1)
                if (line) controller.enqueue(line)
              }
            },
            flush(controller) {
              if (buffer) controller.enqueue(buffer)
            }
          })
        )
        .getReader()

      signal.addEventListener("abort", () => {
        void reader.cancel().catch(() => {})
      })

      let finishReason: CompletionResult["finishReason"] = "stop"

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (signal.aborted) break
        const { value, done } = await reader.read()
        if (done) break

        const chunk = safeParseJsonResponse(value) as
          | DeepSeekStreamChunk
          | undefined
        if (!chunk) continue

        const text =
          chunk?.choices?.[0]?.delta?.content ??
          chunk?.choices?.[0]?.text ??
          chunk?.choices?.[0]?.message?.content ??
          ""

        if (chunk?.choices?.[0]?.finish_reason && chunk.choices[0].finish_reason !== "stop") {
          finishReason = "truncated"
        }

        if (text && text !== "undefined") {
          onEvent({ type: "chunk", requestId, text })
        }
      }

      reader.releaseLock()

      if (signal.aborted) {
        const code = timedOut ? "TIMEOUT" : "CANCELLED"
        const message = timedOut ? "Request timed out" : "Request cancelled"
        onEvent({ type: "error", requestId, error: { code, message } })
        return {
          requestId,
          completion: "",
          finishReason: "cancelled",
          latencyMs: Date.now() - startTime
        }
      }

      onEvent({ type: "end", requestId })

      const latencyMs = Date.now() - startTime
      return {
        requestId,
        completion: "",
        finishReason,
        latencyMs
      }
    } catch (error: unknown) {
      if (
        signal.aborted ||
        (error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError"))
      ) {
        const code = timedOut ? "TIMEOUT" : "CANCELLED"
        const message = timedOut ? "Request timed out" : "Request cancelled"
        onEvent({ type: "error", requestId, error: { code, message } })

        return {
          requestId,
          completion: "",
          finishReason: "cancelled",
          latencyMs: Date.now() - startTime
        }
      }

      if (error instanceof Error) {
        onEvent({
          type: "error",
          requestId,
          error: {
            code: "NETWORK_ERROR",
            message: error.message
          }
        })
      }

      throw error
    } finally {
      clearTimeout(timeout)
      if (this.controller?.signal === signal) this.controller = null
    }
  }
}
