# FIM DeepSeek-only 收敛 + 调用格式修复计划

> **统一口径**：FIM 当前仅支持 DeepSeek。架构保留 gateway（`FimProvider` 抽象 + `llm` 通用调用链 + provider 配置入口），未来可经 gateway 扩展，不碎片化管理。
> **执行**：逐 Task 实现，每 Task 实现后 review。

## 背景

本次工作合并两个相互强化的目标：

**A. 口径统一**：项目已决定 deepseek-only（`docs/providers.md` 早声明"MVP 仅 DeepSeek，未来走 gateway"），但只有该处跟上。README / CLAUDE.md / locale（13 语言）/ package.json / 死代码仍是"15+ providers / Ollama / 任意 OpenAI 兼容"旧口径 → 文档与代码长期不符 = "乱"。

**B. 调用格式修复**：DeepSeek FIM 调用格式错——`getFimPrompt` 把 `<｜fim▁begin｜>…<｜fim▁hole｜>…<｜fim▁end｜>` 拼成 raw 字符串塞进 `prompt`，不用 `suffix` 字段 → DeepSeek `/beta/completions` 不识别 FIM token，当普通续写 → 补全质量差（import / 函数体等需填 hole 的场景废）。

**两者交集 = 简化**：deepseek-only 口径下，DeepSeek 是唯一 provider 且支持 `suffix` → 格式修复**无需 split/raw 双模式、无需多端点调研**，直接 **split-only**（`prompt`+`suffix` 分开），比原计划更简单。

### 格式 bug 实测铁证（2026-07-19，同题两种出法）

| 题 | 当前（raw 拼 token） | 官方（prompt+suffix 分开） |
|---|---|---|
| `import { ` | `<p>\nThese include the works on the left...`（乱码 HTML） | `memo } from 'react'\n\nexport default memo(...)`（完美） |
| `function add(a,b){\n  ` | `}\n</>`（乱码） | `return a + b;\n}\nmodule.exports = add;`（完美） |

### 影响范围

- 生产 `src/extension/providers/completion.ts:98-120` `buildFimRequest`：body `{ max_tokens, model, prompt, stream, temperature }`，prompt 含拼好 token，无 suffix。
- eval `eval/chain.ts:103-109`：同格式（抄自生产）。
- → 不止 eval，生产 FIM 对 DeepSeek 一直用错格式。

> 之前一轮分析曾误判"deepseek-chat 模型能力边界"，**已推翻**——是调用格式错，不是模型笨。

## 关键事实（2026-07-19 核查）

- `providers.tsx` / `provider-form.ts` **已是 DeepSeek 单配置表单**（endpoint/key/model 三字段）→ UI 改动 ≈ 0。
- gateway 实体 = `FimProvider` 接口 + `llm.ts` + `deepseek.ts` + providers.tsx 配置入口 → **全保留**。
- `fim.embeddingIgnoredGlobs` 被 `utils.ts:708` + `completion.ts:322` 复用为文件 ignore → **保留**（仅改 description 去 embedding 字样）。
- 死代码（全零调用方，安全删）：`useOllamaModels.ts`、events.ts 的 `fimFetchOllamaModels`/`fimSetOllamaModel`、icons.tsx 的 `SvgOllama`、types.ts 的 `RequestOptionsOllama`、`fim.ollamaHostname/ollamaApiPort/ollamaUseTls` 配置、`fim.embeddings` 命令（指向已删的 embeddings tab）。
- `src/extension/ollama.ts`、`provider-options.ts` 均已不存在（`focus-on-completion-only` 收敛成果）。

## Tasks

### Phase 1 — 调用格式修复（split-only）

- [ ] **T1: fim-templates.ts 加 split 模式**
  - 新增 `getFimSplitPrompt(args: FimPromptTemplate)` 返回 `{ prompt: string, suffix: string }`：复用 `getFileContext`，`fileContext` + `heading` 留 `prompt` 侧（属光标前），`suffix` = `prefixSuffix.suffix`。
  - `suffix` nullable：行尾补全（suffix 空）时 prompt = 纯前缀 + fileContext + heading、suffix = ""，仍走 FIM，不退化成普通续写。
  - split-only：`getFimPrompt`（raw 拼 token）不再用于请求构建；若 `getFimTemplateRepositoryLevel` 仍依赖拼 token，一并改 split（见 T2）。

- [ ] **T2: completion.ts buildFimRequest 走 split**
  - `completion.ts:98-120`：body 加 `suffix` 字段，`prompt` 传 `getFimSplitPrompt` 的纯前缀（含 fileContext/heading）。不再拼 FIM token。
  - **repositoryLevel 路径**（`getPrompt` line ~480 → `getFimTemplateRepositoryLevel`，同样拼 token）一并 split 化，避免默认路径与 repo 级路径格式不一致。
  - 小步改 + F5 验证。

- [ ] **T3: chain.ts(eval) 走 split + 类型扩展**
  - `chain.ts:103-109` 同 T2 逻辑。eval 只测 DeepSeek → 走 split。
  - `ChainArtifacts.prompt` 类型 `{ prompt: string; stopWords: string[] }` → `{ prompt: string; suffix: string; stopWords: string[] }`，reports 渲染层同步（grep `artifacts.prompt` / `prompt.prompt`）。

### Phase 2 — 文档统一（对齐"统一口径"那句）

- [ ] **T4: README.md + README.zh-CN.md**
  - 删"自带模型 / Ollama / 任意 OpenAI 兼容 / Anthropic / Mistral / Groq / Gemini / vLLM"话术 → "当前支持 DeepSeek；gateway 预留扩展"。
  - slogan "Stop guessing. Start conducting." **不变**。自托管精确化：扩展无遥测 / 数据不出机器 / 你掌控 key（不等于必须本地模型）。

- [ ] **T5: CLAUDE.md + AGENTS.md**
  - "15+ AI providers (Ollama, OpenAI, Anthropic…)" → "DeepSeek（MVP）；gateway 预留扩展"。Project Overview / Provider System 段同步。

- [ ] **T6: docs/ 内一致性**
  - `providers.md`：已是目标口径，微调。
  - `fim-overall-design.md`：§"default paths follow DeepSeek and OpenAI-compatible" 措辞调整。
  - `codebase-pruning-guide.md`：追加本次收敛记录。
  - `灵魂不能外包.md`：**不动**（自托管 / 反遥测哲学根，与 deepseek-only 不冲突）。

- [ ] **T7: PD.md + PD-supplement.md 加 MVP 锚点**
  - **保留**（gateway / 多 provider 设计来源），开头加"当前 MVP 仅 DeepSeek"锚点，避免误读为现在就支持 Ollama / vLLM。

### Phase 3 — locale + package.json + 死代码清理

- [ ] **T8: locale（en/zh-CN 2 文件）删死 key**
  - 删：非 DeepSeek provider 名（`providers-anthropic/cohere/gemini/groq/mistral/ollama/openai/openai-compatible/openrouter/perplexity/fim-name`）+ Symmetry/chat 残留（`symmetry-*` / `chat-provider` / `chat-connected-to-provider` …）+ ollama 专项（`applicable-ollama` / `ollama-connection-failed`）。
  - 保留：`provider.config.*`（providers.tsx 在用）+ 通用 provider CRUD 文案（`add-provider` / `edit-provider` / `delete-provider` 等，gateway 配置入口需要）。
  - 每条删前 grep 确认零引用。

- [ ] **T9: package.json**
  - `keywords` 删 `ollama`（加 `deepseek`）。
  - 删 3 个 `[deprecated]` `fim.ollamaHostname` / `ollamaApiPort` / `ollamaUseTls`。
  - 删 `fim.embeddings` 命令 + `fimEmbeddingsTab` context（确认 embeddings tab 已不在 main.tsx）。
  - **保留** `fim.embeddingIgnoredGlobs`（补全在用，改 description）+ `fim.manageProviders`（gateway 入口）。

- [ ] **T10: 删死代码**
  - `src/webview/hooks/useOllamaModels.ts`（subagent 权限拦物理 `rm`，已 stub 化，待手动删）、events.ts 的 `fimFetchOllamaModels` / `fimSetOllamaModel`、icons.tsx 的 `SvgOllama`、types.ts 的 `RequestOptionsOllama`、index.ts 的 `fim.embeddings` 命令注册、useProviders.ts 的 `embeddingProvider` state（先确认无消费者）、context.ts 的 `fimEmbeddingsTab`（若无引用）。
  - 保留 `FimProvider` / `llm.ts` / `deepseek.ts` / `providers.tsx` / `provider-form.ts` / `manageProviders`。

### Phase 4 — 验证

- [ ] **T11: 全量验证**
  - `npm run build` + `npm run lint` 全绿。
  - 重跑 `cd eval && npm run eval`（synthetic）：`syn-import` 补出 `} from '…'` 类，L3 0→高分；`syn-block-start` / `syn-line-continuation` 稳定 L3 ≥ 9。
  - F5 Extension Host：DeepSeek 真实补全（import / function / 行续）质量提升、无回归。
  - grep 验证：`README.md README.zh-CN.md CLAUDE.md AGENTS.md docs/ src/webview/assets/locales/ package.json` 无"Ollama / 15+ provider / 多 provider"残留（PD 远期文档 + 锚点除外）。
  - gateway 完整性：`FimProvider` / `llm.ts` / providers.tsx 配置入口仍在。

## 验证标准（Definition of Done）

1. 格式：eval `syn-import` L3 ≥ 7，`syn-block-start` / `syn-line-continuation` L3 ≥ 9。
2. 口径：文档 / locale / package.json 无多 provider / Ollama 残留（grep 证据）；gateway 抽象与配置入口保留。
3. 死代码：ollama / fim.embeddings 相关零引用。
4. `npm run build` + `npm run lint` 通过。
5. 生产 F5：DeepSeek ≥ 3 场景（import / function / 行续）ghost text 合理、无回归。

## 风险与回退

- **split-only 后 STOP_DEEPSEEK 的 FIM token 变 dead stop**（API 返回纯补全，不含 `<｜fim▁begin｜>` 等）→ `removeStopWords` 照跑无害，有效 stop 只剩 `<END>` / `<｜end of sentence｜>`。
- **模型可达性**（独立变量，非格式问题）→ 官方 FIM 文档 `model` 仅列 `deepseek-v4-pro`，默认 + eval 用 `deepseek-chat`；eval 能跑通说明暂可用，若突报 4xx 先查模型支持。
- **locale / package.json 误删活 key** → 删前 grep 确认零引用；`provider.config.*` / `embeddingIgnoredGlobs` / `manageProviders` 保留。
- **embeddingIgnoredGlobs 被补全复用** → 不删（仅改 description）。
- **repositoryLevel 路径遗漏** → T2 必须覆盖，否则默认路径与 repo 级路径格式不一致。
- 回退：纯删除 / 文案 / split 改动，`git revert` 即可。

## 相关 commits（上下文）

- `9a7e23d` fix: STOP_DEEPSEEK use ▁（stop token 修复，叠加）
- `493b9be` fix(eval): wasm 路径（layer2/chain AST）
- eval-framework 分支 `feat/eval-framework`（14+ commits）
- `focus-on-completion-only` 收敛（删 chat / embeddings / symmetry，`provider-options.ts` 等）

## 排查证据存档

- 全链路中间产物（prompt / raw completion）见对话记录（2026-07-19）。
- 关键对比脚本：node 直调 DeepSeek `/beta/completions`，raw vs split 两模式（可复现）。
- 死代码调用方核查（2026-07-19 grep）：`useOllamaModels` / `SvgOllama` / `RequestOptionsOllama` / `fim.ollama*` / `fimSetOllamaModel` 均零引用。
