import React from "react"
import { useTranslation } from "react-i18next"
import {
  VSCodeButton,
  VSCodeDivider,
  VSCodePanelView,
  VSCodeTextField
} from "@vscode/webview-ui-toolkit/react"

import {
  buildProviderBaseUrl,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEFAULT_PROVIDER_FORM_VALUES,
  EVENT_NAME,
  parseProviderBaseUrl,
  PROVIDER_EVENT_NAME
} from "../common/constants"
import { FimProvider } from "../extension/provider-manager"

import { useProviders } from "./hooks/useProviders"

import styles from "./styles/providers.module.css"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const global = globalThis as any
export const Providers = () => {
  const { t } = useTranslation()
  const {
    fimProvider,
    saveProvider,
    updateProvider
  } = useProviders()

  return (
    <div>
      <h3>DeepSeek</h3>
      <VSCodePanelView>
        <div className={styles.backHeader}>
          <VSCodeButton appearance="secondary" onClick={() => {
            global.vscode.postMessage({
              type: EVENT_NAME.fimSetTab,
              data: "settings"
            })
          }}>
            <i className="codicon codicon-arrow-left" />
            {t("back-to-settings")}
          </VSCodeButton>
        </div>
        <ProviderForm
          provider={fimProvider || undefined}
          saveProvider={saveProvider}
          updateProvider={updateProvider}
        />
      </VSCodePanelView>
    </div>
  )
}

interface ProviderFormProps {
  provider?: FimProvider
  saveProvider: (provider: FimProvider) => void
  updateProvider: (provider: FimProvider) => void
}

function ProviderForm({
  provider,
  saveProvider,
  updateProvider
}: ProviderFormProps) {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = React.useState<string>(provider?.apiKey || "")
  const [baseUrl, setBaseUrl] = React.useState<string>(
    getProviderBaseUrl(provider || DEFAULT_PROVIDER_FORM_VALUES)
  )
  const [testStatus, setTestStatus] = React.useState<string | null>(null)

  React.useEffect(() => {
    const nextProvider = provider || DEFAULT_PROVIDER_FORM_VALUES
    setApiKey(nextProvider.apiKey || "")
    setBaseUrl(getProviderBaseUrl(nextProvider))
  }, [provider])

  React.useEffect(() => {
    const listener = (event: MessageEvent) => {
      const message = event.data
      if (message.type === PROVIDER_EVENT_NAME.testProviderResult) {
        if (message.data.success) {
          setTestStatus(t("provider-test-successful"))
        } else {
          setTestStatus(`${t("provider-test-failed")}: ${message.data.error || t("unknown-error")}`)
        }
      }
    }
    window.addEventListener("message", listener)
    return () => {
      window.removeEventListener("message", listener)
    }
  }, [t])

  const handleTestProvider = () => {
    setTestStatus("Testing...")
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.testProvider,
      data: getProviderFromBaseUrl(getFormProvider(), baseUrl)
    })
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const provider = getProviderFromBaseUrl(getFormProvider(), baseUrl)

    if (provider.id) {
      updateProvider(provider)
    } else {
      saveProvider(provider)
    }
  }

  const getFormProvider = (): FimProvider => ({
    ...DEFAULT_PROVIDER_FORM_VALUES,
    ...provider,
    apiKey
  })

  return (
    <>
      <VSCodeDivider />
      <form onSubmit={handleSubmit} className={styles.providerForm}>
        <div>
          <div>
            <label htmlFor="baseUrl">BaseURL</label>
          </div>
          <VSCodeTextField
            name="baseUrl"
            onChange={(event) => {
              const target = event.target as HTMLInputElement
              setBaseUrl(target.value.trim())
            }}
            value={baseUrl}
            placeholder={DEEPSEEK_DEFAULT_BASE_URL}
          ></VSCodeTextField>
        </div>

        <div>
          <div>
            <label htmlFor="apiKey">APIKey</label>
          </div>
          <VSCodeTextField
            onChange={(event) => {
              const target = event.target as HTMLInputElement
              setApiKey(target.value.trim())
            }}
            name="apiKey"
            value={apiKey}
            placeholder={t("api-key-placeholder")}
          ></VSCodeTextField>
        </div>

        <div className={styles.providerFormButtons}>
          <VSCodeButton appearance="primary" type="submit">
            {t("save")}
          </VSCodeButton>
          <VSCodeButton appearance="secondary" onClick={handleTestProvider}>
            {t("test-provider")}
          </VSCodeButton>
        </div>
        {testStatus && <p className={styles.testStatus}>{testStatus}</p>}
      </form>
    </>
  )
}

function getProviderBaseUrl(provider: Partial<FimProvider>): string {
  return buildProviderBaseUrl(provider)
}

function getProviderFromBaseUrl(
  provider: FimProvider,
  baseUrl: string
): FimProvider {
  return {
    ...provider,
    ...parseProviderBaseUrl(baseUrl)
  }
}
