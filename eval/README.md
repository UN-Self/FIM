# FIM Eval

评测 FIM 补全链路的独立子项目。直接 import FIM 源码 + vscode stub，跑通 A→G 全链路，三层 metrics + 逐环 probe，支持可换 adapter 横向对比。

## 前置

在 FIM 根目录 `npm install`（eval 共享根 node_modules）。

## 配置（env）

- `DEEPSEEK_API_KEY` — 必填，被测 DeepSeek API key
- `DEEPSEEK_MODEL` — 默认 `deepseek-chat`
- `JUDGE_BASE_URL` — Layer3 裁判 OpenAI-compatible baseUrl（留空则 Layer3 skip）
- `JUDGE_API_KEY` — 裁判 key
- `JUDGE_MODEL` — 裁判模型名
- `EVAL_WRITER_RUNS` — 每个样本与矩阵的独立生成次数（默认 `3`）
- `EVAL_JUDGE_RUNS` — 同一最终补全的结构化 LLM judge 次数（默认 `3`）
- `EVAL_PAIRWISE_JUDGE_RUNS` — baseline 与候选盲测比较次数（默认 `3`）
- `EVAL_DATASET` — `synthetic` / `fim-self` / `workspace` / `all`（默认 `all`）
- `EVAL_MATRICES` — `baseline,codegraph,codegraph-planner` 的逗号分隔组合（默认全部）
- `CODEGRAPH_MAX_NODES` — CodeGraph 子图的最大节点数（默认 `12`）
- `EVAL_USE_ENGINE_CHAIN` — 设为 `true` 时使用 Engine ChainV2（默认 `false`）
- `INTENT_BASE_URL` / `INTENT_API_KEY` / `INTENT_MODEL` / `INTENT_MAX_CONTEXT_CHARS`（默认 `24000`）— 意图 planner 的 OpenAI-compatible 配置；默认复用 DeepSeek key/model
- `FIM_LOG_LEVEL` — FIM 日志等级 `error`/`warn`/`info`/`debug`/`trace`（默认 `info`）。`info` 静音请求 dump 与 formatter 跟踪；`trace` 打印 FIM 请求全量 dump（API key 始终脱敏）。优先级：扩展内 `fim.logLevel` 设置 > 此变量 > 默认

## 运行

推荐在 `eval` 目录执行：

```bash
cd eval
npm run eval
```

`npm run eval` 会构建 TypeScript 源码，并从 `eval/.env` 加载环境变量后执行评测。

只评测 synthetic 数据集：

```bash
cd eval
EVAL_DATASET=synthetic npm run eval
```

也可在已构建后直接运行编译产物：

```bash
cd eval
node --env-file-if-exists=.env out/eval/runner.js
```

不要执行 `node runner.ts` 或 `npm run runner.ts`：`runner.ts` 是 TypeScript 源码，Node 不会自动编译它；`runner.ts` 也不是 npm script。

报告输出到 `eval/reports/<timestamp>.json` + `.md`。

## LLM Judge 稳定性

评测先生成并保存每次的原始与最终补全，再对同一最终补全进行多次结构化 judge；Writer 的波动不会和 judge 的波动混在一起。judge 固定使用 `temperature: 0`，输出 `accept`、`partial` 或 `reject`，并以多数投票与中位分聚合。

报告中的 `Structured LLM Judge` 展示接受率、judge 不稳定率、judge 错误率和 Writer 多样性。`Blind Pairwise Judge` 将 baseline 与候选以平衡、确定的 A/B 位置轮换比较，按 fixture 聚合胜率和 deterministic bootstrap 95% 区间；仅当区间下界大于 `0.5` 时标记候选胜出。

快速调试可将三项运行次数都设为 `1`；用于方案决策时应保留默认值或提高次数。

## 架构

见 [`docs/archive/2026-07-16-eval-framework-design.md`](../docs/archive/2026-07-16-eval-framework-design.md)。

- `chain.ts` — A→G 全链路编排
- `adapters/` — Noop、CodeGraph context 与 DeepSeek intent planner
- `probes/` — context、intent、prompt、completion 中间产物探针
- `metrics/` — completion 的 has/syntax/quality 指标；报告另聚合 intent 命中和上下文 token
- `runner.ts` — 样本 × 矩阵 × 报告

## 加新 adapter

默认对照矩阵：

- `baseline-fim` — 当前 prefix/suffix FIM
- `codegraph-context-fim` — CodeGraph 相关代码子图 + FIM
- `codegraph-planner-fim` — CodeGraph 子图 + DeepSeek 结构化意图 + FIM

CodeGraph 首次运行会在样本 workspace 建立本地索引。若不需要图谱对照，可设置 `EVAL_MATRICES=baseline`。
