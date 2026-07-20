import { IntentAdapter, IntentAdapterInput, IntentResult, IntentType } from "../types"

export interface IntentPlannerConfig {
  apiKey: string
  baseUrl: string
  maxContextChars: number
  model: string
}

const intentTypes: IntentType[] = [
  "line_continuation",
  "block_completion",
  "import_completion",
  "argument_completion",
  "comment_to_code",
  "test_completion",
  "unknown"
]

function fallback(signal: string): IntentResult {
  return {
    intent: "unknown",
    confidence: 0,
    signals: [signal],
    constraints: [],
    requestedSymbols: []
  }
}

export class DeepSeekIntentPlanner implements IntentAdapter {
  public readonly name = "deepseek-planner"

  constructor(private readonly config: IntentPlannerConfig) {}

  async detect(input: IntentAdapterInput): Promise<IntentResult> {
    const projectContext = input.context.chunks
      .map((chunk) => chunk.text)
      .join("\n\n")
      .slice(0, this.config.maxContextChars)
    const prompt = `You plan a code completion. Infer the likely intent from the exact cursor context and related project code. Do not write completion code. Do not invent symbols. Return JSON only.

Allowed intents: ${intentTypes.join(", ")}

Return this shape:
{"intent":"...","confidence":0.0,"constraints":["..."],"requestedSymbols":["..."]}

Language: ${input.languageId}

Code before cursor:

~~~
${input.prefixSuffix.prefix.slice(-4000)}
~~~

Code after cursor:

~~~
${input.prefixSuffix.suffix.slice(0, 1200)}
~~~

Related project code from CodeGraph:

~~~
${projectContext}
~~~`

    try {
      const response = await fetch(this.config.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          response_format: { type: "json_object" }
        })
      })
      if (!response.ok) return fallback(`planner API error: ${response.status}`)

      const data = await response.json() as any
      const content = String(data?.choices?.[0]?.message?.content || "")
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) return fallback("planner response was not JSON")
      const parsed = JSON.parse(match[0]) as Partial<IntentResult>
      const intent = intentTypes.includes(parsed.intent as IntentType)
        ? parsed.intent as IntentType
        : "unknown"
      return {
        intent,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        signals: ["deepseek-planner", input.context.source],
        constraints: Array.isArray(parsed.constraints)
          ? parsed.constraints.filter((value): value is string => typeof value === "string").slice(0, 8)
          : [],
        requestedSymbols: Array.isArray(parsed.requestedSymbols)
          ? parsed.requestedSymbols.filter((value): value is string => typeof value === "string").slice(0, 12)
          : []
      }
    } catch (error) {
      return fallback(`planner error: ${(error as Error).message}`)
    }
  }
}
