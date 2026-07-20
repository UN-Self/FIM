// ---------------------------------------------------------------------------
// Graph subgraph expansion and context assembly layer (plan §4.2, Phase 3)
//
// Connects the CodeGraph provider (Phase 2) to the prompt builder (Phase 4).
// The ContextAssembler is the single entry-point for turning a cursor
// position into a ranked, budget-aware set of cross-file code chunks.
//
// Zero VS Code dependencies — works on plain strings and protocol types.
// ---------------------------------------------------------------------------

import type {
  ContextChunk,
  GraphBudget,
  GraphEvidence,
  GraphProvider,
  GraphSeed,
  SeedSymbol,
  TokenBudget,
  WorkspaceRef
} from "@fim/protocol"

// ---- Public input type ----------------------------------------------------

export interface GraphSeedInput {
  /** Absolute path to the current file on disk. */
  filePath: string
  /** VS Code / LSP language identifier (e.g. "typescript"). */
  languageId: string
  /** Text before the cursor (the raw prefix). */
  prefix: string
  /** Text after the cursor (the raw suffix). */
  suffix: string
  /** Zero-based cursor line within the document. */
  cursorLine: number
  /** Zero-based cursor character within the line. */
  cursorCharacter: number
}

// ---- Assembly result type -------------------------------------------------

export interface AssemblyResult {
  chunks: ContextChunk[]
  evidence: GraphEvidence[]
  tokenEstimate: number
  source: "codegraph" | "fallback"
}

// ---- Constants ------------------------------------------------------------

/** Relationship priority — lower number = higher priority. */
const RELATION_PRIORITY: Record<string, number> = {
  "definition": 0,
  "caller": 1,
  "callee": 2,
  "type": 3,
  "test": 4,
  "reference": 5,
  "import": 6
}

/** Timeout (ms) for a single graph-provider call. */
const GRAPH_TIMEOUT_MS = 5000

/** Rough chars-per-token estimate for code. */
const CHARS_PER_TOKEN = 4

/** Max lines of prefix to scan for local identifiers (from the cursor up). */
const LOCAL_ID_SCAN_LINES = 3

/** Minimum symbol-id length for local identifiers. */
const MIN_SYMBOL_LENGTH = 3

// ---- Common keywords to filter out of local-identifier extraction ----------

const KEYWORDS = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "export", "extends", "finally",
  "for", "function", "if", "import", "in", "instanceof", "let",
  "new", "of", "return", "super", "switch", "this", "throw", "try",
  "typeof", "var", "void", "while", "with", "yield", "async", "await",
  "static", "public", "private", "protected", "readonly", "abstract",
  "implements", "interface", "type", "enum", "namespace", "module",
  "declare", "from", "as", "is", "keyof", "infer", "never", "unknown",
  "any", "boolean", "number", "string", "symbol", "object", "null",
  "undefined", "true", "false", "def", "pass", "elif", "except",
  "raise", "lambda", "global", "nonlocal", "self", "cls", "fn", "func",
  "go", "package", "struct", "map", "chan", "select", "range",
  "goto", "fallthrough", "println", "printf", "nil", "and", "or",
  "not", "int", "float", "double", "char", "short", "long", "byte",
  "void", "bool", "print", "fmt"
])

// ---- Public API ------------------------------------------------------------

/**
 * ContextAssembler turns a cursor position into a ranked, budget-aware set
 * of cross-file code chunks by consulting a `GraphProvider`.
 *
 * It never throws — on any failure it returns a fallback result with empty
 * chunks and evidence so the completion pipeline can continue with
 * current-file context only.
 */
export class ContextAssembler {
  constructor(private graphProvider: GraphProvider) {}

  /**
   * Assemble context for a completion request.
   *
   * Returns an `AssemblyResult` with the gathered chunks, evidence, a token
   * estimate, and a `source` label indicating whether the graph contributed.
   */
  async assemble(
    seedInput: GraphSeedInput,
    budget: GraphBudget,
    tokenBudget: TokenBudget
  ): Promise<AssemblyResult> {
    const empty: AssemblyResult = {
      chunks: [],
      evidence: [],
      tokenEstimate: 0,
      source: "fallback"
    }

    // ---- 1. Generate seed from cursor context ----
    const seed = generateGraphSeed(seedInput)

    // ---- 2. Expand: discover related symbols ----
    let evidence: GraphEvidence[] = []
    try {
      evidence = await withTimeout(
        this.graphProvider.expand(seed, budget),
        GRAPH_TIMEOUT_MS
      )
    } catch (err) {
      // expand() failed — log and fall back
      logGraphError("expand", err)
      return empty
    }

    // If expand returned nothing useful, fall back immediately.
    if (!evidence || evidence.length === 0) {
      return empty
    }

    // ---- 3. Sort evidence by relationship priority ----
    const sorted = sortEvidence(evidence)

    // ---- 4. Collect symbol IDs in priority order ----
    const rankedSymbolIds = deduplicateSymbolIds(sorted)

    // ---- 5. Read code for symbols within token budget ----
    let chunks: ContextChunk[] = []
    try {
      const readResult = await withTimeout(
        this.graphProvider.read(rankedSymbolIds, tokenBudget),
        GRAPH_TIMEOUT_MS
      )
      if (readResult && readResult.length > 0) {
        chunks = readResult
      }
    } catch (err) {
      // read() failed — return what we have (evidence without chunks is
      // better than crashing the completion pipeline).
      logGraphError("read", err)
    }

    // ---- 6. Deduplicate chunks by symbolId ----
    chunks = deduplicateChunks(chunks)

    // ---- 7. Estimate token usage ----
    const tokenEstimate = estimateTokens(chunks)

    // ---- 8. Trim to token budget ----
    chunks = trimToBudget(chunks, tokenBudget)

    return {
      chunks,
      evidence: sorted,
      tokenEstimate,
      source: "codegraph"
    }
  }
}

// ---- Graph seed generation -------------------------------------------------

/**
 * Generate a `GraphSeed` from cursor-position hints using only regex /
 * heuristics — no tree-sitter required.
 */
export function generateGraphSeed(input: GraphSeedInput): GraphSeed {
  const symbols: SeedSymbol[] = []

  // 1. Current file as a cursor-level seed
  symbols.push({
    symbolId: input.filePath,
    filePath: input.filePath,
    source: "cursor"
  })

  // 2. Parent scope — nearest function / method / class enclosing the cursor
  const parentSymbol = extractParentScope(input.prefix, input.languageId)
  if (parentSymbol) {
    symbols.push({
      symbolId: parentSymbol,
      filePath: input.filePath,
      source: "parent_scope"
    })
  }

  // 3. Imported symbols
  const imported = extractImports(input.prefix, input.languageId)
  for (const sym of imported) {
    symbols.push({
      symbolId: sym,
      filePath: input.filePath,
      source: "import"
    })
  }

  // 4. Local identifier references near cursor
  const locals = extractLocalIdentifiers(
    input.prefix,
    input.suffix,
    input.cursorLine
  )
  for (const sym of locals) {
    symbols.push({
      symbolId: sym,
      filePath: input.filePath,
      source: "local_identifier"
    })
  }

  return {
    symbols: deduplicateSymbolsById(symbols),
    maxDepth: 2
  }
}

// ---- Symbol extraction helpers ---------------------------------------------

/**
 * Extract the nearest enclosing function, method, or class name from the
 * prefix by scanning backwards from the cursor.
 */
export function extractParentScope(
  prefix: string,
  _languageId: string
): string | null {
  if (!prefix) return null

  const lines = prefix.split("\n")

  // First pass: look for a class declaration (class scopes take priority
  // because they provide more structural context than individual methods).
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/class\s+(\w+)/)
    if (m && m[1] && !KEYWORDS.has(m[1].toLowerCase())) {
      return m[1]
    }
  }

  // Second pass: scan backwards for the nearest function or method.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]

    // Match common function / method definition patterns across
    // multiple languages.  We capture the name in group 1.
    // Class declarations are already handled above, so only
    // function / method patterns remain here.
    const patterns = [
      // JavaScript / TypeScript function declaration
      /(?:async\s+)?function\s+(\w+)\s*[<(]/,
      // Method shorthand in object / class body.
      // Require "{" or ":" after the closing paren to avoid matching
      // function *calls* (e.g. `getDiscount(customer)` at end-of-line).
      /(?:public|private|protected|static|abstract|readonly)?\s*(?:async\s+)?(\w+)\s*[<(][^)]*\)\s*[{:]\s*$/,
      // Python: def name(
      /def\s+(\w+)\s*\(/,
      // Rust: fn name(
      /fn\s+(\w+)\s*[<(]/,
      // Go: func (receiver) name(  or  func name(
      /func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/,
      // Java / Kotlin: visibility? static? returnType name( ... ) { ... }
      /(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*(?:throws\s+\w+)?\s*\{\s*$/,
      // Arrow function assigned to const/let/var
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/,
      // Ruby: def name or def self.name
      /def\s+(?:self\.)?(\w+)/,
      // Lua: function name(
      /function\s+(\w+)\s*\(/,
      // PHP: function name( or public function name(
      /(?:public\s+|private\s+|protected\s+|static\s+)?function\s+(\w+)\s*\(/,
      // C# method pattern — require "{" after closing paren
      /(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*(?:where\s+\w+)?\s*\{\s*$/
    ]

    for (const re of patterns) {
      const m = line.match(re)
      if (m && m[1] && !KEYWORDS.has(m[1].toLowerCase())) {
        return m[1]
      }
    }
  }

  return null
}

/**
 * Extract imported symbol names from the prefix text.
 *
 * Handles JavaScript/TypeScript `import`, Python `from/import`, Go `import`,
 * Rust `use`, and Java/Kotlin `import` statements.
 */
export function extractImports(prefix: string, _languageId: string): string[] {
  if (!prefix) return []

  const symbols: string[] = []

  // NOTE: all regexes are created fresh inside the function body so that
  // `lastIndex` does not persist across calls (a classic footgun with
  // module-level /g regexes).

  // ---- JavaScript / TypeScript named imports ----
  const jsNamedImportRe = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g
  let match: RegExpExecArray | null
  while ((match = jsNamedImportRe.exec(prefix)) !== null) {
    const names = match[1].split(",")
    for (const name of names) {
      const clean = name.trim()
      const aliasMatch = clean.match(/(\w+)\s+as\s+(\w+)/)
      if (aliasMatch) {
        symbols.push(aliasMatch[2])
      } else if (clean) {
        symbols.push(clean)
      }
    }
  }

  // ---- JavaScript / TypeScript default imports ----
  const jsDefaultImportRe = /import\s+(\w+)\s+from\s*['"][^'"]+['"]/g
  while ((match = jsDefaultImportRe.exec(prefix)) !== null) {
    if (match[1]) symbols.push(match[1])
  }

  // ---- JavaScript / TypeScript namespace imports ----
  const jsNamespaceImportRe = /import\s+\*\s+as\s+(\w+)\s+from\s*['"][^'"]+['"]/g
  while ((match = jsNamespaceImportRe.exec(prefix)) !== null) {
    if (match[1]) symbols.push(match[1])
  }

  // ---- JavaScript require() ----
  const jsRequireRe = /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"][^'"]+['"]\s*\)/g
  while ((match = jsRequireRe.exec(prefix)) !== null) {
    if (match[1]) symbols.push(match[1])
  }

  // ---- Python from-import ----
  const pyFromImportRe = /from\s+\S+\s+import\s+([^\n]+)/g
  while ((match = pyFromImportRe.exec(prefix)) !== null) {
    const names = match[1].split(",")
    for (const name of names) {
      const clean = name.trim()
      if (clean && clean !== "*") {
        const aliasMatch = clean.match(/(\w+)\s+as\s+(\w+)/)
        if (aliasMatch) {
          symbols.push(aliasMatch[2])
        } else {
          symbols.push(clean)
        }
      }
    }
  }

  // ---- Python import (module-level) ----
  const pyImportRe = /^import\s+(\w+)/gm
  while ((match = pyImportRe.exec(prefix)) !== null) {
    if (match[1]) symbols.push(match[1])
  }

  // ---- Go imports: single-line `import "xxx"` and grouped `import (...)` ----
  // Single-line
  const goSingleImportRe = /import\s+(?:\w+\s+)?['"]([^'"]+)['"]/g
  while ((match = goSingleImportRe.exec(prefix)) !== null) {
    if (match[1]) {
      const parts = match[1].split("/")
      symbols.push(parts[parts.length - 1])
    }
  }
  // Grouped form: import ( "a" ; "b" )
  const goGroupMatch = prefix.match(/import\s*\(([\s\S]*?)\)/)
  if (goGroupMatch) {
    const body = goGroupMatch[1]
    const pkgRe = /['"]([^'"]+)['"]/g
    let pkgMatch
    while ((pkgMatch = pkgRe.exec(body)) !== null) {
      if (pkgMatch[1]) {
        const parts = pkgMatch[1].split("/")
        symbols.push(parts[parts.length - 1])
      }
    }
  }

  // ---- Rust use ----
  const rustUseRe = /use\s+([^;]+);/g
  while ((match = rustUseRe.exec(prefix)) !== null) {
    if (match[1]) {
      const parts = match[1].split("::")
      const last = parts[parts.length - 1].trim()
      if (last && last !== "*" && last !== "self") {
        symbols.push(last)
      }
    }
  }

  // ---- Java / Kotlin imports ----
  const javaImportRe = /import\s+(?:static\s+)?([\w.]+)\.(\w+)\s*;/g
  while ((match = javaImportRe.exec(prefix)) !== null) {
    if (match[2] && match[2] !== "*") {
      symbols.push(match[2])
    }
  }

  // Imports are not filtered by MIN_SYMBOL_LENGTH — short names like "_"
  // (lodash), "fs", "os" are valid import symbols.
  return [...new Set(symbols)]
}

/**
 * Extract local variable and identifier references near the cursor.
 *
 * Analyses the last few lines of prefix and the first line of suffix for
 * identifier-like tokens, filtering out keywords and short tokens.
 */
export function extractLocalIdentifiers(
  prefix: string,
  suffix: string,
  _cursorLine: number
): string[] {
  const symbols: string[] = []
  const prefixLines = prefix ? prefix.split("\n") : []
  const suffixLines = suffix ? suffix.split("\n") : []

  // Collect the last N lines of prefix (closest to cursor)
  const scanStart = Math.max(0, prefixLines.length - LOCAL_ID_SCAN_LINES)
  for (let i = scanStart; i < prefixLines.length; i++) {
    extractWords(prefixLines[i], symbols)
  }

  // Collect the first line of suffix
  if (suffixLines.length > 0 && suffixLines[0]) {
    extractWords(suffixLines[0], symbols)
  }

  return [...new Set(symbols)]
}

/** Split a line into identifier-like tokens, filter keywords, and add them. */
function extractWords(line: string, out: string[]): void {
  // Match CamelCase, snake_case, and plain identifiers
  const wordRe = /\b[a-zA-Z_$][\w$]*\b/g
  let match
  while ((match = wordRe.exec(line)) !== null) {
    const word = match[0]
    if (
      word.length >= MIN_SYMBOL_LENGTH &&
      !KEYWORDS.has(word.toLowerCase())
    ) {
      out.push(word)
    }
  }
}

// ---- Sorting, deduplication, and trimming helpers --------------------------

/**
 * Sort evidence entries by relationship priority (lower number = earlier),
 * then by freshness (fresh before stale).
 */
export function sortEvidence(evidence: GraphEvidence[]): GraphEvidence[] {
  return [...evidence].sort((a, b) => {
    const priA = RELATION_PRIORITY[a.relation] ?? 99
    const priB = RELATION_PRIORITY[b.relation] ?? 99
    if (priA !== priB) return priA - priB
    // Freshness tie-break: fresh < stale
    if (a.freshness !== b.freshness) {
      return a.freshness === "fresh" ? -1 : 1
    }
    return 0
  })
}

/** Deduplicate evidence entries by symbolId, keeping the first occurrence. */
export function deduplicateEvidence(evidence: GraphEvidence[]): GraphEvidence[] {
  const seen = new Set<string>()
  return evidence.filter(e => {
    if (seen.has(e.symbolId)) return false
    seen.add(e.symbolId)
    return true
  })
}

/** Extract deduplicated symbol IDs from sorted evidence. */
export function deduplicateSymbolIds(evidence: GraphEvidence[]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const e of evidence) {
    if (!seen.has(e.symbolId)) {
      seen.add(e.symbolId)
      ids.push(e.symbolId)
    }
  }
  return ids
}

/** Deduplicate seed symbols by symbolId. */
function deduplicateSymbolsById(symbols: SeedSymbol[]): SeedSymbol[] {
  const seen = new Set<string>()
  return symbols.filter(s => {
    if (seen.has(s.symbolId)) return false
    seen.add(s.symbolId)
    return true
  })
}

/** Deduplicate context chunks by symbolId (or filePath if no symbolId). */
export function deduplicateChunks(chunks: ContextChunk[]): ContextChunk[] {
  const seen = new Set<string>()
  return chunks.filter(c => {
    const key = c.symbolId ?? c.filePath
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Estimate token count from an array of chunks (chars / 4). */
export function estimateTokens(chunks: ContextChunk[]): number {
  let total = 0
  for (const c of chunks) {
    total += Math.ceil((c.text?.length ?? 0) / CHARS_PER_TOKEN)
  }
  return total
}

/**
 * Trim chunks to fit within the token budget.
 *
 * Chunks are assumed to already be in priority order.  We keep them from
 * the front until adding the next chunk would exceed `maxTokens`.
 */
export function trimToBudget(
  chunks: ContextChunk[],
  budget: TokenBudget
): ContextChunk[] {
  if (chunks.length === 0) return chunks

  let used = 0
  const result: ContextChunk[] = []

  for (const chunk of chunks) {
    const chunkTokens = Math.ceil(
      (chunk.text?.length ?? 0) / CHARS_PER_TOKEN
    )
    if (used + chunkTokens <= budget.maxTokens || result.length === 0) {
      result.push(chunk)
      used += chunkTokens
    }
    // Once we exceed budget, stop adding (but always keep at least one chunk)
  }

  return result
}

/**
 * Format an array of context chunks into a single string suitable for
 * injection into the FIM prompt.
 *
 * Each chunk is prefixed with its file path and, if available, the symbol
 * identifier and relationship reason.
 */
export function formatContextChunks(chunks: ContextChunk[]): string {
  if (!chunks.length) return ""

  const parts: string[] = []
  for (const chunk of chunks) {
    const header = chunk.symbolId
      ? `// ${chunk.filePath} (${chunk.symbolId})`
      : `// ${chunk.filePath}`
    const reason = chunk.reason ? `// reason: ${chunk.reason}` : ""
    const headerBlock = reason ? `${header}\n${reason}` : header
    parts.push(`${headerBlock}\n${chunk.text}`)
  }

  return parts.join("\n\n")
}

// ---- Internal helpers ------------------------------------------------------

/**
 * Execute a promise with a timeout.  If it does not settle within `ms`
 * milliseconds, reject with a timeout error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Graph operation timed out after ${ms}ms`))
    }, ms)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

/** Log a graph-provider error without throwing. */
function logGraphError(operation: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  // In the engine core we cannot use VS Code's output channel, so we log to
  // stderr which the adapter can capture if desired.
  if (typeof process !== "undefined" && process.stderr) {
    process.stderr.write(
      `[ContextAssembler] graph ${operation}() failed: ${message}\n`
    )
  }
}
