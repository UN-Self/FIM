import { useTranslation } from "react-i18next"
import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

import { EVENT_NAME } from "../../common/constants"
import { useProviders } from "../hooks/useProviders"

import { Toggle } from "./Toggle"

import styles from "../styles/settings-view.module.css"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const global = globalThis as any

interface MasterBarProps {
  enabled: boolean
  error?: string
  onToggleEnabled: (enabled: boolean) => void
}

export const MasterBar = ({
  enabled,
  error,
  onToggleEnabled
}: MasterBarProps) => {
  const { t } = useTranslation()
  const {
    fimProvider,
    setActiveFimProvider,
    getProvidersByType,
    loaded
  } = useProviders()
  const fimProviders = Object.values(getProvidersByType("fim"))

  const goToProviders = () => {
    global.vscode.postMessage({
      type: EVENT_NAME.fimSetTab,
      data: "providers"
    })
  }

  const handleProviderChange = (e: unknown) => {
    const id = (e as React.ChangeEvent<HTMLSelectElement>).target.value
    const selected = fimProviders.find((p) => p.id === id)
    if (selected) setActiveFimProvider(selected)
  }

  return (
    <div className={`${styles.masterBar} ${enabled ? "" : styles.masterBarOff}`}>
      <div className={styles.masterLeft}>
        <span className={styles.masterDot} />
        <div className={styles.masterDetails}>
          <div className={styles.masterName}>FIM</div>
          {!loaded ? (
            <div className={styles.masterLoading}>{t("settings.loading")}</div>
          ) : fimProviders.length > 0 ? (
            <VSCodeDropdown
              className={styles.masterSelect}
              value={fimProvider?.id || ""}
              onChange={handleProviderChange}
            >
              {fimProviders.map((p) => (
                <VSCodeOption key={p.id} value={p.id}>
                  {p.label} · {p.modelName}
                </VSCodeOption>
              ))}
            </VSCodeDropdown>
          ) : (
            <button type="button" className={styles.masterMetaButton} onClick={goToProviders}>
              {t("settings.masterBar.noProvider")}
            </button>
          )}
          <button
            type="button"
            className={styles.manageProviderButton}
            onClick={goToProviders}
          >
            <i className="codicon codicon-settings-gear" />
            {t("settings.masterBar.configureProvider")}
          </button>
          {error && <div className={styles.masterError}>{error}</div>}
        </div>
      </div>
      <Toggle
        checked={enabled}
        onChange={onToggleEnabled}
      />
    </div>
  )
}
