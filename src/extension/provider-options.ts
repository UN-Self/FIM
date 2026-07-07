import { API_PROVIDERS, USER } from "../common/constants"
import {
  RequestBodyBase,
  RequestOptionsOllama,
  StreamBodyOpenAI,
} from "../common/types"

export function createStreamRequestBodyFim(
  provider: string,
  prompt: string,
  options: {
    temperature: number
    numPredictFim: number
    model: string
  }
): RequestBodyBase | RequestOptionsOllama | StreamBodyOpenAI {
  switch (provider) {
    case API_PROVIDERS.OpenAICompatible:
    case API_PROVIDERS.OpenWebUI:
    case API_PROVIDERS.Ollama:
      return {
        model: options.model,
        prompt,
        stream: true,
        options: {
          temperature: options.temperature,
          num_predict: options.numPredictFim,
        },
      }
    case API_PROVIDERS.LMStudio:
    case API_PROVIDERS.Deepseek:
      return {
        model: options.model,
        prompt,
        stream: true,
        temperature: options.temperature,
        max_tokens: options.numPredictFim,
      }
    case API_PROVIDERS.LlamaCpp:
    case API_PROVIDERS.Oobabooga:
      return {
        prompt,
        stream: true,
        temperature: options.temperature,
        max_tokens: options.numPredictFim,
      }
    case API_PROVIDERS.LiteLLM:
      return {
        messages: [{ content: prompt, role: USER }],
        model: options.model,
        stream: true,
        max_tokens: options.numPredictFim,
        temperature: options.temperature,
      }
    default:
      return {
        prompt,
        stream: true,
        temperature: options.temperature,
        n_predict: options.numPredictFim,
      }
  }
}
