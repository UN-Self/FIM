import { describe, expect, it, vi } from "vitest"

import type { CompletionRequest, DeepSeekProviderConfig, StreamEvent } from "@fim/protocol"

import { CompletionOrchestrator } from "../../services/engine-ts/src/completion/orchestrator"
import { DeepSeekFimClient } from "../../services/engine-ts/src/model/deepseek-fim"

const provider: DeepSeekProviderConfig = {
  apiHostname: "example.test",
  apiKey: "test-key",
  apiPath: "/beta/completions",
  apiProtocol: "https",
  modelName: "deepseek-chat"
}

function makeRequest(requestId: string): CompletionRequest {
  return {
    requestId,
    workspace: { id: "test", rootUri: "/workspace" },
    document: {
      uri: "/workspace/example.ts",
      languageId: "typescript",
      text: "const value = ",
      version: 1
    },
    cursor: { line: 0, character: 14 },
    mode: "manual",
    config: {
      contextLength: 100,
      debounceWait: 0,
      temperature: 0.2,
      maxTokens: 128,
      multilineCompletionsEnabled: true,
      maxLines: 40,
      fileContextEnabled: false,
      completionCacheEnabled: true,
      autoSuggestEnabled: true,
      enableSubsequentCompletions: true,
      graphContextEnabled: false
    },
    provider
  }
}

describe("engine cancellation", () => {
  it("keeps the stream timeout active after response headers arrive", async () => {
    const client = new DeepSeekFimClient({ timeoutMs: 10 })
    const events: StreamEvent[] = []
    const originalFetch = globalThis.fetch

    globalThis.fetch = vi.fn(async () => {
      return new Response(new ReadableStream({ start() {} }))
    }) as typeof fetch

    try {
      const result = await client.stream(
        provider,
        {
          max_tokens: 128,
          model: provider.modelName,
          prompt: "prefix",
          suffix: "suffix",
          stream: true,
          temperature: 0.2
        },
        "timeout-test",
        (event) => events.push(event)
      )

      expect(result.finishReason).toBe("cancelled")
      expect(result.completion).toBe("")
      expect(events.some((event) =>
        event.type === "error" && event.error.code === "TIMEOUT"
      )).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("does not cache or return a partial non-stop result", async () => {
    const orchestrator = new CompletionOrchestrator({ debounceWait: 0 })
    const stream = vi.fn(async (_provider, _body, requestId, onEvent) => {
      onEvent({ type: "chunk", requestId, text: "partial" })
      return {
        requestId,
        completion: "partial",
        finishReason: "truncated" as const,
        latencyMs: 1
      }
    })
    ;(orchestrator as unknown as { _client: { stream: typeof stream } })._client = {
      stream
    }

    const first = await orchestrator.complete(makeRequest("first"), () => {})
    const second = await orchestrator.complete(makeRequest("second"), () => {})

    expect(first.completion).toBe("")
    expect(first.finishReason).toBe("truncated")
    expect(second.completion).toBe("")
    expect(stream).toHaveBeenCalledTimes(2)
  })
})
