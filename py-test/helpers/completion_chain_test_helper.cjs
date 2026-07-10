require("./vscode_intercept.cjs")
const vscode = require("vscode")
const { getFimPrompt, getStopWords } = require("./out/fim-templates.test.js")
const { CompletionFormatter } = require("./out/completion-formatter.test.js")
const { getPrefixSuffix } = require("./out/utils.test.js")

function buildPromptAndRequest(params) {
  const { provider, prefixSuffix, language, contextLength, config } = params

  const fimModel = provider.modelName || "codellama:7b"
  const fimTemplate = provider.fimTemplate || "codellama"

  const promptArgs = {
    context: "",
    header: "",
    fileContextEnabled: false,
    prefixSuffix: prefixSuffix,
    language: language,
  }

  const prompt = getFimPrompt(fimModel, fimTemplate, promptArgs)
  const stopWords = getStopWords(fimModel, fimTemplate)

  const body = {
    max_tokens: config.numPredictFim || 128,
    model: fimModel,
    prompt,
    stream: true,
    temperature: config.temperature || 0.2,
  }

  return { prompt, stopWords, body }
}

function simulateOnData(params) {
  const { chunks, stopWords } = params
  let completion = ""
  let chunkCount = 0

  for (const chunk of chunks) {
    const text = chunk.response || chunk.content ||
      (chunk.choices && chunk.choices[0] && chunk.choices[0].text) || ""
    completion += text
    chunkCount++

    for (const stop of stopWords) {
      if (completion.includes(stop)) {
        completion = completion.split(stop)[0]
        return { completion, chunkCount, stopped: "stop_word" }
      }
    }
  }

  return { completion, chunkCount, stopped: null }
}

function formatCompletion(params) {
  const { completion, documentContent, cursorPosition, language } = params
  const doc = new vscode.TextDocument(documentContent, language || "javascript")
  const editor = new vscode.TextEditor(doc)
  const pos = new vscode.Position(cursorPosition.line, cursorPosition.character)
  editor.selection = new vscode.Selection(pos, pos)
  const formatter = new CompletionFormatter(editor)
  return formatter.format(completion)
}

function runCompletionChain(params) {
  const { documentContent, cursorPosition, language, provider, mockChunks, contextLength, config } = params

  const doc = new vscode.TextDocument(documentContent, language)
  const pos = new vscode.Position(cursorPosition.line, cursorPosition.character)

  const prefixSuffix = getPrefixSuffix(contextLength || 100, doc, pos, [0.85, 0.15])

  const { prompt, stopWords, body } = buildPromptAndRequest({
    provider,
    prefixSuffix,
    language,
    contextLength,
    config: config || {},
  })

  const { completion, chunkCount, stopped } = simulateOnData({
    chunks: mockChunks,
    stopWords,
  })

  const formatted = formatCompletion({
    completion,
    documentContent,
    cursorPosition,
    language,
  })

  return {
    prompt,
    body,
    rawCompletion: completion,
    formattedCompletion: formatted,
    chunkCount,
    stopped,
    prefixSuffix,
  }
}

module.exports = { runCompletionChain, buildPromptAndRequest, simulateOnData, formatCompletion }
