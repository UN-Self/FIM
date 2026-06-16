import { useTranslation } from "react-i18next"

import { EVENT_NAME } from "../../common/constants"
import { useProviders } from "../hooks/useProviders"

import { Toggle } from "./Toggle"

import styles from "../styles/settings-view.module.css"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const global = globalThis as any

interface MasterBarProps {
  enabled: boolean
  onToggleEnabled: (enabled: boolean) => void
}

export const MasterBar = ({ enabled, onToggleEnabled }: MasterBarProps) => {
  const { t } = useTranslation()
  const { fimProvider } = useProviders()
  const modelName = fimProvider?.modelName
  const providerLabel = fimProvider?.label

  const meta = modelName
    ? providerLabel
      ? `${modelName} · ${providerLabel}`
      : modelName
    : t("settings.masterBar.noProvider")

  const goToProviders = () => {
    global.vscode.postMessage({
      type: EVENT_NAME.fimSetTab,
      data: "providers"
    })
  }

  return (
    <div className={`${styles.masterBar} ${enabled ? "" : styles.masterBarOff}`}>
      <div className={styles.masterLeft}>
        <span className={styles.masterDot} />
        <div>
          <div className={styles.masterName}>FIM</div>
          {modelName ? (
            <div className={styles.masterMeta}>{meta}</div>
          ) : (
            <button
              type="button"
              className={styles.masterMetaButton}
              onClick={goToProviders}
            >
              {meta}
            </button>
          )}
        </div>
      </div>
      <Toggle checked={enabled} onChange={onToggleEnabled} />
    </div>
  )
}
