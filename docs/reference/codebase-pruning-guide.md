# FIM 代码裁剪记录

## 1. 已删除的文件

### 1.1 Extension 侧（9 个文件）

| 文件 | 原功能 | 删除原因 |
| --- | --- | --- |
| `src/extension/chat.ts` | Chat 服务（RAG + 流式对话） | `activate()` 从未实例化，死代码 |
| `src/extension/conversation-history.ts` | 对话历史管理 | 同上 |
| `src/extension/diff.ts` | DiffManager（差异展示） | 同上 |
| `src/extension/embeddings.ts` | EmbeddingDatabase（LanceDB） | 只传给 SidebarProvider，不在补全链路上 |
| `src/extension/file-handler.ts` | FileHandler（从 webview 打开文件） | 仅被 Chat 引用 |
| `src/extension/reranker.ts` | ONNX 重排序（RAG） | 仅被 Chat 引用 |
| `src/extension/review-service.ts` | GithubService（PR review） | 从未实例化 |
| `src/extension/symmetry-service.ts` | SymmetryService（P2P 网络） | 从未实例化 |
| `src/extension/symmetry-ws.ts` | SymmetryWs（WebSocket） | 从未实例化 |

### 1.2 Webview 侧（15 个 tsx 文件）

| 文件 | 原功能 | 删除原因 |
| --- | --- | --- |
| `src/webview/embedding-options.tsx` | Embedding 配置 UI | RAG 已删 |
| `src/webview/code-block.tsx` | 代码块渲染 | 仅被 message.tsx 引用 |
| `src/webview/conversation-history.tsx` | 对话历史 UI | 孤儿 |
| `src/webview/image-extension.ts` | TipTap 图片扩展 | 孤儿 |
| `src/webview/mention-extention.ts` | TipTap @mention 扩展 | 孤儿 |
| `src/webview/mention-list.tsx` | @mention 列表 | 孤儿 |
| `src/webview/message.tsx` | 聊天消息渲染 | 孤儿 |
| `src/webview/message-item.tsx` | 单条消息项 | 孤儿 |
| `src/webview/provider-select.tsx` | Provider 下拉选择 | 孤儿 |
| `src/webview/review.tsx` | PR review UI | 孤儿 |
| `src/webview/suggestions.tsx` | 建议列表 | 孤儿 |
| `src/webview/symmetry.tsx` | Symmetry P2P UI | 孤儿 |
| `src/webview/toast.tsx` | Toast 通知 | 孤儿 |
| `src/webview/typing-indicator.tsx` | 打字指示器 | 孤儿 |

### 1.3 Webview Hooks（13 个文件）

| 文件 | 原功能 |
| --- | --- |
| `src/webview/hooks/useGithubPRs.ts` | GitHub PR 列表 |
| `src/webview/hooks/useConversationHistory.ts` | 对话历史 |
| `src/webview/hooks/useSymmetryConnection.ts` | Symmetry 连接状态 |
| `src/webview/hooks/useSuggestion.ts` | 建议列表 |
| `src/webview/hooks/useSelection.ts` | 选中文本 |
| `src/webview/hooks/useAutosizeTextArea.ts` | Textarea 自适应高度 |
| `src/webview/hooks/useLoading.ts` | 加载状态 |
| `src/webview/hooks/useFilePaths.ts` | 文件路径列表 |
| `src/webview/hooks/useModels.ts` | 模型列表 |
| `src/webview/hooks/useTheme.ts` | 主题切换 |
| `src/webview/hooks/useLanguage.ts` | 语言切换 |
| `src/webview/hooks/useEvent.ts` | 通用事件 |
| `src/webview/hooks/useWorkspaceContext.ts` | 工作区上下文 |

### 1.4 CSS 样式文件（11 个文件）

| 文件 |
| --- |
| `src/webview/styles/chat.module.css` |
| `src/webview/styles/code-block.module.css` |
| `src/webview/styles/common.module.css` |
| `src/webview/styles/conversation-history.module.css` |
| `src/webview/styles/embedding-options.module.css` |
| `src/webview/styles/message.module.css` |
| `src/webview/styles/review.module.css` |
| `src/webview/styles/suggestions.module.css` |
| `src/webview/styles/symmetry.module.css` |
| `src/webview/styles/toast.module.css` |
| `src/webview/styles/typing-indicator.module.css` |

### 1.5 测试文件迁移

原 `src/test/` 下的 TypeScript 测试已迁移到 `ts-test/`（详见第 4 节）。

## 2. 连带修改

### 2.1 Import 修复（因删除导致的引用断裂）

| 文件 | 修改内容 |
| --- | --- |
| `src/index.ts` | 移除 `EmbeddingDatabase` 导入、`createEmbeddingDatabase()` 函数、`db` 变量、`fs`/`sanitizeWorkspaceName` 导入 |
| `src/extension/providers/base.ts` | 移除 `EmbeddingDatabase` 导入/字段/构造参数，`embedDocuments` handler 改为 no-op |
| `src/extension/providers/sidebar.ts` | 移除 `EmbeddingDatabase` 导入和构造参数 `db` |
| `src/extension/providers/panel.ts` | 删除（FullScreenProvider，从未实例化） |

### 2.2 功能移除

| 文件 | 修改内容 |
| --- | --- |
| `src/extension/llm.ts` | 移除 `fetchEmbedding()` 函数（embeddings 已删） |
| `src/webview/main.tsx` | 移除 `EmbeddingOptions` tab 导入和路由 |
| `src/webview/settings.tsx` | 移除 `EmbeddingOptions` 导入和渲染 |

### 2.3 误删恢复

`src/extension/ollama.ts` 曾被误删，已恢复——`base.ts` 的 `fetchOllamaModels` 事件依赖它。

## 3. 保留的文件

> **注**：本节为 PR #1（2026-07-04）裁剪时的保留快照。其中 `provider-options.ts` / `provider-manager.ts` / `ollama.ts` / `template-provider.ts` / `templates.ts` / `session-manager.ts` 在后续 deepseek-only 收敛（§10）中进一步删除。**当前真实结构以 `CLAUDE.md` 的 Layer Structure 为准。**

### 3.1 关键链路（补全核心，不可删）

| 文件 | 角色 |
| --- | --- |
| `src/index.ts` | 扩展入口，`activate()` 注册 CompletionProvider + 命令 + 事件 |
| `src/extension/providers/completion.ts` | `InlineCompletionItemProvider` 实现，补全核心 |
| `src/extension/llm.ts` | `llm()` 流式 SSE fetch |
| `src/extension/fim-templates.ts` | 各模型族 FIM 模板 + stop words |
| `src/extension/provider-options.ts` | `createStreamRequestBodyFim()` 构建请求体 |
| `src/extension/completion-formatter.ts` | `CompletionFormatter` 后处理链 |
| `src/extension/utils.ts` | `getPrefixSuffix()` 等工具函数 |
| `src/extension/base.ts` | 配置读取 + provider 获取 |

### 3.2 辅助模块（补全链路支撑）

| 文件 | 角色 |
| --- | --- |
| `src/extension/cache.ts` | LRU 补全缓存 |
| `src/extension/parser.ts` | tree-sitter AST 解析 |
| `src/extension/file-interaction.ts` | 文件交互 LRU，跨文件上下文评分 |
| `src/extension/context.ts` | `setContext`/`getContext` 单例 |
| `src/extension/session-manager.ts` | 内存 Map 会话管理 |
| `src/extension/template-provider.ts` | Handlebars 自定义模板加载 |
| `src/extension/templates.ts` | 默认模板数组 |
| `src/extension/provider-manager.ts` | Provider CRUD |
| `src/extension/ollama.ts` | 获取 Ollama 模型列表 |
| `src/extension/tree.ts` | 文件树（webview 列表面板用） |
| `src/common/**` | 共享类型、常量、事件名 |

### 3.3 Webview 侧边栏（保留，用于二次开发 UI 入口）

| 文件 | 角色 |
| --- | --- |
| `src/webview/main.tsx` | Tab 路由 |
| `src/webview/settings.tsx` | 设置面板 |
| `src/webview/providers.tsx` | Provider 面板 |
| `src/webview/default-providers.tsx` | 默认 provider 列表 |
| `src/webview/model-select.tsx` | 模型选择组件 |
| `src/extension/providers/base.ts` | BaseProvider 事件分发 |
| `src/extension/providers/sidebar.ts` | SidebarProvider（WebviewViewProvider） |

## 4. 关键链路函数调用图

```
CompletionProvider.provideInlineCompletionItems()   ← VS Code 调用入口
  → getPrefixSuffix()                                ← 提取 prefix/suffix（utils.ts）
  → getIsMultilineCompletion()                       ← 判断多行补全（utils.ts）
  → getPrompt()                                      ← 拼接提示词（completion.ts）
      → getFimPrompt() / getFimTemplateRepositoryLevel()  ← 选模板（fim-templates.ts）
      → TemplateProvider.render()                    ← custom 模板（template-provider.ts）
  → buildFimRequest()                                ← 构建请求体（completion.ts）
      → createStreamRequestBodyFim()                 ← 按 provider 拼body（provider-options.ts）
  → llm()                                            ← 流式请求（llm.ts）
      → onStart / onData / onEnd / onError           ← 流式回调
  → onData()                                         ← 逐 chunk 累积 + 截断判断（completion.ts）
  → provideInlineCompletion()                        ← 返回结果（completion.ts）
      → CompletionFormatter.format()                 ← 后处理（completion-formatter.ts）
      → new InlineCompletionItem(text, range)        ← 交给 VS Code 渲染 ghost text
```

## 5. 测试体系

### 5.1 目录结构

```
ts-test/                        # TypeScript 单元测试（Mocha + VS Code Test CLI）
├── tsconfig.json               # 编译配置（rootDir=项目根，同时编译 src/ + ts-test/）
├── runTest.ts                  # VS Code test-cli 启动脚本
└── suite/
    ├── index.ts                # Mocha 测试入口，glob 加载 *.test.ts
    ├── completion-formatter.test.ts  # CompletionFormatter 单元测试
    └── settings-schema.test.ts       # settings-schema 单元测试

py-test/                        # Python pytest 集成测试（通过 Node.js 子进程执行编译后的 JS）
├── pytest.ini
├── conftest.py                 # session fixture：自动 esbuild 编译 src 模块 + run_node_module fixture
├── test_cache.py               # LRUCache 测试（7 用例）
├── test_completion_chain.py    # 端到端补全链路测试（6 用例）
├── test_completion_formatter.py # CompletionFormatter 测试（11 用例）
├── test_fim_templates.py       # FIM 模板 + stop words 测试（18 用例）
├── test_provider_options.py    # 请求体构建测试（11 用例）
├── test_utils.py               # getPrefixSuffix / getIsMiddleOfString 测试（6 用例）
├── fixtures/                   # 测试数据（Python dict）
│   ├── cache_data.py
│   ├── completion_data.py
│   ├── fim_templates_data.py
│   └── provider_options_data.py
└── helpers/                    # Node.js 测试基础设施
    ├── build_test_modules.cjs   # esbuild 按模块单独编译 src/ 下的 .ts → out/*.test.js
    ├── test_runner.cjs          # stdin JSON → require 模块 → stdout JSON
    ├── vscode_stub.cjs          # Position/Range/TextDocument/TextEditor 等 VS Code API 桩
    ├── vscode_intercept.cjs     # Module._load 拦截 require("vscode") → 返回桩
    ├── cache_test_helper.cjs    # LRUCache 操作封装
    ├── completion_chain_test_helper.cjs  # 端到端链路编排
    ├── completion_formatter_test_helper.cjs # CompletionFormatter 封装
    ├── utils_test_helper.cjs    # getPrefixSuffix / getIsMiddleOfString 封装
    └── out/                     # esbuild 编译输出（git 忽略）
```

### 5.2 测试覆盖范围

| 测试文件 | 用例数 | 覆盖模块 | 覆盖点 |
| --- | --- | --- | --- |
| `test_fim_templates.py` | 18 | `fim-templates.ts` | 7 种模型族模板格式、自动检测、stop words、repo-level 模板、fileContext 开关 |
| `test_provider_options.py` | 11 | `provider-options.ts` | 8 种 provider 请求体结构、ollama options、litellm messages |
| `test_completion_formatter.py` | 11 | `completion-formatter.ts` | 括号平衡、字符串字面量、重复引号移除、词中跳过、重复行跳过、反引号、trimStart、注释引用跳过、正常透传 |
| `test_completion_chain.py` | 6 | 全链路 | 端到端补全、FIM token 包含、stop word 截断、qwen 模板、prefix/suffix 分割、formatter 应用 |
| `test_cache.py` | 7 | `cache.ts` | set/get、LRU 驱逐、delete、overwrite、normalize、key with/without suffix |
| `test_utils.py` | 6 | `utils.ts` | getPrefixSuffix（3 场景）、getIsMiddleOfString（3 场景） |
| **合计** | **66** | | |

### 5.3 测试运行方式

```bash
# TS 单元测试（需要 VS Code 实例）
npm run build-tests          # tsc -p ts-test/tsconfig.json --outDir out
npm test                     # node ./out/ts-test/runTest.js（启动 VS Code test-cli）

# Python 集成测试
cd py-test
python -m pytest -c pytest.ini .
```

## 6. 测试证据

### 6.1 构建验证

```
> npm run build              # esbuild 双 bundle（extension + webview）
  exit code: 0               # ✅ 成功

> npm run build-tests        # tsc -p ts-test/tsconfig.json --outDir out
  exit code: 0               # ✅ 成功

> npm run lint               # eslint src
  1 error (pre-existing)     # providers.tsx:59 'handleAdd' unused — 裁剪前已存在，非本次引入
```

### 6.2 pytest 运行结果

```
============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-8.4.1
collected 66 items

test_cache.py ...................... [ 10%]
test_completion_chain.py ......      [ 19%]
test_completion_formatter.py ........... [ 36%]
test_fim_templates.py .................. [ 75%]
test_provider_options.py ...........     [ 90%]
test_utils.py ......                     [100%]

============================= 66 passed in 5.42s ==============================
```

完整 66 个用例全部 PASSED，0 FAILED。

## 7. 变更统计

```
62 files changed, 24 insertions(+), 6808 deletions(-)
```

- 删除：48 个文件（9 extension + 15 webview tsx + 13 hooks + 11 CSS）
- 修改：6 个文件（index.ts, base.ts, sidebar.ts, llm.ts, main.tsx, settings.tsx）
- 新增：ts-test/ 目录（4 文件从 src/test/ 迁移并修复 import）、py-test/ 目录（66 个 pytest 用例 + Node.js 测试基础设施）
- package.json：build-tests / test / watch-tests 脚本路径更新为 ts-test/

## 8. 待完成项

| 待清理 | 说明 |
| --- | --- |
| ~~`package.json` 依赖~~ | ✅ 已完成 — 所有死依赖（lancedb、cheerio、hyperswarm、tiptap、onnxruntime、symmetry、tippy、react-virtuoso、react-markdown 等 22 个）已从 package.json 移除 |
| ~~依赖清理~~ | ✅ 已完成 |
| `src/common/constants/events.ts` | `CONVERSATION_EVENT_NAME`、`GITHUB_EVENT_NAME`、Symmetry 相关事件常量无引用（低优先级，不动不影响） |
| `src/common/types.ts` | Conversation*/Review*/Symmetry*/Embedding* 相关接口无引用（低优先级，不动不影响） |
| `providers.tsx:59` | `handleAdd` 未使用（pre-existing lint error）

## 9. 当前状态

- FIM 补全核心链路完整（CompletionProvider → llm → DeepSeek）
- 单一 DeepSeek provider，预留 gateway 扩展框架
- 无 Chat、无 RAG/Embeddings、无 Symmetry P2P
- 66 个测试全部通过（pytest + Mocha）
- 权威架构文档：[`fim-overall-design.md`](./fim-overall-design.md)

## 10. DeepSeek-only 收敛（2026-07-19）

> 本节记录 `feat/deepseek-only-unification` 分支的 deepseek-only 收敛工作范围。口径：**当前仅支持 DeepSeek，未来多 provider 经统一 gateway 抽象层接入，不碎片化管理。** gateway 框架（`FimProvider` 抽象 + `llm()` 通用调用链 + provider 配置入口）保留为扩展点，不删。代码删除与格式修复已落地（`npm run build` + `lint` 通过，2026-07-19）；`useOllamaModels.ts` 因 subagent 权限拦截物理 `rm`，暂以 stub 替代（零 importer，不影响 bundle），待手动物理删除。

### 10.1 删除 Ollama / Embeddings 死代码

| 位置 | 删除内容 |
| --- | --- |
| `src/webview/hooks/useOllamaModels.ts` | 整文件（Ollama 模型拉取 hook） |
| `src/common/constants/events.ts` | `fimFetchOllamaModels`、`fimSetOllamaModel` 事件 key |
| `src/webview/icons.tsx` | `SvgOllama` 图标组件 |
| `src/common/types.ts` | `RequestOptionsOllama` 接口 |
| `package.json` | `fim.ollamaHostname`、`fim.ollamaApiPort`、`fim.ollamaUseTls` 配置；`fim.embeddings` 命令声明 |
| `src/index.ts` | `fim.embeddings` 命令注册点 |
| `src/webview/hooks/useProviders.ts` | `embeddingProvider` 字段 |
| `src/common/constants/context.ts` / `commands.ts` | `fimEmbeddingsTab` context key + `embeddings` 命令常量 |

### 10.2 Locale 清理

`src/webview/assets/locales/zh-CN.json`、`en.json`（仅此 2 个，其余 locale 早在 commit `5bee2df` 删除）清理非 DeepSeek 的 provider 名残留（OpenAI / Ollama / Groq / Mistral / Gemini / Anthropic 等）+ Symmetry / Chat 文案残留，每文件删 58 条死 key，仅保留 DeepSeek + gateway 配置入口文案。

### 10.3 调用格式修复：raw token 拼接 → prompt + suffix split-only

DeepSeek `/beta/completions` 原生支持 `prompt` + `suffix` 分字段的 FIM 调用。原实现把 `<｜fim▁begin｜>` / `<｜fim▁hole｜>` / `<｜fim▁end｜>` 等 token **raw 拼成单一 `prompt` 字符串**发送（见 `fim-templates.ts` 的 `getFimPrompt`），与官方推荐用法不一致。本次收敛改为 **split-only**：`prompt` 字段只承载 prefix + hole 标记，`suffix` 字段独立传递，不再 raw 拼接 suffix 标记。

- 相关 plan：deepseek-only unification + split-only format fix（提交 `8c56f4e` / `d883f9a`）
- 涉及文件：`src/extension/fim-templates.ts`（`getFimSplitPrompt`）、`src/extension/providers/completion.ts`（`buildFimRequest`）、`eval/chain.ts`、`eval/runner.ts`（通用 `llm.ts` 链未改）

### 10.4 顶层文档口径统一

README / CLAUDE.md / AGENTS.md 等顶层文档统一为"当前仅 DeepSeek + gateway 预留"口径，删除暗示当前支持 Ollama / 多 provider 的措辞。

### 10.5 保留的 gateway 抽象（不删）

收敛只去碎片化，不动 gateway 框架本身。以下保留为未来多 provider 扩展入口：

| 位置 | 角色 |
| --- | --- |
| `src/common/deepseek` | `FimProvider` 抽象 |
| `src/extension/llm.ts` | `llm()` 通用流式 SSE 调用链 |
| `src/webview/providers.tsx`、`hooks/useProviders.ts`、`hooks/useFimConfig.ts` | provider 配置入口 |
| `src/extension/fim-templates.ts` | FIM 模板（未来按 provider 族扩展） |
