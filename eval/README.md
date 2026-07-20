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
- `EVAL_DATASET` — `synthetic` / `fim-self` / `workspace` / `all`（默认 `all`）
- `EVAL_MATRICES` — `baseline,codegraph,codegraph-planner` 的逗号分隔组合（默认全部）
- `CODEGRAPH_MAX_NODES` — CodeGraph 子图的最大节点数（默认 `12`）
- `EVAL_USE_ENGINE_CHAIN` — 设为 `true` 时使用 Engine ChainV2（默认 `false`）
- `INTENT_BASE_URL` / `INTENT_API_KEY` / `INTENT_MODEL` — 意图 planner 的 OpenAI-compatible 配置；默认复用 DeepSeek key/model

## 运行

```bash
cd eval
npm run build
DEEPSEEK_API_KEY=sk-xxx EVAL_DATASET=synthetic node out/eval/runner.js
```

报告输出到 `eval/reports/<timestamp>.json` + `.md`。

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
