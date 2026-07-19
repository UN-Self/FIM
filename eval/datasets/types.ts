export interface Sample {
  id: string
  source: "synthetic" | "fim-self"
  filePath: string
  cursor: { line: number; character: number }
  languageId: string
  expectedCompletion?: string
}
