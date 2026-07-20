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
  expectedIntent: string
  expectedCompletion: string
  expectedCompletionAlternatives?: string[]
}

const cases: SyntheticCase[] = [
  {
    id: "syn-empty-file",
    filename: "empty.ts",
    languageId: "typescript",
    content: "",
    cursorLine: 0,
    cursorCharacter: 0,
    expectedIntent: "unknown",
    expectedCompletion: "",
    expectedCompletionAlternatives: ["// ", "import "]
  },
  {
    id: "syn-line-continuation",
    filename: "line-cont.ts",
    languageId: "typescript",
    content: "const result = 1 + 2",
    cursorLine: 0,
    cursorCharacter: 19,
    expectedIntent: "line_continuation",
    expectedCompletion: " + 3",
    expectedCompletionAlternatives: [
      " + 4",
      " * 2",
      ";\n",
      ";"
    ]
  },
  {
    id: "syn-block-start",
    filename: "block-start.ts",
    languageId: "typescript",
    content: "function add(a, b) {\n  ",
    cursorLine: 1,
    cursorCharacter: 2,
    expectedIntent: "block_completion",
    expectedCompletion: "return a + b;\n}",
    expectedCompletionAlternatives: [
      "return a + b;\n}\n",
      "const result = a + b;\n  return result;\n}"
    ]
  },
  {
    id: "syn-import",
    filename: "import.ts",
    languageId: "typescript",
    content: "import { ",
    cursorLine: 0,
    cursorCharacter: 9,
    expectedIntent: "import_completion",
    expectedCompletion: "foo } from './module'",
    expectedCompletionAlternatives: [
      "useState } from 'react'",
      "Component } from '@angular/core'",
      "Foo, Bar } from './utils'"
    ]
  },
  {
    id: "syn-comment-to-code",
    filename: "comment.ts",
    languageId: "typescript",
    content: "// sort the array\n",
    cursorLine: 1,
    cursorCharacter: 0,
    expectedIntent: "comment_to_code",
    expectedCompletion: "array.sort((a, b) => a - b);\n",
    expectedCompletionAlternatives: [
      "array.sort();\n",
      "const sorted = array.sort();\n",
      "items.sort();\n"
    ]
  },
  {
    id: "syn-argument-completion",
    filename: "arg-completion.ts",
    languageId: "typescript",
    content: "function foo(x, y) {}\nfoo(",
    cursorLine: 1,
    cursorCharacter: 4,
    expectedIntent: "argument_completion",
    expectedCompletion: "x, y)",
    expectedCompletionAlternatives: [
      "x, y);",
      "x, y);\n",
      "x)"
    ]
  },
  {
    id: "syn-test-completion",
    filename: "test-completion.ts",
    languageId: "typescript",
    content: "describe('add', () => {\n  it('should add', () => {\n    ",
    cursorLine: 2,
    cursorCharacter: 4,
    expectedIntent: "block_completion",
    expectedCompletion: "expect(add(1, 2)).toBe(3);\n  });\n});",
    expectedCompletionAlternatives: [
      "expect(add(1, 2)).toEqual(3);\n  });\n});",
      "const result = add(1, 2);\n    expect(result).toBe(3);\n  });\n});",
      "expect(add(2, 3)).toBe(5);\n  });\n});"
    ]
  },
  {
    id: "syn-return-statement",
    filename: "return-stmt.ts",
    languageId: "typescript",
    content: "function getValue() {\n  ",
    cursorLine: 1,
    cursorCharacter: 2,
    expectedIntent: "block_completion",
    expectedCompletion: "return value;\n}",
    expectedCompletionAlternatives: [
      "return value;\n}\n",
      "return null;\n}",
      "return undefined;\n}"
    ]
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
      languageId: c.languageId,
      workspaceRoot: dir,
      expectedIntent: c.expectedIntent,
      expectedCompletion: c.expectedCompletion,
      expectedCompletionAlternatives: c.expectedCompletionAlternatives
    }
  })
}
