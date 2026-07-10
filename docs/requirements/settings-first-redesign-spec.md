# Settings-First Redesign — 全单页设置首屏 Spec

> **基于:** `docs/config-ux-design.md`(原 Settings Tab 手风琴化) + brainstorming 决策
> **原设计范围:** 保留三 tab、只重做 Settings tab 内部
> **新设计范围:** 去 tab 栏、全单页手风琴设置首屏、provider 下拉 + 子视图

## 1. 最终布局

```
┌──────────────────────────────────┐
│ MasterBar                         │
│ FIM  [codellama:7b ▾]      [ON]  │
│        ─────────────              │
│        codellama:7b    ✓          │
│        gpt-4                     │
│        ─────────────              │
│        管理 provider... →         │
├──────────────────────────────────┤
│ ▼ 补全行为 (默认展开)              │
│   自动触发、延迟、续补、多行、缓存   │
├──────────────────────────────────┤
│ ▶ 模型参数 (默认折叠)              │
│   temperature、max tokens、行数…   │
├──────────────────────────────────┤
│ ▶ 语言与上下文 (默认折叠)           │
│   file context                   │
├──────────────────────────────────┤
│ ▶ 高级 / RAG (默认折叠) NEW       │
│   embeddings 配置               │
├──────────────────────────────────┤
│ ▶ 通用 (默认折叠)                  │
│   locale、logging、storage       │
├──────────────────────────────────┤
│ ▶ 模板 (默认折叠)                  │
│   模板编辑器、action 模板勾选       │
└──────────────────────────────────┘
```

**与原计划的关系:** 原 `config-ux-implementation-plan.md` 已完成的手风琴组件(`SettingsView`、`AccordionSection`、`SettingRow`、`Toggle`、`MasterBar`)全部保留。变化是包裹它们的外层结构从"三 tab → 全单页"。

## 2. 已确认的决策

| 决策 | 结果 | 理由 |
|------|------|------|
| 首屏结构 | **全单页手风琴设置**,去 tab 栏 | "扩展就是代码补全配置,打开即配置" |
| Provider UI | **MasterBar 下拉**选 provider/model,底部"管理 provider..." | "对一个用户 provider 就一个,下拉就行" |
| Provider 子视图 | 现有 providers.tsx 加 "← 返回设置" 按钮,CRUD 不改 | 保持管理能力,首屏极简 |
| Chat | **完全移除**(`chat.tsx`) | 纯代码补全工具,不需要对话 |
| Embeddings / RAG | **折叠"高级"分组**,默认折叠 | 保留功能但不干扰补全配置 |
| 齿轮命令(fim.settings) | 移除 view-title 齿轮图标;保留命令,改发 `fimSetTab` | 首屏已是设置,齿轮开原生设置多余 |
| database 命令 | 移除(`fim.embeddings` view-title 图标) | embeddings 收进分组,不需要独立入口 |

## 3. 组件变更清单

### 3.1 修改(4 处)

| 组件 | 文件 | 变化 |
|------|------|------|
| **MasterBar** | `src/webview/settings/MasterBar.tsx` | 当前静态显示 modelName·label;改为 provider 下拉(选项列表 + "管理 provider...") |
| **main.tsx** | `src/webview/main.tsx` | 去 tab 栏、去默认 tab state;默认直接渲染 `<SettingsView>`;保留 `fimSetTab` 消息处理(provider 子视图 + embeddings 子视图仍用此切换) |
| **SettingsView** | `src/webview/settings/SettingsView.tsx` | 新增"高级/RAG"手风琴分组;模板分组从外层 `settings.tsx` 移进 SettingsView 内部(保持手风琴连贯) |
| **providers.tsx** | `src/webview/providers.tsx` | 顶部加 "← 返回设置"按钮,发 `fimSetTab("templates")`;其余 CRUD 逻辑不改 |

### 3.2 移除(4 处)

| 文件/代码 | 原因 |
|-----------|------|
| `src/webview/chat.tsx` | chat 不要 |
| `src/webview/main.tsx` tab 栏 UI | 全单页,无 tab 切换 |
| `src/common/constants/ui.ts` 清理 `WEBUI_TABS` | 移除 `chat`/`history`/`review`/`symmetry`(未用或不需) |
| `package.json` view/title 齿轮图标 + database 图标 | 命令保留但不再在 sidebar 标题栏暴露 |

### 3.3 保留(不变)

- `src/common/settings-schema.ts` — schema 定义
- `src/webview/hooks/useFimConfig.ts` — 批量配置读写
- `src/webview/settings/AccordionSection.tsx` — 手风琴容器
- `src/webview/settings/SettingRow.tsx` — 设置行
- `src/webview/settings/Toggle.tsx` — 开关
- `src/webview/styles/settings-view.module.css` — 样式
- `src/webview/assets/locales/en.json` — i18n(无需新增 key)
- `src/webview/providers.tsx` CRUD 逻辑 — 子视图内不改

## 4. 数据流

### Provider 下拉选择

```
用户选 provider → MasterBar onChange
  → 调用 useProviders() 的 setFimProvider(selectedProvider)
  → 更新 config.fimProvider → 实际写入 VS Code config
  → MasterBar 显示新选中的 provider/model
```

### "管理 provider..." → provider 子视图

```
用户点 "管理 provider..." → postMessage({ type: "fimSetTab", data: "providers" })
  → extension base.ts setTab → postMessage({ type: "fimSetTab", data: [object Object] })
  → main.tsx 收到 → 渲染 providers tab(即现有 providers.tsx)
  
  providers 子视图的 "← 返回设置" →
  postMessage({ type: "fimSetTab", data: "templates" })
  → main.tsx 收到 → 改回渲染 SettingsView
```

> 注:webview `main.tsx` 收到 `fimSetTab` 消息后,`tabs[message.data]` 查找组件。providers 已存在(`WEBUI_TABS.providers`)。不需新增 tab 路由。

### 齿轮命令改向

```
fim.settings 命令 (命令面板/快捷键触发)
  → 改为 postMessage({ type: "fimSetTab", data: "templates" })
  → 切到 webview 设置页(而不是打开 VS Code 原生 settings)
```

## 5. 边缘情况

- **无 provider:** MasterBar 下拉显示"未配置",下拉选项允许直接进入"管理 provider..."。现有空 provider 状态的处理逻辑不变
- **FIM disabled:** MasterBar toggle 为 OFF,手风琴分组内容不变但灰色且禁用(用现有 `enabled` 配置值)
- **无法构建:** 多数改动是改已有文件的渲染逻辑(数据流不变),最小风险
- **删除 chat.**tsx: 需确认没有其他文件 import 了它的导出(如 `code-block.tsx` 的 `chat.tsx` 引用)。需实际 grep 后移除

## 6. 推动 git 分支

当前分支 `main` 已有原 config-ux 的 8 个 commit(Task 1-9)。新工作直接在 `main` 上继续(未发布,仅本地)。

## 7. 实现顺序

1. `main.tsx` — 去 tab 栏,默认直接渲染 SettingsView
2. `MasterBar.tsx` — 静态文本 → 交互下拉
3. `providers.tsx` — 加"← 返回设置"按钮
4. `SettingsView.tsx` — 内部[高级+RAG]分组 + 模板分组移入
5. `chat.tsx` + `constants/ui.ts` — 删除清理
6. `package.json` — 移除 view-title 齿轮/database 图标命令
7. `index.ts` — 改 fim.settings 命令行为(不再执行 workbench.action.openSettings)
8. Build + 手动验证清单

> 实现细节(task 粒度) 交给 `writing-plans` skill 按此顺序展开。
