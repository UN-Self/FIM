import {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEFAULT_PROVIDER_FORM_VALUES
} from "./constants/providers"

export interface ProviderUrlFields {
  apiHostname?: string
  apiPath?: string
  apiPort?: number
  apiProtocol?: string
}

export function buildProviderBaseUrl(provider: ProviderUrlFields): string {
  const protocol =
    provider.apiProtocol || DEFAULT_PROVIDER_FORM_VALUES.apiProtocol
  const hostname =
    provider.apiHostname || DEFAULT_PROVIDER_FORM_VALUES.apiHostname
  const port = provider.apiPort ? `:${provider.apiPort}` : ""
  const path = provider.apiPath || DEFAULT_PROVIDER_FORM_VALUES.apiPath

  return `${protocol}://${hostname}${port}${path}`
}

export function parseProviderBaseUrl(baseUrl?: string): ProviderUrlFields {
  try {
    return getProviderUrlFields(new URL(baseUrl || DEEPSEEK_DEFAULT_BASE_URL))
  } catch {
    return getProviderUrlFields(new URL(DEEPSEEK_DEFAULT_BASE_URL))
  }
}

function getProviderUrlFields(url: URL): ProviderUrlFields {
  return {
    apiHostname: url.hostname,
    apiPath: `${url.pathname}${url.search}`,
    apiPort: url.port ? Number(url.port) : undefined,
    apiProtocol: url.protocol.replace(":", "")
  }
}
