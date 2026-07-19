import * as fs from "fs"
import * as path from "path"
import { Sample } from "../types"

interface SyntheticCase {
  id: string
  filename: string
  languageId: string
  content: string
  cursorLine: number
  cursorCharacter: number
}

const cases: SyntheticCase[] = [
  {
    id: "syn-empty-file",
    filename: "empty.ts",
    languageId: "typescript",
    content: "",
    cursorLine: 0,
    cursorCharacter: 0
  },
  {
    id: "syn-line-continuation",
    filename: "line-cont.ts",
    languageId: "typescript",
    content: "const result = 1 + 2",
    cursorLine: 0,
    cursorCharacter: 19
  },
  {
    id: "syn-block-start",
    filename: "block-start.ts",
    languageId: "typescript",
    content: "function add(a, b) {\n  ",
    cursorLine: 1,
    cursorCharacter: 2
  },
  {
    id: "syn-import",
    filename: "import.ts",
    languageId: "typescript",
    content: "import { ",
    cursorLine: 0,
    cursorCharacter: 9
  },
  {
    id: "syn-comment-to-code",
    filename: "comment.ts",
    languageId: "typescript",
    content: "// sort the array\n",
    cursorLine: 1,
    cursorCharacter: 0
  }
]

export function getSyntheticSamples(): Sample[] {
  const dir = path.join(__dirname, "synthetic")
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return cases.map((c) => {
    const filePath = path.join(dir, c.filename)
    fs.writeFileSync(filePath, c.content)
    return {
      id: c.id,
      source: "synthetic" as const,
      filePath,
      cursor: { line: c.cursorLine, character: c.cursorCharacter },
      languageId: c.languageId
    }
  })
}
