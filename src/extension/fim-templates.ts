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

const getRepositoryContext = (
  repo: string,
  files: RepositoryLevelData[]
) => {
  const fileContexts = files.map((file) => {
    return `File: ${file.name}\n${file.text}`
  })

  return [`Repository: ${repo}`, ...fileContexts].join("\n\n")
}

// Split-only: DeepSeek FIM adds the special tokens server-side from the
// raw prefix (prompt) + suffix pair. fileContext and heading describe text
// before the cursor, so they stay on the prompt side.
export const getFimSplitPrompt = ({
  context,
  header,
  fileContextEnabled,
  prefixSuffix,
  language
}: FimPromptTemplate): { prompt: string; suffix: string } => {
  const { prefix, suffix } = prefixSuffix
  const { fileContext, heading } = getFileContext(
    fileContextEnabled,
    context,
    language,
    header
  )
  return {
    prompt: `${fileContext}\n${heading}${prefix}`,
    suffix
  }
}

export const getStopWords = (_fimModel: string, _format: string) => {
  void _fimModel
  void _format
  return STOP_DEEPSEEK
}

export const getFimSplitPromptRepositoryLevel = (
  repo: string,
  code: RepositoryLevelData[],
  prefixSuffix: PrefixSuffix,
  currentFileName: string | undefined
): { prompt: string; suffix: string } => {
  return getFimSplitPrompt({
    context: getRepositoryContext(repo, code),
    header: currentFileName ? `File: ${currentFileName}\n` : "",
    fileContextEnabled: true,
    prefixSuffix,
    language: undefined
  })
}
