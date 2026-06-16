import { useTranslation } from "react-i18next"

import {
  getConfigKey,
  getSettingsByGroup,
  SETTING_GROUPS} from "../../common/settings-schema"
import { useFimConfig } from "../hooks/useFimConfig"

import { AccordionSection } from "./AccordionSection"
import { MasterBar } from "./MasterBar"
import { SettingRow } from "./SettingRow"

import styles from "../styles/settings-view.module.css"

export const SettingsView = () => {
  const { t } = useTranslation()
  const { config, loaded, update } = useFimConfig()

  const enabled = Boolean(config.enabled)

  return (
    <div className={styles.panel}>
      <MasterBar
        enabled={enabled}
        onToggleEnabled={(next) => update("enabled", next)}
      />
      <div className={styles.sectionLabel}>{t("settings.sectionLabel")}</div>
      {SETTING_GROUPS.filter((g) => g.id !== "templates").map((group) => (
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
                value={config[getConfigKey(def)]}
                onUpdate={update}
              />
            ))}
          </div>
        </AccordionSection>
      ))}
      {!loaded && <div className={styles.loading}>{t("settings.loading")}</div>}
    </div>
  )
}
