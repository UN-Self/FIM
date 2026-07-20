// ---------------------------------------------------------------------------
// Intent Planner — local heuristics + LLM fallback (plan §4.3, §6 Phase 4)
//
// The planner infers *what* the user is likely doing so the context
// assembler can fetch relevant code.  It MUST NOT rewrite prefix/suffix
// and MUST NOT return arbitrary prompt text.
//
// Two strategies:
//   1. Local rule-based (fast, no API call) — always runs first
//   2. LLM-based (DeepSeek chat, temp=0) — for complex / low-confidence cases
//
// Both return an `IntentPlan`.  Fallback on any error → return unknown intent.
// NEVER throws.
// ---------------------------------------------------------------------------

import type { ContextChunk, GraphEvidence } from "@fim/protocol"
import type { IntentPlan, IntentType } from "@fim/protocol"

// ---- Configuration ----------------------------------------------------------

export interface PlannerLlmConfig {
  apiKey: string
  baseUrl: string
  model: string
  maxContextChars: number
}

const INTENT_TYPES: IntentType[] = [
  "line_continuation",
  "block_completion",
  "import_completion",
  "argument_completion",
  "comment_to_code",
  "test_completion",
  "unknown"
]

const UNKNOWN_PLAN: IntentPlan = {
  intent: "unknown",
  confidence: 0,
  scope: "statement",
  constraints: [],
  requestedSymbolIds: []
}

// ---- Comment syntax map (language → line comment prefix) ---------------------

const LINE_COMMENT: Record<string, string> = {
  bash: "#",
  bat: "REM",
  c: "//",
  cpp: "//",
  csharp: "//",
  dart: "//",
  go: "//",
  java: "//",
  javascript: "//",
  javascriptreact: "//",
  jsx: "//",
  kotlin: "//",
  lua: "--",
  objectivec: "//",
  perl: "#",
  php: "//",
  python: "#",
  r: "#",
  ruby: "#",
  rust: "//",
  scala: "//",
  shellscript: "#",
  sql: "--",
  swift: "//",
  typescript: "//",
  typescriptreact: "//",
  yaml: "#"
}

// ---- Helpers ----------------------------------------------------------------

function lastLine(text: string): string {
  const lines = text.split("\n")
  return lines[lines.length - 1] || ""
}

function previousNonEmptyLine(text: string): string {
  const lines = text.split("\n")
  // Last line may be the current partial line — skip it
  for (let i = lines.length - 2; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (trimmed.length > 0) return trimmed
  }
  return ""
}

function firstLine(text: string): string {
  const idx = text.indexOf("\n")
  return idx === -1 ? text : text.substring(0, idx)
}

function getCommentPrefix(languageId: string): string | undefined {
  const id = languageId.toLowerCase()
  return LINE_COMMENT[id] ?? LINE_COMMENT[id.replace(/[^a-z]/g, "")]
}

// ---- Local rule-based detection ---------------------------------------------

/**
 * Run local heuristics on prefix / suffix to produce a fast, cost-free
 * intent plan.  Used for automatic (as-you-type) completions.
 */
export function detectIntentLocal(
  prefix: string,
  suffix: string,
  languageId: string
): IntentPlan {
  try {
    const curLine = lastLine(prefix)
    const suffixFirstLine = firstLine(suffix)
    const trimmedCurLine = curLine.trim()
    const trimmedPrev = previousNonEmptyLine(prefix)
    const commentPrefix = getCommentPrefix(languageId)

    // ---- 1. Import / require (check first — very specific) ---------------

    const importPatterns = [
      /^(import|from|require)\b/,
      /^(const|let|var)\s+\{?\s*\w+\s*\}?\s*=\s*require\s*\(/,
      /\b(import|from|require)\s*['"]?$/
    ]
    const upperLines = prefix.split("\n").slice(-5)
    const inImport = importPatterns.some(
      (pat) =>
        pat.test(trimmedCurLine) ||
        upperLines.slice(0, -1).some((l) => pat.test(l.trim()))
    )
    if (inImport) {
      return {
        intent: "import_completion",
        confidence: 0.9,
        scope: "statement",
        constraints: [],
        requestedSymbolIds: []
      }
    }

    // ---- 2. Block completion: prefix ends with "{" (not from import),
    //         suffix starts with "}" ---------------------------------------

    const blockMatch =
      /\{\s*$/.test(prefix) && /^\s*\}/.test(suffix)
    if (blockMatch && !trimmedCurLine.startsWith("import")) {
      return {
        intent: "block_completion",
        confidence: 0.9,
        scope: "block",
        constraints: [],
        requestedSymbolIds: []
      }
    }

    // ---- 3. Argument completion: unbalanced "(" on current line ----------

    const parenDepth =
      (curLine.match(/\(/g) || []).length -
      (curLine.match(/\)/g) || []).length
    if (parenDepth > 0 && trimmedCurLine.length > 0) {
      return {
        intent: "argument_completion",
        confidence: 0.85,
        scope: "expression",
        constraints: [],
        requestedSymbolIds: []
      }
    }

    // ---- 4. Comment-to-code: prev line is comment, cursor at new line ----

    if (commentPrefix && trimmedPrev.startsWith(commentPrefix) && trimmedCurLine === "") {
      return {
        intent: "comment_to_code",
        confidence: 0.8,
        scope: "statement",
        constraints: [],
        requestedSymbolIds: []
      }
    }

    // ---- 5. Line continuation: incomplete line with content --------------

    if (trimmedCurLine.length > 0) {
      const terminators = /[;{};,>]$/
      if (!terminators.test(trimmedCurLine)) {
        return {
          intent: "line_continuation",
          confidence: 0.75,
          scope: "statement",
          constraints: [],
          requestedSymbolIds: []
        }
      }
    }

    // 6. cursor at an empty or whitespace-only line → likely line_continuation
    if (trimmedCurLine === "" && trimmedPrev.length > 0) {
      return {
        intent: "line_continuation",
        confidence: 0.5,
        scope: "statement",
        constraints: [],
        requestedSymbolIds: []
      }
    }

    return { ...UNKNOWN_PLAN }
  } catch {
    return { ...UNKNOWN_PLAN }
  }
}

// ---- LLM-based detection ----------------------------------------------------

function buildPlannerPrompt(
  prefix: string,
  suffix: string,
  languageId: string,
  contextChunks?: ContextChunk[],
  evidence?: GraphEvidence[]
): string {
  let projectContext = ""

  if (contextChunks && contextChunks.length > 0) {
    projectContext = contextChunks
      .map((c) => `// ${c.filePath}${c.reason ? ` (${c.reason})` : ""}\n${c.text}`)
      .join("\n\n")
  }

  if (evidence && evidence.length > 0) {
    const evidenceText = evidence
      .map(
        (e) =>
          `${e.relation}: ${e.symbolId}` +
          (e.signature ? ` ${e.signature}` : "") +
          ` [${e.freshness}]`
      )
      .join("\n")
    if (projectContext) projectContext += "\n\nSymbols:\n" + evidenceText
    else projectContext = "Symbols:\n" + evidenceText
  }

  return `You plan a code completion. Infer the likely intent from the exact cursor context and related project code. Do not write completion code. Do not invent symbols. Return JSON only.

Allowed intents: ${INTENT_TYPES.join(", ")}

Return this shape:
{"intent":"...","confidence":0.0,"constraints":["..."],"requestedSymbolIds":["..."]}

Language: ${languageId}

Code before cursor:

~~~
${prefix.slice(-4000)}
~~~

Code after cursor:

~~~
${suffix.slice(0, 1200)}
~~~

${projectContext ? "Related project code:\n\n~~~\n" + projectContext.slice(0, 6000) + "\n~~~" : ""}`
}

/**
 * Call the DeepSeek chat API to produce an LLM-based intent plan.
 *
 * Uses the same pattern as `eval/adapters/intent/deepseek.ts`:
 * sends prefix + suffix in a chat message, asks for JSON, temp=0.
 *
 * Returns `unknown` intent on any error — never throws.
 */
export async function detectIntentLlm(
  prefix: string,
  suffix: string,
  languageId: string,
  config: PlannerLlmConfig,
  contextChunks?: ContextChunk[],
  evidence?: GraphEvidence[]
): Promise<IntentPlan> {
  const prompt = buildPlannerPrompt(prefix, suffix, languageId, contextChunks, evidence)
  const effectiveChars = Math.min(config.maxContextChars, 10000)

  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: prompt.slice(0, effectiveChars)
          }
        ],
        temperature: 0,
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      return { ...UNKNOWN_PLAN, confidence: 0 }
    }

    const data = (await response.json()) as any
    const content = String(data?.choices?.[0]?.message?.content || "")
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) {
      return { ...UNKNOWN_PLAN, confidence: 0 }
    }

    const parsed = JSON.parse(match[0]) as Partial<IntentPlan>
    const intent = INTENT_TYPES.includes(parsed.intent as IntentType)
      ? (parsed.intent as IntentType)
      : "unknown"

    return {
      intent,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      scope: isValidScope(parsed.scope) ? parsed.scope! : "statement",
      constraints: Array.isArray(parsed.constraints)
        ? parsed.constraints
            .filter((v): v is string => typeof v === "string")
            .slice(0, 8)
        : [],
      requestedSymbolIds: Array.isArray(parsed.requestedSymbolIds)
        ? parsed.requestedSymbolIds
            .filter((v): v is string => typeof v === "string")
            .slice(0, 12)
        : []
    }
  } catch {
    return { ...UNKNOWN_PLAN, confidence: 0 }
  }
}

function isValidScope(
  s: unknown
): s is "expression" | "statement" | "block" | "function" {
  return (
    s === "expression" ||
    s === "statement" ||
    s === "block" ||
    s === "function"
  )
}
