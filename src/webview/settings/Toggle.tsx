import styles from "../styles/settings-view.module.css"

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

export const Toggle = ({ checked, onChange }: ToggleProps) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}
      onClick={() => onChange(!checked)}
    />
  )
}
