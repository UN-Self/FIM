# 全面重命名 twinny → FIM — 设计文档

## 1. 目标

把整个扩展从 "twinny" 品牌全面重命名为 "FIM"，覆盖：用户可见品牌名、config 命名空间、命令、webview/视图 ID、事件名、内部标识符、用户数据目录、locale 品牌串、资源文件。

**策略：净断（clean break）** —— 不读取/迁移旧 `twinny.*` 设置，不迁移 `~/.twinny/` 数据。现有用户升级后需重新配置（已确认）。

**为什么先做这个：** Settings 重设计计划到处引用 `twinny.*` 命名空间；先完成改名，Settings 计划就能一次写对成 `fim.*`，避免返工。

## 2. 改名映射总表

三个大小写形态都要处理：
| 旧 | 新 | 出现位置 |
|---|---|---|
| `twinny` (小写) | `fim` | config 键、命令、事件字符串值、目录名、代码标识符 |
| `Twinny` (首字母大写) | `FIM` | 显示名、命令标题、locale 品牌串 |
| `TWINNY` (全大写) | `FIM` | 常量名（如 `TWINNY`、`TWINNY_COMMAND_NAME`） |

## 3. 改动分类

### 3.1 用户可见身份（`package.json`）

| 字段 | 旧 | 新（默认） |
|---|---|---|
| `name` | `twinny` | `fim` |
| `displayName` | `twinny - AI Code Completion` | `FIM - AI Code Completion` |
| `publisher` | `rjmacarthy` | **待定**（fork 身份，见 §6） |
| `description` | `Locally hosted AI code completion plugin for vscode` | 保持或微调 |
| `repository.url` | `https://github.com/twinnydotdev/twinny` | **待定**（你的 fork 仓库） |
| `version` | `3.23.31` | 保持或重置为 `0.1.0`（**待定**） |

### 3.2 Config 命名空间（20 设置 + 读取调用）

`package.json` 的 `contributes.configuration.properties`：所有 `"twinny.X"` → `"fim.X"`（35 处标识符中的 20 个设置）。

代码：`workspace.getConfiguration("twinny")` → `workspace.getConfiguration("fim")`（11 处调用，分布在 `base.ts`、`providers/base.ts`、`index.ts` 等）。

净断意味着：不保留 `getConfiguration("twinny")` 的回退读取。

### 3.3 命令（`package.json` + `commands` 注册）

`package.json` 的 `contributes.commands` 和 `activationEvents`：所有 `twinny.X` → `fim.X`。
- `twinny.enable` → `fim.enable`（标题 "Enable twinny" → "Enable FIM"）
- `twinny.disable` → `fim.disable`
- `twinny.sidebar` → `fim.sidebar`
- `twinny.settings` → `fim.settings`
- `twinny.stopGeneration` → `fim.stopGeneration`
- `twinny.manageProviders` → `fim.manageProviders`
- `twinny.manageTemplates` → `fim.manageTemplates`
- `twinny.embeddings` → `fim.embeddings`
- ...（其余命令同理）

代码里的 `TWINNY_COMMAND_NAME` 常量值随之改。

### 3.4 Views / Webview ID

`package.json` 的 `contributes.views`：
- 容器 id `twinny-sidebar-view` → `fim-sidebar-view`
- webview id `twinny.sidebar` → `fim.sidebar`
- 视图 name `"twinny"` → `"FIM"`
- contextualTitle `"twinny"` → `"FIM"`
- icon `assets/twinny.svg` → `assets/fim.svg`（见 3.9）

代码：`window.registerWebviewViewProvider("twinny.sidebar", ...)` → `"fim.sidebar"`。

### 3.5 事件名（`src/common/constants/events.ts`）

**常量名** + **字符串值** 都改（两者都是内部协议，净断可安全全改）：
- `EVENT_NAME.twinnyChat` → `EVENT_NAME.fimChat`，值 `"twinny-chat"` → `"fim-chat"`
- 全部 ~57 个 `twinnyXxx` 常量同理
- `PROVIDER_EVENT_NAME`、`CONVERSATION_EVENT_NAME`、`GITHUB_EVENT_NAME` 里的 `"twinny.xxx"` 值 → `"fim.xxx"`

webview ↔ extension 两边引用同一常量，编译期保证一致，无运行时风险。

### 3.6 内部标识符

`src/common/constants/` 里的：
- `EXTENSION_NAME`（值 `"twinny"`）→ `"fim"`
- `TWINNY` 常量 → `FIM`
- `TWINNY_COMMAND_NAME` → 值改 `fim.*`，常量名可保留或改 `FIM_COMMAND_NAME`（**建议改，保持一致**）
- `EXTENSION_CONTEXT_NAME.twinnyXxx` → `.fimXxx`
- 各 `STORAGE_KEY`、`GLOBAL_STORAGE_KEY` 里含 twinny 的

### 3.7 用户数据目录

`src/index.ts`：
- `path.join(os.homedir(), ".twinny/templates")` → `".fim/templates"`
- `path.join(os.homedir(), ".twinny/embeddings")` → `".fim/embeddings"`

净断：不检测/迁移旧 `~/.twinny/`。

### 3.8 Locale 品牌串（13 个 JSON）

`src/webview/assets/locales/*.json` 里所有 `"Twinny"` → `"FIM"`（品牌名出现在 UI 文案、欢迎语、状态提示等）。

> 注意：只改品牌名 "Twinny"，不改其他翻译内容。

### 3.9 资源文件

- `assets/twinny.svg` → 重命名为 `assets/fim.svg`（内容可保持或换成 FIM logo）
- `assets/twinny.png`（如有）→ `fim.png`
- `package.json` icon 引用同步改
- `assets/icon.png`（扩展图标）评估是否替换

### 3.10 文档

- `CLAUDE.md`：把 "twinny" 描述改 "FIM"（项目概述段）
- `README.md`（若存在）：更新
- `docs/providers.md`：更新示例
- `docs/PD.md`：已用 FIM，无需改
- `docs/config-ux-design.md` + `docs/config-ux-implementation-plan.md`：这些是 Settings 工程的文档，**改名后**更新其中的 `twinny.*` → `fim.*`（作为 Settings 工程启动前的修订步骤）

## 4. 执行方法

711 处出现，按**令牌精确替换 + 分层验证**：

1. **先 package.json**（schema：config 键、命令、views、activationEvents、identity 字段）
2. **再常量文件**（`src/common/constants/*`：事件名、命令名、扩展名常量）—— 这是枢纽，改完编译器会标出所有引用错误
3. **借编译器驱动**：改完常量后 `npm run build`，TS 会列出所有引用旧常量名的位置，逐个修
4. **字符串值批量替换**：剩余的 `"twinny"` 字面量（路径、getConfiguration 参数等）用脚本精确替换
5. **locale 品牌串**：13 个 JSON 里 `Twinny` → `FIM`
6. **资源文件重命名**
7. **文档**

**替换粒度注意事项**：
- 用词边界避免误伤（如不误改 `twinnydotdev` 这类 —— 但那在 repository url 里，属于 §3.1 待定字段，单独处理）
- 大小写三种形态分别替换：`twinny`→`fim`、`Twinny`→`FIM`、`TWINNY`→`FIM`
- 现有代码已有 `FIM`（如 `ACTIVE_FIM_PROVIDER_STORAGE_KEY`、fim provider 概念），**不触碰**这些（它们不是品牌 twinny）

## 5. 验证

1. **残留扫描**：`grep -riI "twinny" src assets package.json` 排除构建产物后应为 **0** 结果（大小写不敏感）
2. **编译**：`npm run build` 两个 bundle 成功，无 TS 错误
3. **Lint**：`npm run lint` 无新增 error
4. **手动启动**：F5 启动 Extension Host：
   - 侧边栏视图名显示 "FIM"
   - 命令面板搜 "FIM" 能找到 Enable/Disable/Settings 等命令
   - 首次启动在 `~/.fim/templates` 创建模板（不再用 `~/.twinny`）
   - VS Code Settings 里搜 "fim" 能找到全部 20 个设置（不再是 "twinny"）
   - 配置一个 provider，触发补全，正常工作
5. **单元测试**：`npm run build-tests && node ./out/test/runTest.js` 通过（completion-formatter 测试不涉及品牌名，应仍通过）

## 6. 身份字段（完全脱离旧项目）

全部换成你的身份，移除任何对 rjmacarthy / twinnydotdev 的引用：

| 字段 | 旧 | 新 |
|---|---|---|
| `name` | `twinny` | `fim` |
| `displayName` | `twinny - AI Code Completion` | `FIM - AI Code Completion` |
| `publisher` | `rjmacarthy` | `UN-Self`（匹配仓库 owner；发布到 marketplace 时可改） |
| `author` | `{ name: "rjmacarthy" }` | `{ name: "HandyWote", email: "18666119673@163.com" }` |
| `repository.url` | `https://github.com/twinnydotdev/twinny` | `https://github.com/UN-Self/FIM` |
| `version` | `3.23.31` | `0.1.0`（新项目重置） |
| `description` | `Locally hosted AI code completion plugin for vscode` | `FIM — locally hosted AI code completion engine` |
| `keywords` | 含 `"twinny"` | 删 `"twinny"`，加 `"fim"`、`"fill-in-the-middle"` |

**资源 logo**：现有 `twinny.svg` / `twinny.png` 重命名为 `fim.svg` / `fim.png`（断开文件名关联）。**注**：logo 视觉设计本身保留原样（设计新 logo 是独立的创意工作，不在机械改名范围）；`icon.png`（marketplace 扩展图标）同理保留视觉，仅确保无 brand 字符串残留。若你要换新 FIM logo，作为后续单独任务。

## 7. 不做的事（YAGNI）

- 不做旧数据迁移（净断已确认）
- 不保留 `twinny.*` 配置回退读取
- 不动 `docs/PD.md`（已是 FIM）
- 不改 git 历史或 remote 配置
- 不发布到 marketplace（除非你要求）
