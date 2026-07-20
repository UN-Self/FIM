// ---------------------------------------------------------------------------
// Fixed-skeleton FIM prompt builder (plan §5, §6 Phase 4)
//
// Extracted from `src/extension/fim-templates.ts` — identical logic, zero
// VS Code dependencies.  All inputs are plain strings; the caller is
// responsible for extracting prefix/suffix and formatting comment headers.
//
// DeepSeek split-only mode: the client sends raw `prompt` (prefix) and
// `suffix` separately.  The server injects the FIM separator tokens
// (`<|fim_begin|>`, `<|fim_hole|>`, `<|fim_end|>`) — the client MUST
// NOT include them in the prompt body.
//
// Enhanced for Phase 4: accepts optional `ContextChunk[]`, `GraphEvidence[]`,
// and `IntentPlan`.  The fixed skeleton per plan §5 is:
//
//   [Optional: validated project context]
//     - raw related code snippets
//     - symbol signatures and call relationships
//     - verified IntentPlan constraints
//
//   [Immutable: current file language and path]
//   [Immutable: current file prefix]
//
//   suffix = [Immutable: current file suffix]
// ---------------------------------------------------------------------------

import type { ContextChunk, GraphEvidence, IntentPlan } from "@fim/protocol"

/**
 * Input parameters for the FIM prompt builder.
 *
 * All fields are plain strings or booleans — no editor, document, or
 * provider types leak in.
 */
export interface FimPromptInput {
  /** Text before the cursor (raw prefix). */
  prefix: string
  /** Text after the cursor (raw suffix). */
  suffix: string
  /** Optional cross-file context text the adapter gathered. */
  context?: string
  /** Optional header block inserted before the prefix (e.g. language +
   * file path in comment syntax). */
  header?: string
  /** When true, the context block is wrapped in language-aware comment
   * delimiters. */
  fileContextEnabled?: boolean
  /** Language identifier used to select the correct comment syntax. */
  language?: string
  /** Phase 4: raw code chunks from context assembler (CodeGraph read). */
  contextChunks?: ContextChunk[]
  /** Phase 4: structural evidence from graph expansion. */
  graphEvidence?: GraphEvidence[]
  /** Phase 4: validated intent plan from the planner pipeline. */
  intentPlan?: IntentPlan
}

/**
 * Result of building a split-mode FIM prompt.
 *
 * Both fields are sent as separate body parameters to the DeepSeek `/beta`
 * completions endpoint.
 */
export interface FimPrompt {
  prompt: string
  suffix: string
}

// Simple comment-syntax map for wrapping file-context blocks.
// Mirrors the subset needed by the prompt builder from
// `src/common/languages.ts`.
const COMMENT_SYNTAX: Record<string, { start: string; end?: string }> = {
  bat: { start: "REM" },
  c: { start: "/*", end: "*/" },
  csharp: { start: "/*", end: "*/" },
  cpp: { start: "/*", end: "*/" },
  css: { start: "/*", end: "*/" },
  go: { start: "/*", end: "*/" },
  html: { start: "<!--", end: "-->" },
  java: { start: "/*", end: "*/" },
  javascript: { start: "/*", end: "*/" },
  javascriptreact: { start: "/*", end: "*/" },
  json: { start: "", end: "" },
  jsx: { start: "/*", end: "*/" },
  kotlin: { start: "/*", end: "*/" },
  "objective-c": { start: "/*", end: "*/" },
  php: { start: "/*", end: "*/" },
  python: { start: "'''", end: "'''" },
  rust: { start: "/*", end: "*/" },
  sass: { start: "/*", end: "*/" },
  scss: { start: "/*", end: "*/" },
  shellscript: { start: "#" },
  swift: { start: "/*", end: "*/" },
  typescript: { start: "/*", end: "*/" },
  typescriptreact: { start: "/*", end: "*/" },
  xml: { start: "<!--", end: "-->" },
  yaml: { start: "#" },
  lua: { start: "--", end: "--[[ ]]--" },
  perl: { start: "#" },
  r: { start: "#" },
  ruby: { start: "=begin", end: "=end" },
  scala: { start: "/*", end: "*/" },
  sql: { start: "/*", end: "*/" },
  xaml: { start: "<!--", end: "-->" }
}

// ---- Internal helpers -------------------------------------------------------

function wrapComment(
  text: string,
  lang?: { start: string; end?: string }
): string {
  if (!lang) return text
  const { start, end } = lang
  if (!start) return text
  const close = end ?? ""
  // For single-line comments, prefix each line
  if (!end) {
    return text
      .split("\n")
      .map((line) => `${start} ${line}`)
      .join("\n")
  }
  return `${start}\n${text}\n${close}`
}

function buildIntentBlock(plan: IntentPlan): string {
  const parts: string[] = []
  parts.push(`Intent: ${plan.intent}`)
  parts.push(`Confidence: ${plan.confidence.toFixed(2)}`)
  parts.push(`Scope: ${plan.scope}`)
  if (plan.constraints.length > 0) {
    parts.push(`Constraints:\n${plan.constraints.map((c) => `  - ${c}`).join("\n")}`)
  }
  if (plan.requestedSymbolIds.length > 0) {
    parts.push(
      `Requested symbols: ${plan.requestedSymbolIds.join(", ")}`
    )
  }
  return parts.join("\n")
}

function buildEvidenceBlock(evidence: GraphEvidence[]): string {
  return evidence
    .map((e) => {
      const sig = e.signature ? ` ${e.signature}` : ""
      return `${e.relation}: ${e.symbolId}${sig} (${e.filePath}) [${e.freshness}]`
    })
    .join("\n")
}

function buildContextBlock(
  chunks: ContextChunk[],
  evidence: GraphEvidence[],
  plan?: IntentPlan,
  lang?: { start: string; end?: string }
): string {
  const sections: string[] = []

  // Intent constraints (validated)
  if (plan && plan.constraints.length > 0) {
    const intentBlock = buildIntentBlock(plan)
    sections.push(wrapComment(intentBlock, lang))
  }

  // Symbol signatures and call relationships
  if (evidence.length > 0) {
    const evidenceText = buildEvidenceBlock(evidence)
    sections.push(wrapComment(`Related symbols:\n${evidenceText}`, lang))
  }

  // Raw code snippets from context assembler
  if (chunks.length > 0) {
    const chunkText = chunks
      .map((c) => {
        const label = c.reason
          ? `File: ${c.filePath} (${c.reason})`
          : `File: ${c.filePath}`
        return wrapComment(`${label}\n${c.text}`, lang)
      })
      .join("\n\n")
    sections.push(chunkText)
  }

  return sections.join("\n\n")
}

// ---- Public API -------------------------------------------------------------

/**
 * Build a split-mode FIM prompt for the DeepSeek `/beta` completions
 * endpoint.
 *
 * The output is a `{ prompt, suffix }` pair where:
 * - `prompt` = optional validated project context + optional header + raw prefix
 * - `suffix` = raw suffix (untouched)
 *
 * When `fileContextEnabled` is true and `language` identifies a known
 * syntax, all context blocks are wrapped in the appropriate comment
 * delimiters.
 *
 * Phase 4 enhancements:
 * - If `contextChunks`, `graphEvidence`, or `intentPlan` are provided,
 *   they are assembled per the fixed skeleton in plan §5 before the
 *   legacy `context` / `header` / `prefix` fields.
 */
export function buildFimPrompt(input: FimPromptInput): FimPrompt {
  const {
    prefix,
    suffix,
    context,
    header,
    fileContextEnabled,
    language,
    contextChunks,
    graphEvidence,
    intentPlan
  } = input

  const lang = language ? COMMENT_SYNTAX[language] : undefined

  // ---- Phase 4: build the validated project context block ---------------

  const projectContext =
    (contextChunks && contextChunks.length > 0) ||
    (graphEvidence && graphEvidence.length > 0) ||
    (intentPlan && intentPlan.constraints.length > 0)
      ? buildContextBlock(
          contextChunks ?? [],
          graphEvidence ?? [],
          intentPlan,
          fileContextEnabled ? lang : undefined
        )
      : ""

  // ---- Legacy file-context block ----------------------------------------

  const fileContext =
    fileContextEnabled && context
      ? `${lang?.start || ""}${context}${lang?.end || ""}`
      : ""

  const heading = header ?? ""

  // ---- Assemble: project context → file context → header → prefix --------

  const promptBody = [projectContext, fileContext, heading, prefix]
    .filter((s) => s.length > 0)
    .join("\n")

  return {
    prompt: promptBody,
    suffix
  }
}
