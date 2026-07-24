import React from "react"
import { useTranslation } from "react-i18next"
import { TextFieldType } from "@vscode/webview-ui-toolkit"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

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

interface Feedback {
  kind: "error" | "loading" | "success"
  message: string
}

export const Providers = () => {
  const { t } = useTranslation()
  const { fimProvider, updateProvider } = useProviders()

  const goBack = () => {
    global.vscode.postMessage({
      type: EVENT_NAME.fimSetTab,
      data: "settings"
    })
  }

  return (
    <main className={styles.page}>
      <button type="button" className={styles.backButton} onClick={goBack}>
        <i className="codicon codicon-arrow-left" />
        {t("back-to-settings")}
      </button>

      <header className={styles.providerHero}>
        <div className={styles.providerMark} aria-hidden="true">
          <i className="codicon codicon-code" />
        </div>
        <div className={styles.providerIdentity}>
          <div className={styles.providerTitleRow}>
            <h2>DeepSeek</h2>
            <span className={styles.providerBadge}>FIM</span>
          </div>
          <p>{t("provider.config.subtitle")}</p>
        </div>
      </header>

      <ProviderForm
        provider={fimProvider || undefined}
        updateProvider={updateProvider}
      />
    </main>
  )
}

interface ProviderFormProps {
  provider?: FimProvider
  updateProvider: (provider: FimProvider) => void
}

function ProviderForm({ provider, updateProvider }: ProviderFormProps) {
  const { t } = useTranslation()
  const initialFormState = getDeepSeekProviderFormState(provider)
  const [modelName, setModelName] = React.useState(initialFormState.modelName)
  const [apiKey, setApiKey] = React.useState(initialFormState.apiKey)
  const [baseUrl, setBaseUrl] = React.useState(initialFormState.baseUrl)
  const [feedback, setFeedback] = React.useState<Feedback | null>(null)

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
        setFeedback({
          kind: message.data.success ? "success" : "error",
          message: message.data.success
            ? t("provider-test-successful")
            : `${t("provider-test-failed")}: ${
                message.data.error || t("unknown-error")
              }`
        })
      }
      if (message.type === PROVIDER_EVENT_NAME.updateProviderResult) {
        setFeedback({
          kind: message.data.success ? "success" : "error",
          message: message.data.success
            ? t("provider.config.saved")
            : `${t("provider.config.saveFailed")}: ${
                message.data.error || t("unknown-error")
              }`
        })
      }
    }
    window.addEventListener("message", listener)
    return () => window.removeEventListener("message", listener)
  }, [t])

  const currentProvider = () =>
    buildDeepSeekProviderFromForm(provider, {
      apiKey,
      baseUrl,
      modelName
    })

  const handleTestProvider = () => {
    setFeedback({ kind: "loading", message: t("provider.config.testing") })
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.testProvider,
      data: currentProvider()
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback({ kind: "loading", message: t("provider.config.saving") })
    updateProvider(currentProvider())
  }

  const busy = feedback?.kind === "loading"

  return (
    <form onSubmit={handleSubmit} className={styles.providerForm}>
      <section className={styles.formCard}>
        <div className={styles.sectionHeading}>
          <i className="codicon codicon-plug" />
          <div>
            <h3>{t("provider.config.connectionTitle")}</h3>
            <p>{t("provider.config.connectionDesc")}</p>
          </div>
        </div>

        <div className={styles.fieldList}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("provider.config.model")}</span>
            <span className={styles.fieldDescription}>
              {t("provider.config.modelDesc")}
            </span>
            <VSCodeTextField
              disabled={busy}
              name="modelName"
              required
              value={modelName}
              placeholder="deepseek-v4-flash"
              onInput={(event) => {
                setModelName((event.target as HTMLInputElement).value)
              }}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("provider.config.endpoint")}</span>
            <span className={styles.fieldDescription}>
              {t("provider.config.endpointDesc")}
            </span>
            <VSCodeTextField
              disabled={busy}
              name="baseUrl"
              required
              value={baseUrl}
              placeholder={DEEPSEEK_DEFAULT_BASE_URL}
              onInput={(event) => {
                setBaseUrl((event.target as HTMLInputElement).value)
              }}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("provider.config.apiKey")}</span>
            <span className={styles.fieldDescription}>
              {t("provider.config.apiKeyDesc")}
            </span>
            <VSCodeTextField
              disabled={busy}
              name="apiKey"
              type={TextFieldType.password}
              value={apiKey}
              placeholder={t("api-key-placeholder")}
              onInput={(event) => {
                setApiKey((event.target as HTMLInputElement).value)
              }}
            />
          </label>
        </div>
      </section>

      <div className={styles.formFooter}>
        {feedback && (
          <div
            className={`${styles.feedback} ${styles[feedback.kind]}`}
            role="status"
          >
            <i
              className={`codicon codicon-${
                feedback.kind === "success"
                  ? "check"
                  : feedback.kind === "error"
                    ? "error"
                    : "loading"
              }`}
            />
            <span>{feedback.message}</span>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={handleTestProvider}
          >
            <i className="codicon codicon-debug-start" />
            {t("provider.config.test")}
          </button>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={busy}
          >
            <i className="codicon codicon-save" />
            {t("provider.config.save")}
          </button>
        </div>
      </div>
    </form>
  )
}
