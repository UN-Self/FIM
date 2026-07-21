export type JudgeVerdict = "accept" | "partial" | "reject"

export const JUDGE_RUBRIC_VERSION = "completion-v1-pairwise-v1"

export interface JudgeConfig {
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
  runs: number
  pairwiseRuns: number
}

export interface JudgeDecision {
  verdict: JudgeVerdict
  score: number
  failureTags: string[]
  confidence: number
}

export interface JudgeAttempt {
  decision?: JudgeDecision
  error?: string
}

export interface AggregatedJudgeResult {
  verdict?: JudgeVerdict
  score?: number
  agreement: number
  unstable: boolean
  attempts: JudgeAttempt[]
}

export interface PairwiseAttempt {
  winner?: "left" | "right" | "tie"
  error?: string
}

export interface PairwiseAggregate {
  wins: number
  ties: number
  losses: number
  attempts: PairwiseAttempt[]
}

interface CompletionInput {
  prefix: string
  completion: string
  suffix: string
}

const verdicts: JudgeVerdict[] = ["accept", "partial", "reject"]

function completionPrompt(input: CompletionInput): string {
  return `You are a strict code-completion evaluator. Judge only the inserted Completion, not code already present in the prefix or suffix.

Context before the cursor:
\`\`\`
${input.prefix.slice(-800)}
\`\`\`

Completion inserted at the cursor:
\`\`\`
${input.completion}
\`\`\`

Context after the cursor:
\`\`\`
${input.suffix.slice(0, 800)}
\`\`\`

Use accept only when the completion is correct and useful. Use partial when it is plausible but incomplete or weak. Use reject for empty, incorrect, duplicated, unrelated, or syntactically harmful completions.
Return JSON only with exactly this shape:
{"verdict":"accept|partial|reject","score":0,"failureTags":["tag"],"confidence":0.0}`
}

function pairwisePrompt(input: Omit<CompletionInput, "completion"> & { left: string; right: string }): string {
  return `You are a strict, blind code-completion evaluator. Compare only the two inserted completions. Do not credit text already present in the prefix or suffix.

Context before the cursor:
\`\`\`
${input.prefix.slice(-800)}
\`\`\`

Context after the cursor:
\`\`\`
${input.suffix.slice(0, 800)}
\`\`\`

Candidate A:
\`\`\`
${input.left}
\`\`\`

Candidate B:
\`\`\`
${input.right}
\`\`\`

Choose the more correct, useful, and non-duplicative completion. Return JSON only: {"winner":"A|B|tie"}`
}

async function requestJudge(config: JudgeConfig, prompt: string): Promise<string> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" }
    })
  })
  if (!response.ok) throw new Error(`judge API error: ${response.status}`)
  const data = await response.json() as any
  return String(data?.choices?.[0]?.message?.content || "")
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("judge response was not JSON")
    return JSON.parse(match[0])
  }
}

function parseDecision(content: string): JudgeDecision {
  const parsed = parseJson(content) as Record<string, unknown>
  const verdict = parsed.verdict
  const score = Number(parsed.score)
  const confidence = Number(parsed.confidence)
  if (!verdicts.includes(verdict as JudgeVerdict)) throw new Error("judge returned invalid verdict")
  if (!Number.isFinite(score) || score < 0 || score > 4) throw new Error("judge returned invalid score")
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("judge returned invalid confidence")
  return {
    verdict: verdict as JudgeVerdict,
    score,
    failureTags: Array.isArray(parsed.failureTags)
      ? parsed.failureTags.filter((tag): tag is string => typeof tag === "string").slice(0, 8)
      : [],
    confidence
  }
}

export async function judgeCompletion(input: CompletionInput, config: JudgeConfig): Promise<JudgeAttempt> {
  try {
    return { decision: parseDecision(await requestJudge(config, completionPrompt(input))) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "judge failed" }
  }
}

export function aggregateJudgeAttempts(attempts: JudgeAttempt[]): AggregatedJudgeResult {
  const decisions = attempts.flatMap((attempt) => attempt.decision ? [attempt.decision] : [])
  if (decisions.length === 0) return { agreement: 0, unstable: true, attempts }

  const counts = new Map<JudgeVerdict, number>()
  for (const decision of decisions) counts.set(decision.verdict, (counts.get(decision.verdict) || 0) + 1)
  const [verdict, majority] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const scores = decisions.map((decision) => decision.score).sort((a, b) => a - b)
  const score = scores[Math.floor(scores.length / 2)]
  const agreement = majority / decisions.length
  const unstable = agreement <= 0.5 || scores[scores.length - 1] - scores[0] > 2

  return { verdict, score, agreement, unstable, attempts }
}

export async function judgePairwise(
  input: Omit<CompletionInput, "completion"> & { left: string; right: string },
  config: JudgeConfig,
  leftIsCandidate: boolean
): Promise<PairwiseAttempt> {
  try {
    const parsed = parseJson(await requestJudge(config, pairwisePrompt(input))) as Record<string, unknown>
    const winner = parsed.winner
    if (winner === "tie") return { winner: "tie" }
    if (winner !== "A" && winner !== "B") throw new Error("judge returned invalid pairwise winner")
    const pickedLeft = winner === "A"
    return { winner: pickedLeft === leftIsCandidate ? "left" : "right" }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "pairwise judge failed" }
  }
}

export function aggregatePairwise(attempts: PairwiseAttempt[]): PairwiseAggregate {
  let wins = 0
  let ties = 0
  let losses = 0
  for (const attempt of attempts) {
    if (attempt.winner === "left") wins++
    else if (attempt.winner === "right") losses++
    else if (attempt.winner === "tie") ties++
  }
  return { wins, ties, losses, attempts }
}

export function bootstrapWinRate(samples: number[], iterations = 1000): { rate: number; lower: number; upper: number } {
  if (samples.length === 0) return { rate: 0, lower: 0, upper: 0 }
  const rate = samples.reduce((sum, value) => sum + value, 0) / samples.length
  let state = 0x9e3779b9
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  const draws: number[] = []
  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0
    for (let index = 0; index < samples.length; index++) sum += samples[Math.floor(random() * samples.length)]
    draws.push(sum / samples.length)
  }
  draws.sort((a, b) => a - b)
  return {
    rate,
    lower: draws[Math.floor(iterations * 0.025)],
    upper: draws[Math.floor(iterations * 0.975)]
  }
}
