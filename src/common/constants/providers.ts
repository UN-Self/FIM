export const OPEN_AI_COMPATIBLE_PROVIDERS = {
  LiteLLM: "litellm",
  Deepseek: "deepseek",
  LMStudio: "lmstudio",
  Oobabooga: "oobabooga",
  OpenWebUI: "openwebui",
  Ollama: "ollama",
  Fim: "fim",
  OpenAICompatible: "openai-compatible"
}

export const API_PROVIDERS = {
  Anthropic: "anthropic",
  OpenAI: "openai",
  Mistral: "mistral",
  LlamaCpp: "llamacpp",
  Groq: "groq",
  OpenRouter: "openrouter",
  Cohere: "cohere",
  Perplexity: "perplexity",
  Gemini: "gemini",
  ...OPEN_AI_COMPATIBLE_PROVIDERS
}

export const DEEPSEEK_DEFAULT_BASE_URL =
  "https://api.deepseek.com/beta/completions"

export const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat"

export const DEFAULT_PROVIDER_FORM_VALUES = {
  apiHostname: "api.deepseek.com",
  apiKey: "",
  apiPath: "/beta/completions",
  apiProtocol: "https",
  id: "deepseek-default",
  label: "DeepSeek",
  modelName: DEEPSEEK_DEFAULT_MODEL,
  name: "DeepSeek",
  provider: API_PROVIDERS.Deepseek,
  type: "fim"
}
