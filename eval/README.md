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
- `EVAL_DATASET` — `synthetic` / `fim-self` / `all`（默认 `all`）

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
- `adapters/` — 可换组件（第一版 Noop，后续 graphify/codegraph 并入）
- `probes/` — 逐环中间产物探针
- `metrics/` — 三层指标（has/syntax/quality）
- `runner.ts` — 样本 × 矩阵 × 报告

## 加新 adapter

1. 在 `adapters/context/` 或 `adapters/intent/` 新建实现，满足 `ContextAdapter`/`IntentAdapter` 接口
2. 在 `runner.ts` 的 `matrices` 数组加一项
3. 跑 `npm run eval`，报告里横向对比
