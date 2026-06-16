import { useTranslation } from "react-i18next"
import { TextFieldType } from "@vscode/webview-ui-toolkit"
import {
  VSCodeDropdown,
  VSCodeOption,
  VSCodeTextField
} from "@vscode/webview-ui-toolkit/react"

import { coerceValue, getConfigKey, SettingDef } from "../../common/settings-schema"

import { Toggle } from "./Toggle"

import styles from "../styles/settings-view.module.css"

interface SettingRowProps {
  def: SettingDef
  value: unknown
  onUpdate: (bareKey: string, value: unknown) => void
}

export const SettingRow = ({ def, value, onUpdate }: SettingRowProps) => {
  const { t } = useTranslation()
  const bareKey = getConfigKey(def)

  const renderControl = () => {
    if (def.type === "boolean") {
      return (
        <Toggle
          checked={Boolean(value)}
          onChange={(checked) => onUpdate(bareKey, checked)}
        />
      )
    }
    if (def.type === "number") {
      return (
        <div className={styles.numInput}>
          <VSCodeTextField
            type={TextFieldType.text}
            value={String(value ?? "")}
            onChange={(e) => {
              const raw = (e.target as HTMLInputElement).value
              onUpdate(bareKey, coerceValue(def, raw))
            }}
          />
          {def.unit && <span className={styles.unit}>{def.unit}</span>}
        </div>
      )
    }
    // select
    return (
      <VSCodeDropdown
        value={String(value ?? "")}
        onChange={(e) => {
          const raw = (e.target as HTMLSelectElement).value
          onUpdate(bareKey, coerceValue(def, raw))
        }}
      >
        {def.options?.map((opt) => (
          <VSCodeOption key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </VSCodeOption>
        ))}
      </VSCodeDropdown>
    )
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{t(def.titleKey)}</div>
        <div className={styles.rowDesc}>{t(def.descKey)}</div>
      </div>
      <div className={styles.rowControl}>{renderControl()}</div>
    </div>
  )
}
