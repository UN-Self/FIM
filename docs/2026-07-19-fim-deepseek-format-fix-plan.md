# FIM DeepSeek 调用格式修复计划

> **下次执行**：用 superpowers:subagent-driven-development 逐 Task 执行。每 Task 实现后 review。

## 背景：eval-framework 实跑挖出的生产 bug

eval-framework 跑通后（synthetic 样本），`syn-import` 样本补全是乱码（L3=0）。systematic-debugging 排查（2026-07-19）定位到根因：

**FIM 项目对 DeepSeek 用了错误的 FIM 调用格式。**

- 当前做法：`getFimPrompt` 把 `<｜fim▁begin｜>...prefix...<｜fim▁hole｜>...suffix...<｜fim▁end｜>` 拼成一个字符串，塞进请求体的 `prompt` 字段（**不用** `suffix` 字段）。
- DeepSeek 官方 FIM：`prompt`（前缀）+ `suffix`（后缀）**分开两个字段**，API 自己加 token。
- 结果：DeepSeek `/beta/completions` 不识别 raw prompt 里的 FIM token，当成普通续写 → 补全质量差。

### 实测铁证（2026-07-19，同一道题两种出法）

| 题 | 当前（raw 拼 token） | 官方（prompt+suffix 分开） |
|---|---|---|
| `import { ` | `<p>\nThese include the works on the left...`（乱码 HTML） | `memo } from 'react'\n\nexport default memo(...)`（完美） |
| `function add(a,b){\n  ` | `}\n</>`（乱码） | `return a + b;\n}\nmodule.exports = add;`（完美） |

### 影响范围

- **生产** `src/extension/providers/completion.ts:98-110` `buildFimRequest`：body 是 `{ max_tokens, model, prompt, stream, temperature }`，prompt 含拼好的 token，无 suffix 字段。
- **eval** `eval/chain.ts`：同上格式（抄自生产）。
- 所以**不止 eval，生产 FIM 对 DeepSeek 也一直用错格式**——补全质量一直被打折，只是简单续写场景巧合能用，需填 hole 的（import 等）就废。

> 注意：之前一轮分析曾误判为"deepseek-chat 模型能力边界"，**已推翻**——是调用格式错，不是模型笨。

## Goal

按 **provider 能力**区分 FIM 调用模式：
- 支持 `suffix` 字段的 provider（DeepSeek beta、OpenAI 兼容 `/completions` 带 suffix 的）→ 用 `prompt`+`suffix` 分开（官方格式）。
- 只支持 raw 的 provider（codellama / starcoder 类无 suffix 端点）→ 保留拼 token 模式（`getFimPrompt` 不变）。

补全质量恢复到模型本应有的水平。

## Constraints

- **不能一刀切**：FIM 支持 15+ provider，必须逐个确认其端点是否支持 `suffix` 字段。误判会让原本正常的 provider 回归。
- **生产回归风险**：`completion.ts` 改动影响真实补全，每步小改 + 手动验证（F5 Extension Host + eval）。
- 已修的 `STOP_DEEPSEEK ▁`（commit `9a7e23d`）与新格式叠加——新格式下 API 自动加 token，stop 仍需 chain/生产侧清理（`removeStopWords`）。
- 代码风格：双引号、无分号、无尾逗号、2 空格、LF。

## Tasks

- [ ] **Task 1: provider × FIM 模式调研**
  - grep `src/extension/fim-templates.ts`、`provider-options.ts`、`providers/`，列出每个 provider 的端点 + 是否支持 `suffix` 字段。
  - 产出：一张 `provider → {端点, 支持 suffix?}` 表（写入本 plan 或 docs/）。
  - 重点确认：DeepSeek（已知支持）、Ollama、OpenAI 兼容、Codestral、Qwen 等。

- [ ] **Task 2: fim-templates.ts 加 split 模式**
  - 新增 `getFimSplitPrompt(prefixSuffix)` 返回 `{ prompt: prefix, suffix: suffix }`（用于支持 suffix 的 provider）。
  - 保留现有 `getFimPrompt`（拼 token，raw 模式，给不支持的 provider）。
  - 不要破坏现有调用方。

- [ ] **Task 3: completion.ts buildFamRequest 按 provider 选模式**
  - 根据 provider 能力（Task 1 的表）选 split 或 raw。
  - split 模式：body 加 `suffix` 字段，`prompt` 传纯前缀。
  - 改动小步，保留 raw 分支。

- [ ] **Task 4: chain.ts（eval）按 provider 选模式**
  - 同 Task 3 逻辑。eval 主要测 DeepSeek → 走 split。

- [ ] **Task 5: provider-options.ts DeepSeek body 用 prompt+suffix**
  - 确认 DeepSeek body 构建走 split。

- [ ] **Task 6: 验证**
  - 重跑 `cd eval && npm run eval`（synthetic）：`syn-import` 应补出 `} from '...'` 类正确内容，L3 从 0 → 高分；`syn-block-start` 稳定满分。
  - 生产：F5 启动 Extension Host，对 DeepSeek 触发真实补全（import 场景、function 场景），确认 ghost text 质量提升、无回归。
  - 回归：codellama/其他 raw provider 仍正常（用 raw 模式不变）。

## 验证标准（Definition of Done）

1. eval synthetic 重跑：`syn-import` L3 ≥ 7（补出合法 import），`syn-block-start` / `syn-line-continuation` 稳定 L3 ≥ 9。
2. 生产 F5：DeepSeek 至少 3 个真实场景（import / function / 行续）ghost text 合理。
3. 至少 1 个 raw-only provider（如 codellama via Ollama）不回归。
4. `npm run build` + `npm run lint` 通过。

## 风险与回退

- **provider 模式表不全** → Task 1 必须实测确认（不能凭文档猜），拿不准的默认 raw（保守）。
- **生产回归** → Task 3/5 小步改 + Task 6 手动测；若回归，单 provider 回退 raw。
- 回退成本低：split/raw 由一个 provider 能力开关决定，改回即可。

## 相关 commits（上下文）

- `9a7e23d` fix: STOP_DEEPSEEK use ▁（stop token 修复，叠加）
- `493b9be` fix(eval): wasm 路径（layer2/chain AST）
- eval-framework 分支 `feat/eval-framework` 全部工作（14+ commits）

## 排查证据存档

- 全链路中间产物（prompt / raw completion）见对话记录（2026-07-19）。
- 关键对比脚本：node 直调 DeepSeek `/beta/completions`，raw vs split 两模式（可复现）。
