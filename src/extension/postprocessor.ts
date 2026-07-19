import { Position } from "vscode"
import Parser, { SyntaxNode } from "web-tree-sitter"

import {
  CLOSING_BRACKETS,
  FIM_TEMPLATE_FORMAT,
  LINE_BREAK_REGEX,
  MAX_EMPTY_COMPLETION_CHARS,
  MIN_COMPLETION_CHUNKS,
  MULTI_LINE_DELIMITERS,
  MULTILINE_INSIDE,
  MULTILINE_OUTSIDE,
  OPENING_BRACKETS
} from "../common/constants"
import type { Bracket, PrefixSuffix } from "../common/types"
import { getLineBreakCount } from "../webview/utils"

import { getStopWords } from "./fim-templates"
import { getCurrentLineText } from "./utils"

export interface TruncateArgs {
  completion: string
  providerFimData: string
  chunkCount: number
  providerModelName: string
  providerFimTemplate: string
  nodeAtPosition: SyntaxNode | null
  parser: Parser | undefined
  position: Position | null
  prefixSuffix: PrefixSuffix
  isMultilineCompletion: boolean
  multilineCompletionsEnabled: boolean
  maxLines: number
}

const isMatchingBracket = (open: Bracket, close: string): boolean => {
  const pairs: Record<Bracket, string> = {
    "(": ")",
    "[": "]",
    "{": "}"
  }
  return pairs[open] === close
}

export function truncateCompletion(args: TruncateArgs): string {
  const {
    completion,
    providerFimData,
    chunkCount,
    providerModelName,
    providerFimTemplate,
    nodeAtPosition,
    parser,
    position,
    prefixSuffix,
    isMultilineCompletion,
    multilineCompletionsEnabled,
    maxLines
  } = args

  const stopWords = getStopWords(
    providerModelName,
    providerFimTemplate || FIM_TEMPLATE_FORMAT.automatic
  )

  const result = completion

  if (result.length > MAX_EMPTY_COMPLETION_CHARS && result.trim().length === 0) {
    return result
  }

  if (stopWords.some((stopWord) => result.includes(stopWord))) {
    return result
  }

  if (
    !multilineCompletionsEnabled &&
    chunkCount >= MIN_COMPLETION_CHUNKS &&
    LINE_BREAK_REGEX.test(result.trimStart())
  ) {
    return result
  }

  const isMultilineCompletionRequired =
    !isMultilineCompletion &&
    multilineCompletionsEnabled &&
    chunkCount >= MIN_COMPLETION_CHUNKS &&
    LINE_BREAK_REGEX.test(result.trimStart())
  if (isMultilineCompletionRequired) {
    return result
  }

  try {
    if (nodeAtPosition && parser) {
      const takeFirst =
        MULTILINE_OUTSIDE.includes(nodeAtPosition.type) ||
        (MULTILINE_INSIDE.includes(nodeAtPosition.type) &&
          nodeAtPosition.childCount > 2)

      const lineText = getCurrentLineText(position) || ""
      const contextBeforeCompletion = prefixSuffix.prefix || ""

      const isInsideFunction =
        contextBeforeCompletion.includes("=>") ||
        contextBeforeCompletion.includes("function") ||
        nodeAtPosition.type.includes("function") ||
        nodeAtPosition.type.includes("method") ||
        nodeAtPosition.parent?.type.includes("function") ||
        nodeAtPosition.parent?.type.includes("method")

      if (providerFimData.includes("\n")) {
        const { rootNode } = parser.parse(`${lineText}${result}`)
        const { hasError } = rootNode

        const openBrackets: string[] = []
        let isBalanced = true

        for (const char of result) {
          if (OPENING_BRACKETS.includes(char as Bracket)) {
            openBrackets.push(char)
          } else if (CLOSING_BRACKETS.includes(char as Bracket)) {
            const lastOpen = openBrackets.pop()
            if (!lastOpen || !isMatchingBracket(lastOpen as Bracket, char)) {
              isBalanced = false
              break
            }
          }
        }

        const hasSubstantialContent = result.trim().length > 20
        const hasCompleteSyntax = openBrackets.length === 0 && isBalanced
        const hasEndPattern = /\}\s*$|\)\s*$|\]\s*$|;\s*$/.test(result)
        const endsWithEmptyLine = /\n\s*\n\s*$/.test(result)

        const lines = result.split("\n")
        const lastLineIndent = lines.length > 1
          ? lines[lines.length - 1].length - lines[lines.length - 1].trimStart().length
          : 0
        const firstLineIndent = lines.length > 0
          ? lines[0].length - lines[0].trimStart().length
          : 0
        const indentationReturned = lines.length > 2 && lastLineIndent <= firstLineIndent

        const structuralBoundaryPattern = /\}\s*\n(\s*)\S+/m.test(result)

        if (isInsideFunction && result.includes("}")) {
          const lastClosingBraceIndex = result.lastIndexOf("}")
          if (hasCompleteSyntax) {
            const contentAfterBrace = result.substring(lastClosingBraceIndex + 1).trim()
            if (!contentAfterBrace || /^\s*\n\s*\S+/.test(contentAfterBrace)) {
              return result.substring(0, lastClosingBraceIndex + 1)
            }
          }
        }

        if (structuralBoundaryPattern && hasCompleteSyntax) {
          const match = result.match(/\}\s*\n(\s*)\S+/m)
          if (match && match.index !== undefined) {
            const closingBracePos = match.index + 1
            const indentAfterBrace = match[1].length
            if (indentAfterBrace <= firstLineIndent) {
              return result.substring(0, closingBracePos)
            }
          }
        }

        if (
          nodeAtPosition &&
          isMultilineCompletion &&
          chunkCount >= 2 &&
          (takeFirst || hasCompleteSyntax) &&
          !hasError &&
          (hasEndPattern || endsWithEmptyLine || indentationReturned ||
            (hasSubstantialContent && hasCompleteSyntax))
        ) {
          if (
            MULTI_LINE_DELIMITERS.some((delimiter) => result.endsWith(delimiter)) ||
            endsWithEmptyLine ||
            (hasEndPattern && hasCompleteSyntax) ||
            (structuralBoundaryPattern && hasCompleteSyntax)
          ) {
            return result
          }
        }
      }
    }
  } catch {
    // AST parse error: fall through to maxLines check (mirrors original onData behavior)
  }

  if (getLineBreakCount(result) >= maxLines) {
    return result
  }

  return ""
}
