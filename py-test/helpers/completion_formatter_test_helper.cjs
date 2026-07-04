require("./vscode_intercept.cjs")
const vscode = require("vscode")
const { CompletionFormatter } = require("./out/completion-formatter.test.js")

function formatCompletion(params) {
  const { completion, documentContent, cursorPosition, language } = params
  const doc = new vscode.TextDocument(documentContent || "", language || "javascript")
  const editor = new vscode.TextEditor(doc)
  const pos = new vscode.Position(cursorPosition.line, cursorPosition.character)
  editor.selection = new vscode.Selection(pos, pos)
  const formatter = new CompletionFormatter(editor)
  return formatter.format(completion)
}

module.exports = { formatCompletion }
