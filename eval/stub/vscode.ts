// eval/stub/vscode.ts
// Minimal vscode stub for eval. Only implements what the FIM completion chain uses.

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  public start: Position
  public end: Position
  constructor(start: Position, end: Position)
  constructor(startLine: number, startChar: number, endLine: number, endChar: number)
  constructor(a: Position | number, b: Position | number, c?: number, d?: number) {
    if (a instanceof Position) {
      this.start = a
      this.end = b as Position
    } else {
      this.start = new Position(a as number, b as number)
      this.end = new Position(c as number, d as number)
    }
  }
}

export interface TextLine {
  text: string
  range: Range
  rangeIncludingLineBreak: Range
  firstNonWhitespaceCharacterIndex: number
  isEmptyOrWhitespace: boolean
  lineNumber: number
}

export interface Uri {
  fsPath: string
  toString(): string
}

export const Uri = {
  file: (path: string): Uri => ({
    fsPath: path,
    toString: () => path
  })
}

export interface TextDocument {
  uri: Uri
  languageId: string
  lineCount: number
  getText(range?: Range): string
  lineAt(line: number | Position): TextLine
  save(): Promise<boolean>
}

export function createFakeDocument(
  text: string,
  fsPath: string,
  languageId: string
): TextDocument {
  const lines = text.split("\n")
  return {
    uri: Uri.file(fsPath),
    languageId,
    lineCount: lines.length,
    getText(range?: Range): string {
      if (!range) return text
      const startLine = range.start.line
      const endLine = range.end.line
      const startChar = range.start.character
      const endChar = range.end.character
      if (startLine === endLine) {
        return (lines[startLine] || "").slice(startChar, endChar)
      }
      const parts = [(lines[startLine] || "").slice(startChar)]
      for (let i = startLine + 1; i < endLine; i++) parts.push(lines[i])
      parts.push((lines[endLine] || "").slice(0, endChar))
      return parts.join("\n")
    },
    lineAt(line: number | Position): TextLine {
      const lineNumber = typeof line === "number" ? line : line.line
      const text = lines[lineNumber] || ""
      const start = new Position(lineNumber, 0)
      const end = new Position(lineNumber, text.length)
      return {
        text,
        range: new Range(start, end),
        rangeIncludingLineBreak: new Range(start, new Position(lineNumber + 1, 0)),
        firstNonWhitespaceCharacterIndex: text.length - text.trimStart().length,
        isEmptyOrWhitespace: text.trim().length === 0,
        lineNumber
      }
    },
    save: () => Promise.resolve(true)
  }
}

export interface TextEditor {
  document: TextDocument
  selection: { active: Position }
}

export function createFakeEditor(
  document: TextDocument,
  cursor: Position
): TextEditor {
  return { document, selection: { active: cursor } }
}

// no-op stubs for window/workspace/commands (eval doesn't drive real VS Code IO)
export const window = {
  activeTextEditor: undefined as TextEditor | undefined,
  showInformationMessage: () => undefined,
  createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} })
}

export const workspace = {
  getConfiguration: () => ({
    get: () => undefined,
    update: () => Promise.resolve()
  }),
  textDocuments: [] as TextDocument[],
  workspaceFolders: undefined as unknown
}

export const commands = {
  registerCommand: () => ({ dispose() {} }),
  executeCommand: () => Promise.resolve()
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

export enum InlineCompletionTriggerKind {
  Invoke = 0,
  Automatic = 1
}

export type InlineCompletionItem = unknown
