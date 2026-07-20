export interface Sample {
  id: string
  source: "synthetic" | "fim-self" | "workspace"
  filePath: string
  cursor: { line: number; character: number }
  languageId: string
  workspaceRoot?: string
  expectedIntent?: string
  /** Primary golden fixture: the single best expected completion for exact-match comparison. */
  expectedCompletion?: string
  /** Additional acceptable completions for fuzzy/alternative-match comparison. */
  expectedCompletionAlternatives?: string[]
}
