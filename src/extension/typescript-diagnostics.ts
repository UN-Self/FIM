import * as path from "path"
import * as ts from "typescript"

export interface TypeScriptValidationInput {
  fileName: string
  languageId: string
  originalText: string
  completionText: string
  offset: number
}

export interface TypeScriptValidationResult {
  checked: boolean
  valid: boolean
  newErrorCount: number
}

const supportedLanguages = new Set([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact"
])

function compilerOptions(fileName: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(path.dirname(fileName), ts.sys.fileExists)
  if (!configPath) return { allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ES2020 }

  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) return { allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ES2020 }
  return ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath)).options
}

function diagnosticKey(diagnostic: ts.Diagnostic): string {
  return `${diagnostic.code}:${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`
}

function diagnosticsForText(fileName: string, text: string, options: ts.CompilerOptions): Set<string> {
  const normalizedFileName = path.resolve(fileName)
  const host = ts.createCompilerHost(options)
  const fileExists = host.fileExists.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  const readFile = host.readFile.bind(host)
  host.fileExists = (name) => path.resolve(name) === normalizedFileName || fileExists(name)
  host.readFile = (name) => path.resolve(name) === normalizedFileName ? text : readFile(name)
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    path.resolve(name) === normalizedFileName
      ? ts.createSourceFile(name, text, languageVersion, true)
      : getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile)

  const program = ts.createProgram([normalizedFileName], options, host)
  return new Set(
    ts.getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.file && path.resolve(diagnostic.file.fileName) === normalizedFileName)
      .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
      .map(diagnosticKey)
  )
}

export function validateTypeScriptCompletion(input: TypeScriptValidationInput): TypeScriptValidationResult {
  if (!supportedLanguages.has(input.languageId) || input.offset < 0 || input.offset > input.originalText.length) {
    return { checked: false, valid: true, newErrorCount: 0 }
  }

  try {
    const options = compilerOptions(input.fileName)
    const before = diagnosticsForText(input.fileName, input.originalText, options)
    const proposed = `${input.originalText.slice(0, input.offset)}${input.completionText}${input.originalText.slice(input.offset)}`
    const after = diagnosticsForText(input.fileName, proposed, options)
    const newErrorCount = [...after].filter((diagnostic) => !before.has(diagnostic)).length
    return { checked: true, valid: newErrorCount === 0, newErrorCount }
  } catch {
    return { checked: false, valid: true, newErrorCount: 0 }
  }
}
