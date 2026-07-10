import {
  API_PROVIDERS,
  buildProviderBaseUrl,
  DEFAULT_PROVIDER_FORM_VALUES,
  parseProviderBaseUrl
} from "../common/constants"
import type { FimProvider } from "../common/deepseek"

export interface DeepSeekProviderFormState {
  apiKey: string
  baseUrl: string
  modelName: string
}

export function getDeepSeekProviderFormState(
  provider?: Partial<FimProvider>
): DeepSeekProviderFormState {
  const nextProvider = {
    ...DEFAULT_PROVIDER_FORM_VALUES,
    ...provider
  }

  return {
    apiKey: nextProvider.apiKey || "",
    baseUrl: buildProviderBaseUrl(nextProvider),
    modelName: nextProvider.modelName || DEFAULT_PROVIDER_FORM_VALUES.modelName
  }
}

export function buildDeepSeekProviderFromForm(
  provider: Partial<FimProvider> | undefined,
  formState: DeepSeekProviderFormState
): FimProvider {
  return {
    ...DEFAULT_PROVIDER_FORM_VALUES,
    ...provider,
    ...parseProviderBaseUrl(formState.baseUrl.trim()),
    apiKey: formState.apiKey.trim(),
    label: "DeepSeek",
    modelName:
      formState.modelName.trim() || DEFAULT_PROVIDER_FORM_VALUES.modelName,
    provider: API_PROVIDERS.Deepseek,
    type: "fim"
  } as FimProvider
}
