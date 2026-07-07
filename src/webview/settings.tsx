import { SettingsView } from "./settings/SettingsView"

import styles from "./styles/settings.module.css"

export const Settings = () => {
  return (
    <div className={styles.settingsContainer}>
      <SettingsView />
    </div>
  )
}
