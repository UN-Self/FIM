import { useTranslation } from "react-i18next"

import {
  getConfigKey,
  getSettingsByGroup,
  SETTING_GROUPS
} from "../../common/settings-schema"
import { useFimConfig } from "../hooks/useFimConfig"

import { AccordionSection } from "./AccordionSection"
import { MasterBar } from "./MasterBar"
import { SettingRow } from "./SettingRow"

import styles from "../styles/settings-view.module.css"

export const SettingsView = () => {
  const { t } = useTranslation()
  const { config, loaded, update, updateErrors } = useFimConfig()

  const enabled = Boolean(config.enabled)

  if (!loaded) {
    return (
      <div className={styles.panel} aria-busy="true">
        <div className={styles.loadingCard}>
          <span className={styles.loadingPulse} />
          {t("settings.loading")}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <MasterBar
        enabled={enabled}
        error={updateErrors.enabled}
        onToggleEnabled={(next) => update("enabled", next)}
      />
      <div className={styles.sectionLabel}>{t("settings.sectionLabel")}</div>
      {SETTING_GROUPS.map((group) => (
        <AccordionSection
          key={group.id}
          icon={group.icon}
          titleKey={group.titleKey}
          defaultOpen={group.id === "completion"}
        >
          <div className={styles.groupInner}>
            {getSettingsByGroup(group.id).map((def) => (
              <SettingRow
                key={def.key}
                def={def}
                error={updateErrors[getConfigKey(def)]}
                value={config[getConfigKey(def)]}
                onUpdate={update}
              />
            ))}
          </div>
        </AccordionSection>
      ))}
    </div>
  )
}
