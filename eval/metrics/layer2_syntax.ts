import Parser from "web-tree-sitter"

import { getParser } from "../../src/extension/parser"

export interface Layer2Result {
  syntaxValid: boolean
  bracketBalanced: boolean
  noOverrun: boolean
  noDuplication: boolean
  errorNodeCount: number
}

const OPENING = ["[", "{", "("]
const CLOSING = ["]", "}", ")"]

function checkBracketBalance(text: string): boolean {
  const stack: string[] = []
  const pairs: Record<string, string> = { "]": "[", "}": "{", ")": "(" }
  for (const char of text) {
    if (OPENING.includes(char)) stack.push(char)
    else if (CLOSING.includes(char)) {
      if (stack.pop() !== pairs[char]) return false
    }
  }
  return stack.length === 0
}

export async function evalLayer2(
  prefix: string,
  completion: string,
  suffix: string,
  filePath: string,
  languageId: string
): Promise<Layer2Result> {
  const fullText = `${prefix}${completion}${suffix}`

  let errorNodeCount = 0
  let syntaxValid = true
  try {
    const parser = await getParser(filePath)
    if (parser) {
      const tree = parser.parse(fullText)
      const iterate = (node: Parser.SyntaxNode) => {
        if (node.type.includes("ERROR") || node.hasError) errorNodeCount++
        for (const child of node.children) iterate(child)
      }
      iterate(tree.rootNode)
      syntaxValid = errorNodeCount === 0 && !tree.rootNode.hasError
    } else {
      // 无 parser 的语言，跳过语法检查（视为通过）
      syntaxValid = true
    }
  } catch {
    syntaxValid = false
  }

  const bracketBalanced = checkBracketBalance(completion)
  const noOverrun = !/\n\s*\n\s*\n/.test(completion.trim()) // 粗略：补全不应有连续多空行（越界信号）
  const trimmedCompletion = completion.trim()
  const noDuplication =
    trimmedCompletion.length === 0 ||
    !suffix.startsWith(trimmedCompletion.split("\n").pop() || "___NOMATCH___")

  return { syntaxValid, bracketBalanced, noOverrun, noDuplication, errorNodeCount }
}
