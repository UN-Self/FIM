import {
  STOP_DEEPSEEK
} from "../common/constants"
import { supportedLanguages } from "../common/languages"
import {
  FimPromptTemplate,
  PrefixSuffix,
  RepositoryLevelData
} from "../common/types"

const getFileContext = (
  fileContextEnabled: boolean,
  context: string,
  language: string | undefined,
  header: string
) => {
  const languageId =
    supportedLanguages[language as keyof typeof supportedLanguages]
  const fileContext = fileContextEnabled
    ? `${languageId?.syntaxComments?.start || ""}${context}${
        languageId?.syntaxComments?.end || ""
      }`
    : ""
  return { heading: header ?? "", fileContext }
}

const getFimPromptTemplateDeepseek = ({
  context,
  header,
  fileContextEnabled,
  prefixSuffix,
  language
}: FimPromptTemplate) => {
  const { prefix, suffix } = prefixSuffix
  const { fileContext, heading } = getFileContext(
    fileContextEnabled,
    context,
    language,
    header
  )
  return `<｜fim▁begin｜>${fileContext}\n${heading}${prefix}<｜fim▁hole｜>${suffix}<｜fim▁end｜>`
}

const getRepositoryContext = (
  repo: string,
  files: RepositoryLevelData[]
) => {
  const fileContexts = files.map((file) => {
    return `File: ${file.name}\n${file.text}`
  })

  return [`Repository: ${repo}`, ...fileContexts].join("\n\n")
}

export const getDefaultFimPromptTemplate = (args: FimPromptTemplate) =>
  getFimPromptTemplateDeepseek(args)

export const getFimPrompt = (
  _fimModel: string,
  _format: string,
  args: FimPromptTemplate
) => {
  void _fimModel
  void _format
  return getFimPromptTemplateDeepseek(args)
}

export const getStopWordsAuto = (_fimModel: string) => {
  void _fimModel
  return STOP_DEEPSEEK
}

export const getStopWordsChosen = (_format: string) => {
  void _format
  return STOP_DEEPSEEK
}

export const getStopWords = (_fimModel: string, _format: string) => {
  void _fimModel
  void _format
  return STOP_DEEPSEEK
}

export const getFimTemplateRepositoryLevel = (
  repo: string,
  code: RepositoryLevelData[],
  prefixSuffix: PrefixSuffix,
  currentFileName: string | undefined
) => {
  return getFimPromptTemplateDeepseek({
    context: getRepositoryContext(repo, code),
    header: currentFileName ? `File: ${currentFileName}\n` : "",
    fileContextEnabled: true,
    prefixSuffix,
    language: undefined
  })
}
