import React, { useState } from "react"
import { useTranslation } from "react-i18next"

import styles from "../styles/settings-view.module.css"

interface AccordionSectionProps {
  icon: string // codicon name e.g. "zap"
  titleKey: string // i18n key
  defaultOpen?: boolean
  children: React.ReactNode
}

export const AccordionSection = ({
  icon,
  titleKey,
  defaultOpen = false,
  children
}: AccordionSectionProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`${styles.group} ${open ? styles.groupOpen : ""}`}>
      <button
        type="button"
        className={styles.groupHead}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.groupTitle}>
          <i className={`codicon codicon-${icon}`} />
          <span>{t(titleKey)}</span>
        </span>
        <i className={`codicon codicon-chevron-right ${styles.groupChevron}`} />
      </button>
      {open && <div className={styles.groupBody}>{children}</div>}
    </div>
  )
}
