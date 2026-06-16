# 配置体验重设计 — Settings Tab 手风琴化

## 1. 背景与目标

当前 FIM 的配置体验有两个痛点：

1. **配置入口割裂** — 20 个设置分散在 VS Code Settings（`Ctrl+,`）里，用户需要离开侧边栏去配置补全行为；而侧边栏的 Settings tab 只管模板。
2. **配置碎片化** — Provider、模板、设置分散在不同地方，配置步骤多。

**目标**：把全部 20 个 VS Code 设置搬到 webview 的 Settings tab，用手风琴（accordion）分组组织，让用户在一个地方完成所有配置。

## 2. 设计范围

**包含**：
- 重做 webview 的 Settings tab，用手风琴分组承载全部 20 个设置
- 模板管理保留在 Settings tab 内
- 旧 Ollama 专属设置标记 deprecated 并在 UI 隐藏

**不包含**（本轮不动）：
- Provider tab 的功能（保持现状）
- Embeddings tab 的功能（保持现状）
- 侧边栏 tab 结构（保持 Settings / Providers / Embeddings 三个 tab）
- FIM 引擎服务端化（属于 PD.md 的后续工作）

## 3. 设置分组

20 个设置按自然语义分为 4 组。图标使用 [codicon](https://microsoft.github.io/vscode-codicons/)。

### 3.1 补全行为（codicon `zap`）
控制补全"何时出现、如何出现"。

| 设置键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `fim.enabled` | boolean | true | 总开关（顶部独立展示，见 §4） |
| `fim.autoSuggestEnabled` | boolean | true | 输入时自动触发，否则需手动 |
| `fim.debounceWait` | number | 300 | 触发延迟（ms） |
| `fim.enableSubsequentCompletions` | boolean | true | 接受后是否继续补全 |
| `fim.multilineCompletionsEnabled` | boolean | true | 是否允许多行补全 |
| `fim.completionCacheEnabled` | boolean | false | 缓存相同上下文的结果 |

### 3.2 模型参数（codicon `target`）
控制模型输出质量和长度。

| 设置键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `fim.temperature` | number | 0.2 | 采样温度 |
| `fim.numPredictFim` | number | 512 | 最大输出 token 数 |
| `fim.maxLines` | number | 40 | 最大输出行数 |
| `fim.contextLength` | number | 100 | 上下文行数 |
| `fim.keepAlive` | string | "5m" | 模型保活时间 |

### 3.3 语言与上下文（codicon `file-code`）
控制哪些文件参与补全。

| 设置键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `fim.enabledLanguages` | object | `{"*": true}` | 启用的语言（key 为 languageId 或 `*`） |
| `fim.fileContextEnabled` | boolean | false | 是否使用相关文件作为上下文 |

### 3.4 通用（codicon `settings-gear`）

| 设置键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `fim.locale` | string | "en" | 界面语言（下拉：13 个 locale） |
| `fim.enableLogging` | boolean | true | 日志开关 |
| `fim.providerStorageLocation` | string | "globalState" | provider 存储方式（globalState / file） |

### 3.5 模板（codicon `note`）
保留原 Settings tab 的模板管理功能（编辑默认模板、勾选 action 模板），作为独立分组放在最底部。

### 3.6 移到 Embeddings tab
- `fim.embeddingIgnoredGlobs` — 语义上属于 embeddings，从设置移到 Embeddings tab。

### 3.7 Deprecated（UI 隐藏，代码保留）
被新 provider 系统取代，UI 不再展示，`package.json` 加 `deprecated` 提示，代码路径保留向后兼容：
- `fim.ollamaHostname`
- `fim.ollamaApiPort`
- `fim.ollamaUseTls`

## 4. UI 设计

### 4.1 布局
```
┌─────────────────────────────────────┐
│ [✓] FIM                    [ON]  │  ← 总开关栏（enabled）
├─────────────────────────────────────┤
│ ▼ [zap]    补全行为                  │  ← 手风琴分组（可展开/折叠）
│   ┌─────────────────────────────┐   │
│   │ 自动触发补全          [ON]   │   │  ← 设置行：标题+说明+控件
│   │ 输入时自动建议                │   │
│   ├─────────────────────────────┤   │
│   │ 多行补全              [ON]   │   │
│   │ ...                         │   │
│   └─────────────────────────────┘   │
├─────────────────────────────────────┤
│ ▶ [target] 模型参数                  │  ← 折叠态
├─────────────────────────────────────┤
│ ▶ [file-code] 语言与上下文           │
├─────────────────────────────────────┤
│ ▶ [settings-gear] 通用               │
├─────────────────────────────────────┤
│ ▶ [note] 模板                        │
└─────────────────────────────────────┘
```

### 4.2 交互规则
- **总开关**：顶部独立展示 `fim.enabled`，使用 toggle，与第一个分组分离。
- **手风琴**：每个分组独立展开/折叠，可同时展开多个。默认全部折叠。
- **设置行**：每行包含标题（12px）、灰色说明（11px, 50% opacity）、控件。控件类型：
  - boolean → toggle（`VSCodeCheckbox` 或自定义 toggle）
  - number → 数字输入框（`VSCodeTextField type="number"`）
  - string 枚举 → `VSCodeDropdown`（locale、keepAlive、providerStorageLocation）
  - object（`enabledLanguages`）→ 简化为 `*` 总开关 + 后续可扩展
- **图标**：所有分组标题左侧用 codicon，无 emoji。
- **i18n**：所有标题和说明走 i18next（`src/webview/assets/locales/`），13 个 locale 文件需补充新 key。

### 4.3 视觉规范
- 复用现有 CSS 变量（`--vscode-*`），与现有 provider/settings 样式一致。
- 分组容器：`border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px`。
- 展开内容：`border-top: 1px solid var(--vscode-editorWidget-border)`。

## 5. 技术实现

### 5.1 组件结构

新增 webview 组件（`src/webview/`）：
- `settings/AccordionSection.tsx` — 可折叠分组容器，props: `title`, `icon`, `defaultOpen`, `children`
- `settings/SettingRow.tsx` — 单个设置行，props: `title`, `description`, `children`（控件）
- `settings/Toggle.tsx` — toggle 开关封装
- `settings/useConfig.ts` — hook，封装读写单个 config 值

重做 `src/webview/settings.tsx`：组合上述组件，渲染 5 个手风琴分组。

### 5.2 数据流

设置读写复用现有的 extension ↔ webview 通信机制（`src/extension/providers/base.ts` 已实现）：

**读取**：
```
webview → postMessage({ type: fimGetConfigValue, key: "debounceWait" })
extension → workspace.getConfiguration("fim").get("debounceWait")
extension → postMessage({ type: fimGetConfigValue, data: 300 })
```

**写入**：
```
webview → postMessage({ type: fimSetConfigValue, key: "debounceWait", data: 350 })
extension → workspace.getConfiguration("fim").update("debounceWait", 350, ConfigurationTarget.Global)
```

`useConfig(key)` hook 封装：内部维护 state，初始化时发读请求，变更时发写请求。响应式更新通过现有 `fimGetConfigValue` 回包实现。

> 注意：现有机制是"一问一答"，写操作无显式回包确认。hook 写入后乐观更新本地 state 即可；若需可靠确认，可在 extension 写入后回包 `fimSetConfigValue`（可选增强）。

### 5.3 已存在的依赖
- `@vscode/webview-ui-toolkit/react`：`VSCodeButton`, `VSCodeCheckbox`, `VSCodeTextField`, `VSCodeDropdown`, `VSCodeOption` 已在用。
- codicon：webview 已通过 `assets/codicon.css` + `codicon.ttf` 引入（见 `providers.tsx` 中 `<i className="codicon codicon-xxx" />` 用法）。
- i18next：`useTranslation` hook 已就绪。

### 5.4 i18n
新增约 30 个翻译 key（分组标题 + 设置标题 + 说明），覆盖 `src/webview/assets/locales/` 下 13 个文件。英文 `en.json` 先填全，其他 locale 可先 fallback 到英文，后续补全。

### 5.5 package.json 调整
- 3 个 Ollama 设置的 `description` 前缀加 `[deprecated]`，提示已被 provider 系统取代。
- 不删除设置定义（保持向后兼容），仅 UI 不展示。
- `embeddingIgnoredGlobs` 的 `scope` 无需改动（仍可在 VS Code Settings 编辑，只是 webview 的展示位置移到 Embeddings tab）。

## 6. 测试

- **单元测试**：`AccordionSection` 展开/折叠状态、`useConfig` hook 的读写消息收发（mock `postMessage`）。
- **手动验证清单**：
  1. 打开 Settings tab，看到总开关 + 5 个折叠分组
  2. 展开各组，控件正确显示当前值
  3. 修改任一设置，验证 `workspace.getConfiguration("fim")` 实际更新
  4. 修改后重启 reload window，值持久化
  5. 切换 locale，标题/说明正确切换
  6. 旧 Ollama 设置不出现在 UI

## 7. 不做的事（YAGNI）
- 不做设置搜索框（设置数量不多，手风琴足够）
- 不做设置导入/导出（provider 已有，设置层面暂不需要）
- 不做设置变更的 diff/撤销
- 不重做 Provider / Embeddings tab
