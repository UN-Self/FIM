import * as fs from "fs"
import * as path from "path"
import { Sample } from "./types"

export interface WorkspaceFixture {
  workspace: string
  languageId: string
  currentFile: string
  cursor: { line: number; character: number }
  expectedIntent: string
  expectedCompletion: string
  expectedCompletionAlternatives?: string[]
  expectedGraphEvidence: ExpectedGraphEvidence[]
  expectedConstraints: string[]
  relatedFiles: RelatedFile[]
}

export interface ExpectedGraphEvidence {
  symbolId: string
  filePath: string
  relation: string
  signature?: string
  freshness: string
  provenance: string
}

export interface RelatedFile {
  path: string
  role: string
  symbols: string[]
}

export function loadWorkspaceFixtures(): { samples: Sample[]; fixtures: WorkspaceFixture[] } {
  const fixturesDir = path.resolve(__dirname, "workspace-fixtures")
  if (!fs.existsSync(fixturesDir)) return { samples: [], fixtures: [] }

  const entries = fs.readdirSync(fixturesDir, { withFileTypes: true })
  const fixtures: WorkspaceFixture[] = []
  const samples: Sample[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const fixturePath = path.join(fixturesDir, entry.name)
    const expectedPath = path.join(fixturePath, "expected.json")
    if (!fs.existsSync(expectedPath)) continue

    const expected = JSON.parse(fs.readFileSync(expectedPath, "utf-8")) as WorkspaceFixture
    fixtures.push(expected)

    const currentFilePath = path.join(fixturePath, expected.currentFile)
    if (!fs.existsSync(currentFilePath)) {
      console.warn(`workspace fixture ${entry.name}: currentFile "${expected.currentFile}" not found, skipping`)
      continue
    }

    samples.push({
      id: `ws-${entry.name}`,
      source: "workspace",
      filePath: currentFilePath,
      cursor: expected.cursor,
      languageId: expected.languageId,
      workspaceRoot: fixturePath,
      expectedIntent: expected.expectedIntent,
      expectedCompletion: expected.expectedCompletion,
      expectedCompletionAlternatives: expected.expectedCompletionAlternatives
    })
  }

  return { samples, fixtures }
}
