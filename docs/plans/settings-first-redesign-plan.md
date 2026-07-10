# Settings-First Redesign 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 FIM 扩展从"三 tab 工具"重构为"全单页手风琴设置首屏"——打开即配置,provider 下拉选择,chat 移除,embeddings 收进折叠分组。

**Architecture:** 基于原 `config-ux-implementation-plan.md` 已完成的手风琴组件,改变外层结构:去 tab 栏、默认渲染 Settings、MasterBar 加 provider 下拉、providers CRUD 加返回按钮。现有视图切换机制(`fimSetTab` postMessage)保留用于子视图(providers CRUD + embeddings)。

**Tech Stack:** React 18 + `@vscode/webview-ui-toolkit/react` + codicon

---
## 文件结构

**仅修改(无新建文件,有删除):**

| 修改文件 | 变化 |
|---------|------|
| `src/webview/main.tsx:20` | 默认 tab → `WEBUI_TABS.settings` |
| `src/webview/settings/MasterBar.tsx` | 静态文本 → `VSCodeDropdown`+所有 FIM providers |
| `src/webview/providers.tsx` + CSS | default view 顶部加"← 返回设置"按钮 |
| `src/webview/settings.tsx` | 在 SettingsView 和 templates 之间插入 Advanced/RAG 分组 |
| `src/webview/styles/settings.module.css` | 加 backHeader 样式 |
| `src/webview/styles/settings-view.module.css` | 加 masterSelect 样式 |
| `src/webview/assets/locales/en.json` | 加 `settings.masterBar.manageProviders` / `settings.advanced` / `back-to-settings` |
| `src/common/constants/ui.ts` | `WEBUI_TABS` 移除 chat/history/review/symmetry |
| `src/index.ts:117-122` | `fim.settings` 命令改为 focus sidebar |
| `src/extension/providers/base.ts` | 移除 `openSettings` 方法及 handler |
| `package.json` | view/title 移除齿轮/database 图标命令 |

| 删除文件 | 原因 |
|---------|------|
| `src/webview/chat.tsx` | chat 不要 |
| `src/webview/styles/chat.module.css` (如存在) | chat 样式 |

---
## Task 1: main.tsx — 默认 Settings tab

**Files:**
- Modify: `src/webview/main.tsx:20`

点击"管理 provider..."后能切到 providers 子视图,所以保留 `tabs` 映射和 `fimSetTab` 消息机制。只改默认 tab。

- [ ] **Step 1: 改默认 tab**

```typescript
// from (line 20):
  const [tab, setTab] = useState<string | undefined>(WEBUI_TABS.providers)

// to:
  const [tab, setTab] = useState<string | undefined>(WEBUI_TABS.settings)
```

没了。main.tsx 当前没有 tab 栏 UI,不需要删除任何 HTML。

- [ ] **Step 2: 编译验证**

Run: `npm run build`
Expected: 编译成功。

- [ ] **Step 3: Commit**

```bash
git add src/webview/main.tsx
git commit -m "feat: default to settings tab (single-page accordion)"
```

---
## Task 2: MasterBar — provider 下拉选择

**Files:**
- Modify: `src/webview/settings/MasterBar.tsx`
- Modify: `src/webview/styles/settings-view.module.css`

当前 MasterBar 静态文本显示 modelName·label(或无 provider 时显示按钮)。改为交互式 dropdown。

- [ ] **Step 1: 改 MasterBar.tsx**

```tsx
import { useTranslation } from "react-i18next"
import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

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
  const { fimProvider, setActiveFimProvider, getProvidersByType } = useProviders()
  const fimProviders = Object.values(getProvidersByType("fim"))
  const modelName = fimProvider?.modelName

  const goToProviders = () => {
    global.vscode.postMessage({
      type: EVENT_NAME.fimSetTab,
      data: "providers"
    })
  }

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    if (id === "__manage") {
      goToProviders()
      return
    }
    const selected = fimProviders.find((p) => p.id === id)
    if (selected) setActiveFimProvider(selected)
  }

  return (
    <div className={`${styles.masterBar} ${enabled ? "" : styles.masterBarOff}`}>
      <div className={styles.masterLeft}>
        <span className={styles.masterDot} />
        <div>
          <div className={styles.masterName}>FIM</div>
          {fimProviders.length > 0 ? (
            <VSCodeDropdown
              className={styles.masterSelect}
              value={fimProvider?.id || ""}
              onChange={handleProviderChange}
            >
              {fimProviders.map((p) => (
                <VSCodeOption key={p.id} value={p.id}>
                  {p.label} · {p.modelName}
                </VSCodeOption>
              ))}
              <VSCodeOption value="__manage">
                {t("settings.masterBar.manageProviders")}
              </VSCodeOption>
            </VSCodeDropdown>
          ) : (
            <button type="button" className={styles.masterMetaButton} onClick={goToProviders}>
              {t("settings.masterBar.noProvider")}
            </button>
          )}
        </div>
      </div>
      <Toggle checked={enabled} onChange={onToggleEnabled} />
    </div>
  )
}
```

注意:引进了 `VSCodeDropdown` + `VSCodeOption` import。移除了 `meta` 字符串(不再需要)。

- [ ] **Step 2: 加 CSS**

在 `src/webview/styles/settings-view.module.css` 文件末尾追加:

```css
/* ── MasterBar provider dropdown ── */
.masterSelect {
  margin-top: 1px;
  min-width: 160px;
}
```

- [ ] **Step 3: 编译验证**

Run: `npm run build`
Expected: 编译成功。

- [ ] **Step 4: Commit**

```bash
git add src/webview/settings/MasterBar.tsx src/webview/styles/settings-view.module.css
git commit -m "feat: replace static provider text with dropdown selector"
```

---
## Task 3: providers.tsx — 返回按钮

**Files:**
- Modify: `src/webview/providers.tsx`
- Modify: `src/webview/styles/settings.module.css`

在 providers CRUD 页面默认视图顶部加"← 返回设置"按钮。

- [ ] **Step 1: 加 handler 和 back button**

找到 `providers.tsx` `default` case 开头的 `case "providers":`(当前第 166 行),在 `<div className={styles.providerHeader}>` 之前加返回按钮:

```typescript
      case "providers":
        return (
          <>
            <div className={styles.backHeader}>
              <VSCodeButton appearance="secondary" onClick={() => {
                global.vscode.postMessage({
                  type: EVENT_NAME.fimSetTab,
                  data: "templates"
                })
              }}>
                <i className="codicon codicon-arrow-left" />
                {t("back-to-settings")}
              </VSCodeButton>
            </div>
            <div className={styles.providerHeader}>
              <h4>{t("fim-provider")}</h4>
              ...
```

同时确保文件顶部 import 了 `EVENT_NAME`(如果还没)。检查当前 import 区——`EVENT_NAME` 已在 base.ts/其他文件用,但 provders.tsx 没有它。需要在 import 区加一行:

```typescript
import {
  API_PROVIDERS,
  DEFAULT_PROVIDER_FORM_VALUES,
  EVENT_NAME,      // ← 加这行
  FIM_TEMPLATE_FORMAT,
  PROVIDER_EVENT_NAME
} from "../common/constants"
```

- [ ] **Step 2: 加 CSS**

在 `src/webview/styles/settings.module.css` 文件末尾追加:

```css
.backHeader {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
```

- [ ] **Step 3: 编译验证**

Run: `npm run build`
Expected: 编译成功。

- [ ] **Step 4: Commit**

```bash
git add src/webview/providers.tsx src/webview/styles/settings.module.css
git commit -m "feat: add back-to-settings button on providers CRUD page"
```

---
## Task 4: settings.tsx — 插入 Advanced/RAG 分组

**Files:**
- Modify: `src/webview/settings.tsx`

在 SettingsView 和 templates 分组之间插入一个"高级 / RAG"折叠分组。内容:嵌入 EmbeddingOptions 组件。

- [ ] **Step 1: 修改 settings.tsx**

在 `src/webview/settings.tsx` 的 import 区,在 `import { SettingsView }` 之后加:

```typescript
import { EmbeddingOptions } from "./embedding-options"
```

然后在 return JSX 里,在 `</SettingsView>` 和 `</div>` 之前,插入:

```tsx
          </SettingsView>
          <AccordionSection
            icon="beaker"
            titleKey="settings.group.advanced"
            defaultOpen={false}
          >
            <div className={styles.groupInner}>
              <EmbeddingOptions />
            </div>
          </AccordionSection>
```

> **注意:** `EmbeddingOptions` 完整渲染在折叠分组内。如果它在折叠时仍有副作用(如数据请求),不影响 UX——它只在展开后渲染(AccordionSection 用 `{open && <groupBody>}` 条件渲染)。i18n key `"settings.group.advanced"` 在下一 Task 添加。

- [ ] **Step 2: 编译验证**

Run: `npm run build`
Expected: 编译成功。

- [ ] **Step 3: Commit**

```bash
git add src/webview/settings.tsx
git commit -m "feat: add collapsed advanced/RAG accordion group with embedding options"
```

---
## Task 5: i18n key + 清理 WEBUI_TABS

**Files:**
- Modify: `src/webview/assets/locales/en.json`
- Modify: `src/common/constants/ui.ts`
- Delete: `src/webview/chat.tsx` (及关联样式)

- [ ] **Step 1: 加 i18n key**

在 `src/webview/assets/locales/en.json` 加:

```json
{
  "settings.masterBar.manageProviders": "Manage providers...",
  "back-to-settings": "Back to settings",
  "settings.group.advanced": "Advanced / RAG"
}
```

插入到合适的组区域(advanced 放 `settings.group.templates` 旁边;manageProviders 放 `settings.masterBar.noProvider` 旁边;back-to-settings 放顶层或模板相关旁边)。

- [ ] **Step 2: 清理 WEBUI_TABS**

将 `src/common/constants/ui.ts` 从:

```typescript
export const WEBUI_TABS = {
  chat: "chat",
  history: "history",
  providers: "providers",
  review: "review",
  settings: "templates",
  symmetry: "symmetry",
  embeddings: "embeddings"
}
```

改为:

```typescript
export const WEBUI_TABS = {
  providers: "providers",
  settings: "templates",
  embeddings: "embeddings"
}
```

> **注意:** 修改前 grep 确认 `WEBUI_TABS.chat` / `WEBUI_TABS.history` / `WEBUI_TABS.review` / `WEBUI_TABS.symmetry` 没有被其他文件引用。预期只有 `providers` / `settings` / `embeddings` 被 `main.tsx` 使用。

- [ ] **Step 3: 删除 chat.tsx**

```bash
rm src/webview/chat.tsx
```

- [ ] **Step 4: 检查 `import { EmbeddingOptions }` 没有引用了 `chat.tsx` 的导出**

Run: `grep -rn "from.*chat" src/webview/`
Expected: 无结果(或者只有注释/无用的 import 引用)。

- [ ] **Step 5: JSON 合法性验证**

```bash
node -e "require('./src/webview/assets/locales/en.json'); console.log('valid')"
```
Expected: 打印 `valid`。

- [ ] **Step 6: Commit**

```bash
git add src/webview/assets/locales/en.json src/common/constants/ui.ts src/webview/chat.tsx
git commit -m "feat: add i18n keys, clean up WEBUI_TABS, remove chat.tsx"
```

---
## Task 6: package.json + index.ts — 齿轮改向

**Files:**
- Modify: `package.json`
- Modify: `src/index.ts`
- Modify: `src/extension/providers/base.ts`

- [ ] **Step 1: package.json 移除 view/title 齿轮和 database 图标**

在 `package.json` 的 `viewsContainers/activitybar/fim-sidebar-view` 和 `menus/view/title` 里,移除 `fim.settings` 和 `fim.embeddings` 这两项。(保留 `fim.embeddings` 和 `fim.settings` 的 `commands` 注册——命令仍可从命令面板触发,只是不在标题栏显示图标。)

删除 `menus/view/title` 中:

```json
        {
          "command": "fim.settings",
          "when": "view == fim.sidebar",
          "group": "navigation@4"
        }
```

和:

```json
        {
          "command": "fim.embeddings",
          "when": "view == fim.sidebar",
          "group": "navigation@3"
        }
```

- [ ] **Step 2: index.ts 改 fim.settings 行为**

`src/index.ts:117-122` 从:

```typescript
    commands.registerCommand(FIM_COMMAND_NAME.settings, () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        EXTENSION_NAME
      )
    }),
```

改为:

```typescript
    commands.registerCommand(FIM_COMMAND_NAME.settings, () => {
      vscode.commands.executeCommand("workbench.view.extension.fim-sidebar-view")
    }),
```

这样"Open FIM settings"命令聚焦 FIM 侧边栏(默认 settings tab 展示设置)。

- [ ] **Step 3: base.ts 移除 openSettings handler 和方法**

在 `src/extension/providers/base.ts` 中:

删除第 102 行: `[FIM_COMMAND_NAME.settings]: this.openSettings`

删除第 146-148 行的 `openSettings` 方法:

```typescript
  private openSettings = () => {
    vscode.commands.executeCommand(FIM_COMMAND_NAME.settings)
  }
```

同时从 import 区确认 `FIM_COMMAND_NAME` 是否还被其他代码使用;如果 openSettings 是最后的引用,从 import 移除 `FIM_COMMAND_NAME` 行。但很可能 `FIM_COMMAND_NAME` 还被其他 handler 使用,所以保留 import。

- [ ] **Step 4: 编译验证**

Run: `npm run build`
Expected: 编译成功。

- [ ] **Step 5: Commit**

```bash
git add package.json src/index.ts src/extension/providers/base.ts
git commit -m "feat: redirect settings command to sidebar, remove view-title gear icon"
```

---
## Task 7: 构建 + Lint + 手动验证清单

**Files:** 无(验证步骤)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: 无 error。warning 可接受(不应新增)。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 两个 bundle(extension + webview)编译成功。

- [ ] **Step 3: 手动验证(在 Extension Development Host 里)**

按 `F5` 启动 Extension Development Host,打开 FIM 侧边栏,逐项验证:

1. **默认 tab:** 打开 FIM 侧边栏,默认看到**手风琴设置**界面,不是 providers 管理页
2. **MasterBar 下拉:** 顶部显示 provider 下拉,列出所有已配置的 FIM providers + "Manage providers..."
3. **选 provider:** 下拉切换 provider,`fimProvider` 实际更新
4. **管理 provider:** 下拉选"Manage providers..."→ 跳转到 providers CRUD 子视图,顶部有"← Back to settings"按钮
5. **返回设置:** 点"← Back to settings"回到手风琴设置页
6. **无 provider 状态:** 未配置 FIM provider 时,MasterBar 显示"click to set up"按钮
7. **Advanced/RAG 分组:** 展开"Advanced/RAG"分组,能看到 EmbeddingOptions 内容(或 RAG 配置)
8. **模板分组:** 展开"Templates",模板编辑器 + action 模板勾选功能正常
9. **齿轮命令:** 打开命令面板(Ctrl+Shift+P),搜"Open FIM settings",触发后聚焦 FIM 侧边栏并显示设置页(不打开 VS Code 原生设置)
10. **标题栏图标:** sidebar 标题栏不再有齿轮和 database 图标
11. **chat 已移除:** `chat.tsx` 已删除,无 dangling import
12. **现有功能不改:** 设置项的 toggle/number/select 全部正常工作(与原 SettingsView 一致)

- [ ] **Step 4: 最终 commit(如有 lint 修复)**

```bash
git add -A
git commit -m "style: lint fixes for settings-first redesign" --allow-empty || echo "nothing to commit"
```
