class Position {
  constructor(line, character) {
    this.line = line
    this.character = character
  }
  with() { return new Position(this.line, this.character) }
  compareTo(other) {
    if (this.line < other.line) return -1
    if (this.line > other.line) return 1
    if (this.character < other.character) return -1
    if (this.character > other.character) return 1
    return 0
  }
}

class Range {
  constructor(start, end) {
    this.start = start
    this.end = end
  }
  with() { return new Range(this.start, this.end) }
}

class Selection extends Range {
  constructor(anchor, active) {
    super(anchor, active)
    this.anchor = anchor
    this.active = active
  }
}

class TextDocument {
  constructor(content, languageId) {
    this._content = content || ""
    this._languageId = languageId || "plaintext"
    this.uri = { fsPath: "/test/file.ts", toString: () => "file:///test/file.ts" }
  }
  get languageId() { return this._languageId }
  get lineCount() { return this._content.split("\n").length }
  getText() { return this._content }
  lineAt(line) {
    const lines = this._content.split("\n")
    const text = lines[line] || ""
    return {
      text,
      range: new Range(new Position(line, 0), new Position(line, text.length)),
      rangeIncludingLineBreak: new Range(new Position(line, 0), new Position(line + 1, 0)),
      isEmptyOrWhitespace: text.trim() === "",
      firstNonWhitespaceCharacterIndex: text.length - text.trimStart().length,
    }
  }
  getWordRangeAtPosition() { return null }
  save() { return Promise.resolve(this) }
}

class TextEditor {
  constructor(document) {
    this.document = document
    this.selection = new Selection(new Position(0, 0), new Position(0, 0))
  }
}

class InlineCompletionItem {
  constructor(insertText, range, command) {
    this.insertText = insertText
    this.range = range
    this.command = command
  }
}

const InlineCompletionTriggerKind = {
  Automatic: 0,
  Invoke: 1,
}

const InlineCompletionContext = function (triggerKind) {
  this.triggerKind = triggerKind
}

class CancellationToken {
  constructor() {
    this.isCancellationRequested = false
    this.onCancellationRequested = { fire: () => {}, event: () => () => {} }
  }
}

class EventEmitter {
  constructor() { this.listeners = [] }
  fire() {}
  get event() { return () => {} }
}

const workspace = {
  getConfiguration() {
    return {
      get: (key, def) => def,
      update: () => {},
    }
  },
  workspaceFolders: [{ uri: { fsPath: "/workspace" }, name: "workspace", index: 0 }],
  name: "workspace",
  textDocuments: [],
  onDidCloseTextDocument: () => ({ dispose: () => {} }),
  onDidOpenTextDocument: () => ({ dispose: () => {} }),
  onDidChangeTextDocument: () => ({ dispose: () => {} }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
  fs: {},
}

const window = {
  activeTextEditor: undefined,
  showInformationMessage: () => {},
  showErrorMessage: () => {},
  createStatusBarItem: () => ({
    text: "", show: () => {}, hide: () => {}, dispose: () => {},
  }),
  createOutputChannel: () => ({
    appendLine: () => {},
    append: () => {},
    show: () => {},
    dispose: () => {},
  }),
  onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
  showTextDocument: async (doc) => {
    const editor = new TextEditor(doc)
    window.activeTextEditor = editor
    return editor
  },
  openTextDocument: async (options) => {
    if (typeof options === "string") return new TextDocument(options)
    if (typeof options === "object") {
      return new TextDocument(options.content || "", options.language)
    }
    return new TextDocument()
  },
}

const languages = {
  registerInlineCompletionItemProvider: () => ({ dispose: () => {} }),
  getDiagnostics: () => [],
}

const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve(),
}

const ExtensionContext = function () {
  this.subscriptions = []
  this.globalState = { get: () => undefined, update: () => Promise.resolve() }
  this.workspaceState = { get: () => undefined, update: () => Promise.resolve() }
  this.extensionUri = { fsPath: "/extension", toString: () => "file:///extension" }
  this.extensionPath = "/extension"
  this.globalStorageUri = { fsPath: "/global-storage" }
}

const StatusBarAlignment = { Left: 1, Right: 2 }
const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 }
const Uri = {
  file: (p) => ({ fsPath: p, toString: () => `file://${p}`, scheme: "file" }),
  joinPath: (base, ...parts) => ({ fsPath: base.fsPath + "/" + parts.join("/") }),
  parse: (s) => ({ fsPath: s, toString: () => s }),
}

const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 }

module.exports = {
  Position,
  Range,
  Selection,
  TextDocument,
  TextEditor,
  InlineCompletionItem,
  InlineCompletionTriggerKind,
  InlineCompletionContext,
  CancellationToken,
  EventEmitter,
  workspace,
  window,
  languages,
  commands,
  ExtensionContext,
  StatusBarAlignment,
  ConfigurationTarget,
  Uri,
  DiagnosticSeverity,
  InlineCompletionList: class { constructor(items) { this.items = items } },
  Disposable: class { constructor(fn) { this.dispose = fn } },
}
