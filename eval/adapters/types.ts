import { PrefixSuffix } from "../../src/common/types"

export interface ContextChunk {
  filePath: string
  text: string
  relevanceScore?: number
  reason?: string
}

export interface ContextIR {
  chunks: ContextChunk[]
  tokenEstimate: number
  source: string
}

export type IntentType =
  | "line_continuation"
  | "block_completion"
  | "import_completion"
  | "argument_completion"
  | "comment_to_code"
  | "test_completion"
  | "unknown"

export interface IntentResult {
  intent: IntentType
  confidence: number
  signals: string[]
}

export interface ContextAdapterInput {
  filePath: string
  languageId: string
  prefixSuffix: PrefixSuffix
  cursor: { line: number; character: number }
}

export interface ContextAdapter {
  name: string
  collect(input: ContextAdapterInput): Promise<ContextIR>
}

export interface IntentAdapterInput {
  languageId: string
  prefixSuffix: PrefixSuffix
  cursor: { line: number; character: number }
}

export interface IntentAdapter {
  name: string
  detect(input: IntentAdapterInput): Promise<IntentResult>
}

export interface AdapterMatrix {
  label: string
  contextAdapter: ContextAdapter
  intentAdapter: IntentAdapter
}
