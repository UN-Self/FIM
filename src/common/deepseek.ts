export const DEEPSEEK_PROVIDER_ID = "deepseek-default"
export const DEEPSEEK_DEFAULT_BASE_URL =
  "https://api.deepseek.com/beta/completions"
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash"

export const API_PROVIDERS = {
  Deepseek: "deepseek"
}

export interface FimProvider {
  apiHostname?: string
  apiKey?: string
  apiPath?: string
  apiPort?: number
  apiProtocol?: string
  features?: string[]
  fimTemplate?: string
  id: string
  label: string
  modelName: string
  provider: string
  repositoryLevel?: boolean
  type: string
}

export const DEFAULT_PROVIDER_FORM_VALUES: FimProvider = {
  apiHostname: "api.deepseek.com",
  apiKey: "",
  apiPath: "/beta/completions",
  apiProtocol: "https",
  id: DEEPSEEK_PROVIDER_ID,
  label: "DeepSeek",
  modelName: DEEPSEEK_DEFAULT_MODEL,
  provider: API_PROVIDERS.Deepseek,
  type: "fim"
}
