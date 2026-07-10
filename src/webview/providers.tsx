import React from "react"
import { useTranslation } from "react-i18next"
import {
  VSCodeButton,
  VSCodeDivider,
  VSCodePanelView,
  VSCodeTextField
} from "@vscode/webview-ui-toolkit/react"

import {
  DEEPSEEK_DEFAULT_BASE_URL,
  EVENT_NAME,
  PROVIDER_EVENT_NAME
} from "../common/constants"
import type { FimProvider } from "../common/deepseek"

import { useProviders } from "./hooks/useProviders"
import {
  buildDeepSeekProviderFromForm,
  getDeepSeekProviderFormState
} from "./provider-form"

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
  const initialFormState = getDeepSeekProviderFormState(provider)
  const [modelName, setModelName] = React.useState<string>(
    initialFormState.modelName
  )
  const [apiKey, setApiKey] = React.useState<string>(
    initialFormState.apiKey
  )
  const [baseUrl, setBaseUrl] = React.useState<string>(
    initialFormState.baseUrl
  )
  const [testStatus, setTestStatus] = React.useState<string | null>(null)

  React.useEffect(() => {
    const nextFormState = getDeepSeekProviderFormState(provider)
    setModelName(nextFormState.modelName)
    setApiKey(nextFormState.apiKey)
    setBaseUrl(nextFormState.baseUrl)
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
      data: buildDeepSeekProviderFromForm(provider, {
        apiKey,
        baseUrl,
        modelName
      })
    })
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const nextProvider = buildDeepSeekProviderFromForm(provider, {
      apiKey,
      baseUrl,
      modelName
    })

    if (nextProvider.id) {
      updateProvider(nextProvider)
    } else {
      saveProvider(nextProvider)
    }
  }

  return (
    <>
      <VSCodeDivider />
      <form onSubmit={handleSubmit} className={styles.providerForm}>
        <div>
          <div>
            <label htmlFor="modelName">Model</label>
          </div>
          <VSCodeTextField
            name="modelName"
            onChange={(event) => {
              const target = event.target as HTMLInputElement
              setModelName(target.value.trim())
            }}
            value={modelName}
            placeholder="deepseek-chat"
          ></VSCodeTextField>
        </div>

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
