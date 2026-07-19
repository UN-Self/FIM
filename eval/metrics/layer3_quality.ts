/// <reference lib="DOM" />

export interface Layer3Result {
  score: number
  reasoning: string
  judged: boolean
}

export async function evalLayer3(
  prefix: string,
  completion: string,
  suffix: string,
  judge: { baseUrl: string; apiKey: string; model: string; enabled: boolean }
): Promise<Layer3Result> {
  if (!judge.enabled) {
    return { score: 0, reasoning: "judge not configured, Layer3 skipped", judged: false }
  }

  const prompt = `You are evaluating a code completion. Score it 0-10.

Context BEFORE cursor (prefix):
\`\`\`
${prefix.slice(-500)}
\`\`\`

Completion:
\`\`\`
${completion}
\`\`\`

Context AFTER cursor (suffix):
\`\`\`
${suffix.slice(0, 500)}
\`\`\`

Evaluate: Is the completion correct? Is it what the user likely wanted? Is the code style reasonable?
Respond in JSON: {"score": <0-10>, "reasoning": "<one sentence>"}`

  try {
    const url = `${judge.baseUrl.replace(/\/$/, "")}/v1/chat/completions`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${judge.apiKey}`
      },
      body: JSON.stringify({
        model: judge.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0
      })
    })
    if (!res.ok) {
      return { score: 0, reasoning: `judge API error: ${res.status}`, judged: false }
    }
    const data = await res.json() as any
    const content = data?.choices?.[0]?.message?.content || ""
    const match = content.match(/\{[^}]+\}/s)
    if (match) {
      const parsed = JSON.parse(match[0])
      return {
        score: Number(parsed.score) || 0,
        reasoning: String(parsed.reasoning || ""),
        judged: true
      }
    }
    return { score: 0, reasoning: `judge response unparseable: ${content.slice(0, 100)}`, judged: false }
  } catch (e) {
    return { score: 0, reasoning: `judge error: ${(e as Error).message}`, judged: false }
  }
}
