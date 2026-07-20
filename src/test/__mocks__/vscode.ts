// Minimal vscode mock for pure-function tests.
// Only surface the types/values that source modules actually import at the top level.

export enum InlineCompletionTriggerKind {
  Automatic = 1,
  Explicit = 2
}

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3
}

export class Position {
  constructor(
    public line: number,
    public character: number
  ) {}

  static isPosition(_thing: unknown): _thing is Position {
    return false
  }
}

export class Range {
  constructor(
    public start: Position,
    public end: Position
  ) {}
}

function createOutputChannel(_name: string) {
  return {
    appendLine: (_msg: string) => {},
    append: (_msg: string) => {},
    clear: () => {},
    dispose: () => {},
    hide: () => {},
    name: "mock",
    replace: (_msg: string) => {},
    show: () => {}
  }
}

export const window = {
  activeTextEditor: undefined as unknown,
  activeColorTheme: undefined as unknown,
  terminals: [] as unknown[],
  createTerminal: () => ({} as unknown),
  createOutputChannel,
  showInformationMessage: () => undefined,
  showErrorMessage: () => undefined
} as const

export const workspace = {
  workspaceFolders: undefined as unknown,
  getConfiguration: () => ({
    get: <T>(_key: string, _default?: T): T | undefined => undefined
  })
} as const

export const commands = {
  executeCommand: () => undefined
} as const

export class EventEmitter<T> {
  event = (_listener: (e: T) => unknown) => ({ dispose: () => {} })
  fire = (_e: T) => {}
}

export const Uri = {
  parse: (_value: string) => ({}) as unknown,
  file: (_path: string) => ({}) as unknown,
  from: (_components: unknown) => ({}) as unknown
} as const

export const EndOfLine = {
  LF: 1,
  CRLF: 2
} as const

export class CancellationTokenSource {
  token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) }
  cancel() {}
  dispose() {}
}

export class Tab {
  input = {}
}

export class TextDocument {
  uri = {}
  fileName = ""
  languageId = "plaintext"
  lineCount = 0
  lineAt(_line: number) {
    return { text: "", range: new Range(new Position(0, 0), new Position(0, 0)) }
  }
  getText(_range?: Range) { return "" }
  positionAt(_offset: number) { return new Position(0, 0) }
  offsetAt(_position: Position) { return 0 }
}

export class ThemeColor {
  constructor(_id: string) {}
}

export class StatusBarItem {
  text = ""
  show() {}
  hide() {}
  dispose() {}
}

export const StatusBarAlignment = {
  Left: 1,
  Right: 2
}

// Default export for modules that use `import * as vscode from "vscode"`
export default {
  InlineCompletionTriggerKind,
  ColorThemeKind,
  Position,
  Range,
  window,
  workspace,
  commands,
  EventEmitter,
  Uri,
  EndOfLine,
  CancellationTokenSource,
  Tab,
  TextDocument,
  ThemeColor,
  StatusBarItem,
  StatusBarAlignment
}
