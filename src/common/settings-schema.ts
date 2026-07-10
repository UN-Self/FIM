export type SettingType = "boolean" | "number" | "select"
export type SettingGroupId =
  | "completion"
  | "model"
  | "context"
  | "general"

export interface SelectOption {
  value: string
  labelKey: string
}

export interface SettingDef {
  /** Full setting id, e.g. "fim.debounceWait" */
  key: string
  group: SettingGroupId
  type: SettingType
  /** i18n key for the setting title */
  titleKey: string
  /** i18n key for the setting description */
  descKey: string
  /** Display unit, e.g. "ms" or "行" */
  unit?: string
  /** Options for select type */
  options?: SelectOption[]
  min?: number
  max?: number
  step?: number
}

export interface SettingGroupDef {
  id: SettingGroupId
  /** codicon name, e.g. "zap" */
  icon: string
  titleKey: string
}

export const SETTING_GROUPS: SettingGroupDef[] = [
  { id: "completion", icon: "zap", titleKey: "settings.group.completion" },
  { id: "model", icon: "target", titleKey: "settings.group.model" },
  { id: "context", icon: "file-code", titleKey: "settings.group.context" },
  { id: "general", icon: "settings-gear", titleKey: "settings.group.general" }
]

export const SETTING_DEFS: SettingDef[] = [
  // ── completion ──
  {
    key: "fim.autoSuggestEnabled",
    group: "completion",
    type: "boolean",
    titleKey: "settings.autoSuggest.title",
    descKey: "settings.autoSuggest.desc"
  },
  {
    key: "fim.debounceWait",
    group: "completion",
    type: "number",
    unit: "ms",
    min: 0,
    max: 5000,
    step: 50,
    titleKey: "settings.debounce.title",
    descKey: "settings.debounce.desc"
  },
  {
    key: "fim.enableSubsequentCompletions",
    group: "completion",
    type: "boolean",
    titleKey: "settings.subsequent.title",
    descKey: "settings.subsequent.desc"
  },
  {
    key: "fim.multilineCompletionsEnabled",
    group: "completion",
    type: "boolean",
    titleKey: "settings.multiline.title",
    descKey: "settings.multiline.desc"
  },
  {
    key: "fim.completionCacheEnabled",
    group: "completion",
    type: "boolean",
    titleKey: "settings.cache.title",
    descKey: "settings.cache.desc"
  },
  // ── model ──
  {
    key: "fim.temperature",
    group: "model",
    type: "number",
    min: 0,
    max: 2,
    step: 0.1,
    titleKey: "settings.temperature.title",
    descKey: "settings.temperature.desc"
  },
  {
    key: "fim.numPredictFim",
    group: "model",
    type: "number",
    min: 1,
    max: 4096,
    step: 1,
    titleKey: "settings.numPredict.title",
    descKey: "settings.numPredict.desc"
  },
  {
    key: "fim.maxLines",
    group: "model",
    type: "number",
    min: 1,
    max: 200,
    step: 1,
    titleKey: "settings.maxLines.title",
    descKey: "settings.maxLines.desc"
  },
  {
    key: "fim.contextLength",
    group: "model",
    type: "number",
    unit: "行",
    min: 1,
    max: 500,
    step: 1,
    titleKey: "settings.contextLength.title",
    descKey: "settings.contextLength.desc"
  },
  // ── context ──
  {
    key: "fim.fileContextEnabled",
    group: "context",
    type: "boolean",
    titleKey: "settings.fileContext.title",
    descKey: "settings.fileContext.desc"
  },
  // ── general ──
  {
    key: "fim.locale",
    group: "general",
    type: "select",
    options: [
      { value: "en", labelKey: "settings.locale.en" },
      { value: "zh-CN", labelKey: "settings.locale.zhCN" }
    ],
    titleKey: "settings.locale.title",
    descKey: "settings.locale.desc"
  },
  {
    key: "fim.enableLogging",
    group: "general",
    type: "boolean",
    titleKey: "settings.logging.title",
    descKey: "settings.logging.desc"
  }
]

/** Strip the "fim." prefix to get the bare config key used by the VS Code config protocol. */
export const getConfigKey = (def: Pick<SettingDef, "key">): string =>
  def.key.replace(/^fim\./, "")

export const getSettingsByGroup = (groupId: SettingGroupId): SettingDef[] =>
  SETTING_DEFS.filter((def) => def.group === groupId)

/** Coerce a raw input (string from input field, etc.) into the setting's type, with range validation. */
export const coerceValue = (def: SettingDef, raw: unknown): unknown => {
  if (def.type === "boolean") {
    if (typeof raw === "boolean") return raw
    if (typeof raw === "string") return raw === "true"
    return Boolean(raw)
  }
  if (def.type === "number") {
    const n = typeof raw === "string" ? parseFloat(raw) : Number(raw)
    if (Number.isNaN(n)) return def.min ?? 0
    let clamped = n
    if (def.min !== undefined) clamped = Math.max(def.min, clamped)
    if (def.max !== undefined) clamped = Math.min(def.max, clamped)
    return clamped
  }
  // select
  const allowed = (def.options ?? []).map((o) => o.value)
  const str = String(raw)
  return allowed.includes(str) ? str : (allowed[0] ?? str)
}
