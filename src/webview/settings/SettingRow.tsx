import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  VSCodeDropdown,
  VSCodeOption
} from "@vscode/webview-ui-toolkit/react"

import {
  coerceValue,
  getConfigKey,
  parseNumberValue,
  SettingDef
} from "../../common/settings-schema"

import { Toggle } from "./Toggle"

import styles from "../styles/settings-view.module.css"

interface SettingRowProps {
  def: SettingDef
  error?: string
  value: unknown
  onUpdate: (bareKey: string, value: unknown) => void
}

export const SettingRow = ({
  def,
  error,
  value,
  onUpdate
}: SettingRowProps) => {
  const { t } = useTranslation()
  const bareKey = getConfigKey(def)
  const [draft, setDraft] = useState(String(value ?? ""))
  const [draftError, setDraftError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(String(value ?? ""))
  }, [value])

  const commitNumber = () => {
    setEditing(false)
    const next = parseNumberValue(draft)
    if (next === undefined) {
      setDraftError(t("settings.number.invalid"))
      return
    }
    setDraftError(null)
    setDraft(String(next))
    onUpdate(bareKey, next)
  }

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
          <input
            aria-invalid={Boolean(error || draftError)}
            className={styles.numberField}
            inputMode="decimal"
            type="text"
            value={draft}
            onBlur={commitNumber}
            onInput={(event) => {
              setDraft(event.currentTarget.value)
              setDraftError(null)
            }}
            onFocus={() => {
              setEditing(true)
              setDraftError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
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
      <div className={styles.rowControl}>
        {renderControl()}
        {(error || draftError) && (
          <div className={styles.rowError}>{error || draftError}</div>
        )}
      </div>
    </div>
  )
}
