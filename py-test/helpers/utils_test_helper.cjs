require("./vscode_intercept.cjs")
const vscode = require("vscode")
const utils = require("./out/utils.test.js")

function getPrefixSuffix(params) {
  const { numLines, content, position, contextRatio } = params
  const doc = new vscode.TextDocument(content, "javascript")
  const pos = new vscode.Position(position.line, position.character)
  return utils.getPrefixSuffix(numLines, doc, pos, contextRatio || [0.85, 0.15])
}

function getIsMiddleOfString(params) {
  const { content, cursorPosition, charBefore, charAfter } = params
  if (content !== undefined && cursorPosition !== undefined) {
    const doc = new vscode.TextDocument(content, "javascript")
    const editor = new vscode.TextEditor(doc)
    const pos = new vscode.Position(cursorPosition.line, cursorPosition.character)
    editor.selection = new vscode.Selection(pos, pos)
    vscode.window.activeTextEditor = editor
  }
  return utils.getIsMiddleOfString()
}

module.exports = { getPrefixSuffix, getIsMiddleOfString }
