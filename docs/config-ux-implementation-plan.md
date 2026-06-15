# 配置体验重设计 — Settings Tab 手风琴化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 twinny 的全部可见 VS Code 设置搬进 webview 的 Settings tab，用 codicon 手风琴分组组织，顶部加一个状态指挥栏，消除配置入口割裂。

**Architecture:** 共享 schema（`src/common/`，纯数据无依赖）作为唯一真相源，extension 端和 webview 端都引用。webview 用 `useTwinnyConfig` hook 一次批量读取全部配置、单项写入。设置项用 schema 驱动渲染：boolean→Toggle、number→输入框、select→下拉。

**Tech Stack:** React 18 + `@vscode/webview-ui-toolkit/react` + codicon 图标 + CSS Modules + i18next + Mocha(TDD) 测试。

**设计依据:** `docs/config-ux-design.md`。

---

## 范围说明（重要）

**MVP 包含的 15 个可见设置**（boolean/number/select 三种类型）：
- 指挥栏：`enabled`
- 补全行为：`autoSuggestEnabled`、`debounceWait`、`enableSubsequentCompletions`、`multilineCompletionsEnabled`、`completionCacheEnabled`
- 模型参数：`temperature`、`numPredictFim`、`maxLines`、`contextLength`、`keepAlive`
- 语言与上下文：`fileContextEnabled`
- 通用：`locale`、`enableLogging`、`providerStorageLocation`

**MVP 排除（需要专用 UI，列为后续）**：
- `enabledLanguages`（object map `{"*": true}`）— 需多选 UI
- `embeddingIgnoredGlobs`（array）— 需列表编辑 UI，且设计文档要求移到 Embeddings tab

**Deprecated（隐藏，仅 package.json 标记）**：`ollamaHostname`、`ollamaApiPort`、`ollamaUseTls`。

**测试策略**：纯逻辑（schema + `coerceValue`）走 Mocha TDD；React 组件走 `npm run build` + 手动验证清单（与现有项目一致，现有测试套件只有 `completion-formatter.test.ts`）。

---

## 文件结构

**新建：**
- `src/common/settings-schema.ts` — 设置 schema 定义 + `coerceValue`/`getConfigKey`/`getSettingsByGroup` 纯函数（唯一真相源，无 VS Code 依赖）
- `src/webview/hooks/useTwinnyConfig.ts` — 批量读取 + 单项写入 hook
- `src/webview/settings/Toggle.tsx` — 滑动开关组件
- `src/webview/settings/AccordionSection.tsx` — 手风琴折叠分组容器
- `src/webview/settings/SettingRow.tsx` — 单设置行（标题 + 说明 + 控件）
- `src/webview/settings/MasterBar.tsx` — 顶部状态指挥栏
- `src/webview/settings/SettingsView.tsx` — 新设置面板组合
- `src/webview/styles/settings-view.module.css` — 新组件样式
- `src/test/suite/settings-schema.test.ts` — schema + coerceValue 单元测试

**修改：**
- `src/common/constants/events.ts` — 新增 `twinnyGetAllConfigValues` 事件
- `src/extension/providers/base.ts` — 新增批量读取 handler
- `src/webview/settings.tsx` — 改为渲染 `SettingsView`，保留模板管理逻辑
- `src/webview/assets/locales/en.json` — 新增 i18n key
- `package.json` — 3 个 Ollama 设置 description 加 `[deprecated]` 前缀

---

## Task 1: 共享 settings schema + 纯函数（TDD）

**Files:**
- Create: `src/common/settings-schema.ts`
- Test: `src/test/suite/settings-schema.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/test/suite/settings-schema.test.ts`：

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from "assert"

import {
  SETTING_DEFS,
  SETTING_GROUPS,
  coerceValue,
  getConfigKey,
  getSettingsByGroup
} from "../../common/settings-schema"

suite("Settings schema", () => {
  test("every setting has a unique key", () => {
    const keys = SETTING_DEFS.map((d) => d.key)
    assert.strictEqual(keys.length, new Set(keys).size, "duplicate setting keys")
  })

  test("every setting group has at least one visible setting", () => {
    const visibleGroups = SETTING_GROUPS.filter((g) => g.id !== "templates")
    for (const group of visibleGroups) {
      const settings = getSettingsByGroup(group.id)
      assert.ok(
        settings.length > 0,
        `group "${group.id}" has no settings`
      )
    }
  })

  test("every setting has matching group, type, titleKey, descKey", () => {
    const groupIds = SETTING_GROUPS.map((g) => g.id)
    for (const def of SETTING_DEFS) {
      assert.ok(groupIds.includes(def.group), `${def.key} has unknown group`)
      assert.ok(["boolean", "number", "select"].includes(def.type), `${def.key} bad type`)
      assert.ok(def.titleKey, `${def.key} missing titleKey`)
      assert.ok(def.descKey, `${def.key} missing descKey`)
      if (def.type === "select") {
        assert.ok(def.options && def.options.length > 0, `${def.key} select needs options`)
      }
    }
  })

  test("getConfigKey strips twinny prefix", () => {
    assert.strictEqual(getConfigKey({ key: "twinny.debounceWait" } as any), "debounceWait")
    assert.strictEqual(getConfigKey({ key: "twinny.locale" } as any), "locale")
  })

  test("coerceValue boolean coerces truthy/falsy", () => {
    const def = { type: "boolean" } as any
    assert.strictEqual(coerceValue(def, true), true)
    assert.strictEqual(coerceValue(def, false), false)
    assert.strictEqual(coerceValue(def, "true"), true)
    assert.strictEqual(coerceValue(def, ""), false)
  })

  test("coerceValue number parses and clamps to min/max", () => {
    const def = { type: "number", min: 0, max: 2, step: 0.1 } as any
    assert.strictEqual(coerceValue(def, "0.5"), 0.5)
    assert.strictEqual(coerceValue(def, "abc"), 0) // NaN -> min
    assert.strictEqual(coerceValue(def, 99), 2) // clamped to max
    assert.strictEqual(coerceValue(def, -5), 0) // clamped to min
  })

  test("coerceValue number without min/max does not clamp", () => {
    const def = { type: "number" } as any
    assert.strictEqual(coerceValue(def, "42"), 42)
  })

  test("coerceValue select falls back to first option when invalid", () => {
    const def = {
      type: "select",
      options: [
        { value: "5m", labelKey: "a" },
        { value: "30m", labelKey: "b" }
      ]
    } as any
    assert.strictEqual(coerceValue(def, "30m"), "30m")
    assert.strictEqual(coerceValue(def, "bogus"), "5m") // fallback
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run build-tests && node ./out/test/runTest.js 2>/dev/null; echo "(expect failure: module not found)"`
Expected: 编译失败或运行时报 `Cannot find module '../../common/settings-schema'`

- [ ] **Step 3: 写 schema 实现**

创建 `src/common/settings-schema.ts`：

```typescript
export type SettingType = "boolean" | "number" | "select"
export type SettingGroupId =
  | "completion"
  | "model"
  | "context"
  | "general"
  | "templates"

export interface SelectOption {
  value: string
  labelKey: string
}

export interface SettingDef {
  /** Full setting id, e.g. "twinny.debounceWait" */
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
  { id: "general", icon: "settings-gear", titleKey: "settings.group.general" },
  { id: "templates", icon: "note", titleKey: "settings.group.templates" }
]

export const SETTING_DEFS: SettingDef[] = [
  // ── completion ──
  {
    key: "twinny.autoSuggestEnabled",
    group: "completion",
    type: "boolean",
    titleKey: "settings.autoSuggest.title",
    descKey: "settings.autoSuggest.desc"
  },
  {
    key: "twinny.debounceWait",
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
    key: "twinny.enableSubsequentCompletions",
    group: "completion",
    type: "boolean",
    titleKey: "settings.subsequent.title",
    descKey: "settings.subsequent.desc"
  },
  {
    key: "twinny.multilineCompletionsEnabled",
    group: "completion",
    type: "boolean",
    titleKey: "settings.multiline.title",
    descKey: "settings.multiline.desc"
  },
  {
    key: "twinny.completionCacheEnabled",
    group: "completion",
    type: "boolean",
    titleKey: "settings.cache.title",
    descKey: "settings.cache.desc"
  },
  // ── model ──
  {
    key: "twinny.temperature",
    group: "model",
    type: "number",
    min: 0,
    max: 2,
    step: 0.1,
    titleKey: "settings.temperature.title",
    descKey: "settings.temperature.desc"
  },
  {
    key: "twinny.numPredictFim",
    group: "model",
    type: "number",
    min: 1,
    max: 4096,
    step: 1,
    titleKey: "settings.numPredict.title",
    descKey: "settings.numPredict.desc"
  },
  {
    key: "twinny.maxLines",
    group: "model",
    type: "number",
    min: 1,
    max: 200,
    step: 1,
    titleKey: "settings.maxLines.title",
    descKey: "settings.maxLines.desc"
  },
  {
    key: "twinny.contextLength",
    group: "model",
    type: "number",
    unit: "行",
    min: 1,
    max: 500,
    step: 1,
    titleKey: "settings.contextLength.title",
    descKey: "settings.contextLength.desc"
  },
  {
    key: "twinny.keepAlive",
    group: "model",
    type: "select",
    options: [
      { value: "5m", labelKey: "settings.keepAlive.5m" },
      { value: "30m", labelKey: "settings.keepAlive.30m" },
      { value: "-1", labelKey: "settings.keepAlive.always" }
    ],
    titleKey: "settings.keepAlive.title",
    descKey: "settings.keepAlive.desc"
  },
  // ── context ──
  {
    key: "twinny.fileContextEnabled",
    group: "context",
    type: "boolean",
    titleKey: "settings.fileContext.title",
    descKey: "settings.fileContext.desc"
  },
  // ── general ──
  {
    key: "twinny.locale",
    group: "general",
    type: "select",
    // MUST match the 13 locales loaded in src/webview/i18n.ts resources
    options: [
      { value: "en", labelKey: "settings.locale.en" },
      { value: "de", labelKey: "settings.locale.de" },
      { value: "es", labelKey: "settings.locale.es" },
      { value: "esCL", labelKey: "settings.locale.esCL" },
      { value: "fr", labelKey: "settings.locale.fr" },
      { value: "it", labelKey: "settings.locale.it" },
      { value: "ja", labelKey: "settings.locale.ja" },
      { value: "ko", labelKey: "settings.locale.ko" },
      { value: "nl", labelKey: "settings.locale.nl" },
      { value: "pt", labelKey: "settings.locale.pt" },
      { value: "ru", labelKey: "settings.locale.ru" },
      { value: "zh-CN", labelKey: "settings.locale.zhCN" },
      { value: "zh-HK", labelKey: "settings.locale.zhHK" }
    ],
    titleKey: "settings.locale.title",
    descKey: "settings.locale.desc"
  },
  {
    key: "twinny.enableLogging",
    group: "general",
    type: "boolean",
    titleKey: "settings.logging.title",
    descKey: "settings.logging.desc"
  },
  {
    key: "twinny.providerStorageLocation",
    group: "general",
    type: "select",
    options: [
      { value: "globalState", labelKey: "settings.storage.globalState" },
      { value: "file", labelKey: "settings.storage.file" }
    ],
    titleKey: "settings.storage.title",
    descKey: "settings.storage.desc"
  }
]

/** Strip the "twinny." prefix to get the bare config key used by the VS Code config protocol. */
export const getConfigKey = (def: Pick<SettingDef, "key">): string =>
  def.key.replace(/^twinny\./, "")

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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run build-tests && node ./out/test/runTest.js`
Expected: `Settings schema` suite 全部 PASS（注意：`runTest.js` 会在 VS Code host 里跑，需要 Extension Development 环境或 `@vscode/test-cli` 拉起。若环境无法启动 host，至少 `npm run build-tests` 编译通过且测试代码无类型错误。）

- [ ] **Step 5: Commit**

```bash
git add src/common/settings-schema.ts src/test/suite/settings-schema.test.ts
git commit -m "feat: add settings schema + coerceValue helpers with tests"
```

---

## Task 2: 新增批量读取事件 + extension handler

**Files:**
- Modify: `src/common/constants/events.ts`
- Modify: `src/extension/providers/base.ts`

- [ ] **Step 1: 新增事件常量**

在 `src/common/constants/events.ts` 的 `EVENT_NAME` 对象里，`twinnyGetConfigValue` 那行之后加一行：

```typescript
  twinnyGetConfigValue: "twinny-get-config-value",
  twinnyGetAllConfigValues: "twinny-get-all-config-values",
```

- [ ] **Step 2: 在 base.ts 加 handler 方法**

在 `src/extension/providers/base.ts` 顶部 import 区加：

```typescript
import { SETTING_DEFS, getConfigKey } from "../../common/settings-schema"
```

在 `BaseProvider` 类内部（`getConfigurationValue` 方法附近）加新方法：

```typescript
  private getAllConfigValues = () => {
    const config = vscode.workspace.getConfiguration("twinny")
    const data: Record<string, unknown> = {}
    for (const def of SETTING_DEFS) {
      const bareKey = getConfigKey(def)
      data[bareKey] = config.get(bareKey)
    }
    // master bar reads "enabled" separately (not in SETTING_DEFS)
    data.enabled = config.get("enabled")
    this.webView?.postMessage({
      type: EVENT_NAME.twinnyGetAllConfigValues,
      data
    } as ServerMessage)
  }
```

- [ ] **Step 3: 注册 handler 到事件表**

在同一个文件的 `registerEventListeners()` 方法的 `eventHandlers` 对象里加一行（紧跟 `twinnyGetConfigValue`）：

```typescript
      [EVENT_NAME.twinnyGetConfigValue]: this.getConfigurationValue,
      [EVENT_NAME.twinnyGetAllConfigValues]: this.getAllConfigValues,
```

- [ ] **Step 4: 编译验证**

Run: `npm run build`
Expected: 编译成功，无 TS 错误。

- [ ] **Step 5: Commit**

```bash
git add src/common/constants/events.ts src/extension/providers/base.ts
git commit -m "feat: add twinnyGetAllConfigValues batch read event + handler"
```

---

## Task 3: useTwinnyConfig hook

**Files:**
- Create: `src/webview/hooks/useTwinnyConfig.ts`

- [ ] **Step 1: 创建 hook**

创建 `src/webview/hooks/useTwinnyConfig.ts`：

```typescript
import { useCallback, useEffect, useState } from "react"

import { EVENT_NAME } from "../../common/constants"
import { ServerMessage } from "../../common/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const global = globalThis as any

export interface TwinnyConfig {
  [bareKey: string]: unknown
}

/**
 * Reads all twinny.* config values in one batch on mount, and provides an
 * `update(bareKey, value)` that optimistically updates local state and posts
 * a twinnySetConfigValue message. Keys are BARE (e.g. "debounceWait", not
 * "twinny.debounceWait") to match the VS Code config protocol.
 */
export const useTwinnyConfig = () => {
  const [config, setConfig] = useState<TwinnyConfig>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message: ServerMessage<TwinnyConfig> = event.data
      if (message?.type === EVENT_NAME.twinnyGetAllConfigValues) {
        setConfig(message.data || {})
        setLoaded(true)
      }
    }
    window.addEventListener("message", handler)
    global.vscode.postMessage({ type: EVENT_NAME.twinnyGetAllConfigValues })
    return () => window.removeEventListener("message", handler)
  }, [])

  const update = useCallback((bareKey: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [bareKey]: value }))
    global.vscode.postMessage({
      type: EVENT_NAME.twinnySetConfigValue,
      key: bareKey,
      data: value
    })
  }, [])

  return { config, loaded, update }
}
```

- [ ] **Step 2: 编译验证**

Run: `npm run build`
Expected: 编译成功。

- [ ] **Step 3: Commit**

```bash
git add src/webview/hooks/useTwinnyConfig.ts
git commit -m "feat: add useTwinnyConfig hook for batch config read + write"
```

---

## Task 4: Toggle / AccordionSection / SettingRow 叶子组件

**Files:**
- Create: `src/webview/settings/Toggle.tsx`
- Create: `src/webview/settings/AccordionSection.tsx`
- Create: `src/webview/settings/SettingRow.tsx`

- [ ] **Step 1: Toggle 组件**

创建 `src/webview/settings/Toggle.tsx`：

```tsx
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
```

- [ ] **Step 2: AccordionSection 组件**

创建 `src/webview/settings/AccordionSection.tsx`：

```tsx
import { useState } from "react"
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
```

> 注：用条件渲染 `{open && ...}` 而非 CSS max-height 动画，避免内容高度未知时的测量问题。如需动画可后续加 CSS transition（reduced-motion 下禁用）。

- [ ] **Step 3: SettingRow 组件**

创建 `src/webview/settings/SettingRow.tsx`：

```tsx
import { useTranslation } from "react-i18next"
import { VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import { SettingDef, coerceValue, getConfigKey } from "../../common/settings-schema"

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
            type="number"
            value={String(value ?? "")}
            min={def.min}
            max={def.max}
            step={def.step}
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
```

- [ ] **Step 4: 编译验证**

Run: `npm run build`
Expected: 编译成功（CSS 文件下一个 Task 创建，此处 import 会因模块缺失报错——可先创建空的 `src/webview/styles/settings-view.module.css` 占位，或把本 Task 与 Task 6 合并执行。**推荐：本步先创建空 CSS 文件再编译**）。

创建空占位文件 `src/webview/styles/settings-view.module.css`（内容留空），再 `npm run build`。

- [ ] **Step 5: Commit**

```bash
git add src/webview/settings/Toggle.tsx src/webview/settings/AccordionSection.tsx src/webview/settings/SettingRow.tsx src/webview/styles/settings-view.module.css
git commit -m "feat: add Toggle, AccordionSection, SettingRow components"
```

---

## Task 5: MasterBar 指挥栏组件

**Files:**
- Create: `src/webview/settings/MasterBar.tsx`

- [ ] **Step 1: 创建 MasterBar**

创建 `src/webview/settings/MasterBar.tsx`：

```tsx
import { useTranslation } from "react-i18next"

import { EVENT_NAME } from "../../common/constants"
import { useProviders } from "../hooks/useProviders"
import styles from "../styles/settings-view.module.css"
import { Toggle } from "./Toggle"

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
      type: EVENT_NAME.twinnySetTab,
      data: "providers"
    })
  }

  return (
    <div
      className={`${styles.masterBar} ${enabled ? "" : styles.masterBarOff}`}
    >
      <div className={styles.masterLeft}>
        <span className={styles.masterDot} />
        <div>
          <div className={styles.masterName}>Twinny</div>
          {modelName ? (
            <div className={styles.masterMeta}>{meta}</div>
          ) : (
            <button type="button" className={styles.masterMetaButton} onClick={goToProviders}>
              {meta}
            </button>
          )}
        </div>
      </div>
      <Toggle checked={enabled} onChange={onToggleEnabled} />
    </div>
  )
}
```

> 注：未配置 FIM provider 时，meta 行变成可点击按钮，跳转到 Provider tab。`useProviders` 已存在于 `src/webview/hooks/useProviders.ts`，导出 `fimProvider`（见 `providers.tsx:45` 用法）。需确认 `useProviders` 返回的 `fimProvider` 有 `modelName` 和 `label` 字段——若字段名不同，按实际调整。

- [ ] **Step 2: 编译验证**

Run: `npm run build`
Expected: 编译成功。若 `useProviders` 的返回字段名不符，按编译错误提示调整。

- [ ] **Step 3: Commit**

```bash
git add src/webview/settings/MasterBar.tsx
git commit -m "feat: add MasterBar command bar with provider status"
```

---

## Task 6: SettingsView 组合 + 重写 settings.tsx

**Files:**
- Create: `src/webview/settings/SettingsView.tsx`
- Modify: `src/webview/settings.tsx`

- [ ] **Step 1: 创建 SettingsView**

创建 `src/webview/settings/SettingsView.tsx`：

```tsx
import { useTranslation } from "react-i18next"

import { SETTING_GROUPS, getSettingsByGroup } from "../../common/settings-schema"
import { useTwinnyConfig } from "../hooks/useTwinnyConfig"
import styles from "../styles/settings-view.module.css"

import { AccordionSection } from "./AccordionSection"
import { MasterBar } from "./MasterBar"
import { SettingRow } from "./SettingRow"

export const SettingsView = () => {
  const { t } = useTranslation()
  const { config, loaded, update } = useTwinnyConfig()

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
                value={config[def.key.replace(/^twinny\./, "")]}
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
```

- [ ] **Step 2: 重写 settings.tsx**

把 `src/webview/settings.tsx` 整个文件替换为：

```tsx
import { useTranslation } from "react-i18next"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import {
  DEFAULT_ACTION_TEMPLATES,
  WORKSPACE_STORAGE_KEY
} from "../common/constants"

import {
  StorageType,
  useStorageContext
} from "./hooks/useStorageContext"
import { useTemplates } from "./hooks/useTemplates"
import { kebabToSentence } from "./utils"

import { AccordionSection } from "./settings/AccordionSection"
import { SettingsView } from "./settings/SettingsView"
import styles from "./styles/settings.module.css"

export const Settings = () => {
  const { t } = useTranslation()
  const { templates, saveTemplates, editDefaultTemplates } = useTemplates()
  const {
    context: selectedTemplatesContext,
    setContext: setSelectedTemplatesContext
  } =
    useStorageContext<string[] | undefined>(
      StorageType.Workspace,
      WORKSPACE_STORAGE_KEY.selectedTemplates
    ) || []

  const handleTemplateClick = (
    e: React.MouseEvent<HTMLInputElement, MouseEvent>
  ) => {
    const target = e.target as HTMLInputElement
    const template = target.value

    if (selectedTemplatesContext?.includes(template)) {
      if (selectedTemplatesContext.length === 1) {
        saveTemplates([])
        setSelectedTemplatesContext([])
        return
      }
      const newValue = selectedTemplatesContext.filter((item) => item !== template)
      saveTemplates(newValue)
      setSelectedTemplatesContext(newValue)
      return
    }

    const currentValue = selectedTemplatesContext || []
    const newValue = [...currentValue, template]
    saveTemplates(newValue)
    setSelectedTemplatesContext(newValue)
  }

  const handleClearSelection = () => {
    saveTemplates(DEFAULT_ACTION_TEMPLATES)
    setSelectedTemplatesContext(DEFAULT_ACTION_TEMPLATES)
  }

  const handleEditDefaultTemplates = () => {
    editDefaultTemplates()
  }

  return (
    <div>
      <SettingsView />
      <AccordionSection icon="note" titleKey="settings.group.templates" defaultOpen={false}>
        <div className={styles.templateEditor}>
          <p>{t("template-settings-description")}</p>
          <VSCodeButton onClick={handleEditDefaultTemplates}>
            {t("open-template-editor")}
          </VSCodeButton>
        </div>
        <div className={styles.checkboxGroup}>
          {templates &&
            templates.map((templateName: string) => (
              <div key={templateName} className={styles.checkboxItem}>
                <label htmlFor={templateName}>
                  <input
                    id={templateName}
                    name={templateName}
                    value={templateName}
                    type="checkbox"
                    onClick={handleTemplateClick}
                    checked={selectedTemplatesContext?.includes(templateName)}
                  />
                  <span>{kebabToSentence(templateName)}</span>
                </label>
              </div>
            ))}
        </div>
        <div className={styles.resetButton}>
          <VSCodeButton onClick={handleClearSelection}>
            {t("clear")}
          </VSCodeButton>
        </div>
      </AccordionSection>
    </div>
  )
}
```

> 注：原 `Settings` 用 `VSCodeCheckbox`；这里模板区改用原生 `input[type=checkbox]` 包在 `AccordionSection` 内，避免 toolkit checkbox 在折叠容器里的样式冲突。如需保留 `VSCodeCheckbox`，把 `<input .../>` 换回 `<VSCodeCheckbox .../>` 并恢复对应 import。`t("template-settings-description")` 等 key 已存在于 locale 文件，无需新增。

- [ ] **Step 3: 编译验证**

Run: `npm run build`
Expected: 编译成功。

- [ ] **Step 4: Commit**

```bash
git add src/webview/settings/SettingsView.tsx src/webview/settings.tsx
git commit -m "feat: compose SettingsView with accordion groups, preserve templates"
```

---

## Task 7: CSS 样式

**Files:**
- Modify: `src/webview/styles/settings-view.module.css`（Task 4 创建的空文件，现在填内容）

- [ ] **Step 1: 写样式**

把 `src/webview/styles/settings-view.module.css` 内容替换为：

```css
.panel {
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
}

.sectionLabel {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--vscode-descriptionForeground);
  margin: 8px 4px 10px;
}

.loading {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  padding: 12px 4px;
}

/* ── Master bar ── */
.masterBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-editorWidget-border);
  border-left: 3px solid var(--vscode-terminal-ansiGreen, #4ec9b0);
  border-radius: 6px;
  margin-bottom: 16px;
}

.masterBarOff {
  border-left-color: var(--vscode-descriptionForeground);
}

.masterLeft {
  display: flex;
  align-items: center;
  gap: 10px;
}

.masterDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vscode-terminal-ansiGreen, #4ec9b0);
  box-shadow: 0 0 0 3px rgba(78, 201, 176, 0.18);
  flex-shrink: 0;
}

.masterBarOff .masterDot {
  background: var(--vscode-descriptionForeground);
  box-shadow: none;
}

.masterName {
  font-weight: 600;
  font-size: 13px;
}

.masterMeta {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-top: 1px;
}

.masterMetaButton {
  background: none;
  border: none;
  color: var(--vscode-textLink-foreground);
  font-size: 11px;
  padding: 1px 0;
  cursor: pointer;
  text-decoration: underline;
  margin-top: 1px;
}

/* ── Accordion group ── */
.group {
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 6px;
  margin-bottom: 8px;
  overflow: hidden;
  background: var(--vscode-editor-background);
}

.groupHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  height: 38px;
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  color: var(--vscode-foreground);
  font-family: inherit;
  font-size: 13px;
}

.groupHead:hover {
  background: var(--vscode-list-hoverBackground);
}

.groupHead:focus-visible {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

.groupTitle {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 600;
  font-size: 13px;
}

.groupTitle i {
  font-size: 14px;
  opacity: 0.9;
}

.groupChevron {
  font-size: 14px;
  opacity: 0.55;
  transition: transform 0.18s ease;
}

.groupOpen .groupChevron {
  transform: rotate(90deg);
}

.groupBody {
  border-top: 1px solid var(--vscode-editorWidget-border);
}

.groupInner {
  padding: 6px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Setting row ── */
.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.rowText {
  flex: 1;
  min-width: 0;
}

.rowTitle {
  font-size: 12px;
  font-weight: 500;
}

.rowDesc {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-top: 2px;
  line-height: 1.45;
}

.rowControl {
  display: flex;
  align-items: center;
  padding-top: 2px;
  flex-shrink: 0;
}

/* ── Toggle ── */
.toggle {
  width: 38px;
  height: 20px;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, var(--vscode-checkbox-border));
  border-radius: 10px;
  position: relative;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.toggle::after {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  background: var(--vscode-descriptionForeground);
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s ease;
}

.toggleOn {
  background: var(--vscode-checkbox-background);
  border-color: transparent;
}

.toggleOn::after {
  transform: translateX(18px);
  background: #fff;
}

/* ── Number input ── */
.numInput {
  display: flex;
  align-items: center;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  overflow: hidden;
}

.numInput vscode-text-field {
  background: transparent;
  border: none;
  width: 60px;
}

.unit {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  padding-right: 8px;
}

@media (prefers-reduced-motion: reduce) {
  .groupChevron,
  .toggle,
  .toggle::after {
    transition: none !important;
  }
}
```

- [ ] **Step 2: 编译验证**

Run: `npm run build`
Expected: 编译成功。

- [ ] **Step 3: Commit**

```bash
git add src/webview/styles/settings-view.module.css
git commit -m "feat: add settings accordion + master bar styles"
```

---

## Task 8: i18n 英文 key + fallback 验证

**Files:**
- Modify: `src/webview/assets/locales/en.json`

- [ ] **Step 1: 确认 fallback 配置**

检查 `src/webview/i18n.ts`，确认有 `fallbackLng: "en"`。若没有，在 i18next init 配置里加上。

- [ ] **Step 2: 在 en.json 加新 key**

在 `src/webview/assets/locales/en.json` 顶层对象里加入以下 key（若文件结构是扁平的 key-value，直接加；若是嵌套，按现有风格加）。新增内容：

```json
{
  "settings.sectionLabel": "Settings",
  "settings.loading": "Loading…",
  "settings.masterBar.noProvider": "No FIM provider configured — click to set up",
  "settings.group.completion": "Completion",
  "settings.group.model": "Model parameters",
  "settings.group.context": "Language & context",
  "settings.group.general": "General",
  "settings.group.templates": "Templates",
  "settings.autoSuggest.title": "Auto-trigger completions",
  "settings.autoSuggest.desc": "Suggest as you type; disable to trigger manually (Alt+\\)",
  "settings.debounce.title": "Trigger delay",
  "settings.debounce.desc": "How long to wait after you stop typing before requesting",
  "settings.subsequent.title": "Continue after accept",
  "settings.subsequent.desc": "Generate the next completion immediately after accepting one",
  "settings.multiline.title": "Multi-line completions",
  "settings.multiline.desc": "Allow completions that span multiple lines; disable for single-line only",
  "settings.cache.title": "Completion cache",
  "settings.cache.desc": "Return cached results for the same prefix/suffix, saving requests",
  "settings.temperature.title": "Sampling temperature",
  "settings.temperature.desc": "Higher is more random, lower more deterministic. Completion: 0.1–0.4",
  "settings.numPredict.title": "Max output tokens",
  "settings.numPredict.desc": "Maximum tokens a single completion may generate",
  "settings.maxLines.title": "Max output lines",
  "settings.maxLines.desc": "Completions are truncated beyond this many lines",
  "settings.contextLength.title": "Context lines",
  "settings.contextLength.desc": "How many lines around the cursor to use as prefix/suffix",
  "settings.keepAlive.title": "Model keep-alive",
  "settings.keepAlive.desc": "How long an Ollama model stays loaded before unloading",
  "settings.keepAlive.5m": "5 minutes",
  "settings.keepAlive.30m": "30 minutes",
  "settings.keepAlive.always": "Always",
  "settings.fileContext.title": "Use file context",
  "settings.fileContext.desc": "Include relevant open files as completion context (by edit activity)",
  "settings.locale.title": "Interface language",
  "settings.locale.desc": "Language for the sidebar and messages",
  "settings.locale.en": "English",
  "settings.locale.de": "Deutsch",
  "settings.locale.es": "Español",
  "settings.locale.esCL": "Español (Chile)",
  "settings.locale.fr": "Français",
  "settings.locale.it": "Italiano",
  "settings.locale.ja": "日本語",
  "settings.locale.ko": "한국어",
  "settings.locale.nl": "Nederlands",
  "settings.locale.pt": "Português",
  "settings.locale.ru": "Русский",
  "settings.locale.zhCN": "中文 (简体)",
  "settings.locale.zhHK": "中文 (繁體)",
  "settings.logging.title": "Enable logging",
  "settings.logging.desc": "Write completion requests, latency, and cache hits to the Twinny output channel",
  "settings.storage.title": "Provider storage location",
  "settings.storage.desc": "globalState uses VS Code built-in; file uses a local JSON file",
  "settings.storage.globalState": "VS Code globalState",
  "settings.storage.file": "Local file"
}
```

> 若 `en.json` 已有同名 key，保留旧的；只补缺失的。其他 12 个 locale 文件**不在本 Task 翻译**——靠 `fallbackLng: "en"` 兜底（i18next 找不到 key 时回退英文）。这是设计文档 §5.4 的决定。

- [ ] **Step 3: JSON 合法性验证**

Run: `node -e "require('./src/webview/assets/locales/en.json'); console.log('valid')"`
Expected: 打印 `valid`（JSON 无语法错误）。

- [ ] **Step 4: Commit**

```bash
git add src/webview/assets/locales/en.json src/webview/i18n.ts
git commit -m "feat: add settings i18n keys (en) + verify fallback"
```

---

## Task 9: package.json 标记 deprecated 设置

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 给 3 个 Ollama 设置加 deprecated 提示**

在 `package.json` 的 `contributes.configuration.properties` 里，找到 `twinny.ollamaHostname`、`twinny.ollamaApiPort`、`twinny.ollamaUseTls` 三项，把各自 `description` 字段前面加上 `[deprecated] ` 前缀。

例如 `twinny.ollamaHostname` 的 description 改为：
```
"[deprecated] Use the provider system instead. Legacy Ollama hostname."
```
`twinny.ollamaApiPort`：
```
"[deprecated] Use the provider system instead. Legacy Ollama API port."
```
`twinny.ollamaUseTls`：
```
"[deprecated] Use the provider system instead. Legacy Ollama TLS flag."
```

> 不要删除这三个设置定义（保持向后兼容，代码路径仍读取）。仅 UI 不展示 + description 标注。

- [ ] **Step 2: JSON 合法性验证**

Run: `node -e "require('./package.json'); console.log('valid')"`
Expected: 打印 `valid`。

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: mark legacy ollama settings as deprecated in package.json"
```

---

## Task 10: 构建 + Lint + 手动验证清单

**Files:** 无（验证步骤）

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: 无 error。warning 可接受，但应不引入新的 lint 问题（关注 `simple-import-sort` 和未使用变量）。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 两个 bundle（extension + webview）编译成功。

- [ ] **Step 3: 单元测试**

Run: `npm run build-tests && node ./out/test/runTest.js`
Expected: `Settings schema` suite 全部 PASS。

- [ ] **Step 4: 手动验证（在 VS Code Extension Development Host 里）**

按 `F5` 启动 Extension Development Host，打开 Twinny 侧边栏 → Settings tab，逐项验证：

1. 顶部指挥栏显示 "Twinny" + 当前 FIM provider 的 model name + provider label + 绿色状态点
2. 点击指挥栏 toggle，状态点变灰，`workspace.getConfiguration("twinny").enabled` 变为 false
3. 未配置 FIM provider 时，meta 行显示可点击的 "No FIM provider configured"，点击跳到 Provider tab
4. "补全行为" 分组默认展开，其余默认折叠
5. 展开各分组，控件显示当前配置值（与 VS Code Settings 里的值一致）
6. 修改任一 toggle / 数字 / 下拉 → 检查 `workspace.getConfiguration("twinny")` 实际更新（在 VS Code Settings UI 搜 twinny 对照）
7. 数字输入超范围时被 clamp（如温度输 99 变 2，输 -1 变 0）
8. 修改设置后 Reload Window（Ctrl+Shift+P → Reload Window），值持久化
9. 切换 locale（通用分组下拉），分组标题/设置标题正确切换语言（英文兜底的 key 显示英文）
10. "模板" 分组展开后能看到模板编辑按钮和 action 模板勾选项（与重做前功能一致）
11. 旧 Ollama 设置不出现在 UI
12. codicon 图标正常显示（zap / target / file-code / settings-gear / note / chevron-right）

- [ ] **Step 5: 最终 commit（如有 lint 修复）**

```bash
git add -A
git commit -m "style: lint fixes for settings UI" --allow-empty || echo "nothing to commit"
```

---

## 后续工作（不在本计划范围）

- `enabledLanguages` 多选 UI（语言细粒度启用/禁用）
- `embeddingIgnoredGlobs` 数组编辑 UI + 移到 Embeddings tab
- 12 个非英文 locale 文件的本地化翻译
- 手风琴展开高度动画（可选，需注意 reduced-motion）
