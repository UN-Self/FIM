# L3 质量评测调研：LLM 评分如何锚定标准答案

> **状态**：调研结论，未实施代码改动
> **日期**：2026-07-24
> **问题**：eval 的 L3 层 LLM-as-Judge 评分如何准确反映"补全与标准答案/可接受答案集的差距"？有无更好的评测质量办法？

## 1. 结论摘要

当前 L3 的 LLM 评分是**纯 reference-free 评判**：裁判只看 prefix/completion/suffix，看不到数据集中已有的标准答案与可接受答案集。这是"分数不准"的根因——裁判只能猜"用户想要什么"，换裁判模型或 rubric 即漂移，且分数无法证伪。

改进方向（按优先级）：

1. **P0**：先建确定性参考指标（exact/alternative match、edit similarity），零方差零成本，是锚点。
2. **P1**：裁判改造为 reference-guided，verdict 改为等价类三档（`equivalent` / `acceptable` / `wrong`）；验收条件拆成原子断言逐条判对错，通过后再做整体质量评判（见 P1 小节"断言式判卷"与"两段式"）。
3. **P2**：建 judge 校准集（人工标注 ~40 条），以 judge-人一致率验证"评分准不准"，目标 ≥80%。
4. **P3（可选）**：synthetic 可执行样本走沙箱断言，代码正确性的金标准。

同时下线遗留的 0-10 单次打分 `evalLayer3`，消除双轨口径混乱。

## 2. 现状诊断（代码证据）

### 2.1 双轨并存

| 实现 | 位置 | 机制 |
|------|------|------|
| 结构化裁判（主力） | `eval/metrics/judge.ts` | `verdict(accept/partial/reject) + score(0-4) + failureTags + confidence`；temperature 0；多次运行多数投票 + 中位分；不稳定检测；pairwise 盲测带位置轮换 + deterministic bootstrap 95% CI |
| 遗留单次打分 | `eval/metrics/layer3_quality.ts` | 单次 prompt 输出 0-10 分 + 一句话理由 |

机制上结构化裁判已较规范（judge 与 writer 分离、多跑聚合、位置轮换），但两者共用 `Layer3Result` 出口（`runner.ts:210-216` 用聚合结果覆盖 `completionProbe.layer3`），报告口径混乱——如 `reports/2026-07-23T15-42-13-861Z.md` 中 `L3 Median 0.3/4` 与 `accept rate 13%→67%` 脱节。

### 2.2 核心缺陷：参考脱锚

数据集早已具备 golden answers：

- `eval/datasets/types.ts:10-12` — `Sample.expectedCompletion` / `expectedCompletionAlternatives`
- `eval/datasets/synthetic/expected-completions.json` — 每个样本含 `expectedCompletion` + `alternatives` + `rationale`，文件头注释自称 "Used for exact-match and fuzzy-match comparison in eval metrics"

但全仓检索确认：**没有任何 metric 消费它们**。`runner.ts:202` 调 `judgeCompletion` 只传 `{prefix, completion, suffix}`；`expectedCompletion` 仅在 `runner.ts:77-78` 被透传进结果对象后闲置。注释与实际行为不符。

### 2.3 后果

- 裁判只能凭上下文猜"用户想要什么"，分数无锚点，换裁判模型/rubric 即漂移。
- 无法回答"该补全相对可接受答案集算不算对"，accept rate 的语义模糊。
- 没有人类锚点，任何 judge 改动都无法验证是改进还是劣化。

## 3. 外部调研

| 方法 | 来源 | 对本项目的价值 |
|------|------|----------------|
| 确定性参考指标：Exact Match / Edit Similarity / identifier match | CrossCodeEval（NeurIPS'23，arXiv:2310.11248） | 代码补全评测的事实标准；零方差、零成本，应先于 LLM 评分建立锚点 |
| FIM 专用基准设计 | SAFIM（ICML'24 Oral，arXiv:2403.04814） | syntax-aware 的 FIM 指标与后处理，印证"匹配类指标 + 结构校验"路线 |
| LLM judge 偏差与验证 | Judging LLM-as-a-Judge（NeurIPS'23，arXiv:2306.05685） | position / verbosity / self-enhancement 三类偏差及缓解；强 judge 需达到与人 ~80% 一致率才可信 |
| Rubric 锚点化 + CoT | G-Eval（arXiv:2303.16634） | 每档分数给出定义与示例，先推理后打分，显著降低 judge 方差 |
| 执行型评测 | HumanEval pass@k 系 | 代码正确性金标准；synthetic 自包含样本可落地，workspace 样本难 |

要点：reference-guided（把标准答案给裁判看）是业界缓解"judge 猜意图"的标准做法；judge 本身必须用人工标注集校准，否则"准确性"无从谈起。

## 4. 改进方案

### P0 — 确定性参考层

- 新增 `eval/metrics/reference.ts`：
  - 归一化（trim / 尾随换行 / 连续空白）后与 `expectedCompletion` 及每个 alternative 比较，命中即 accept
  - Edit similarity（复用根依赖 `fastest-levenshtein`）给出 [0,1] 连续分
- 报告新增列：Exact/Alt Match Rate、Edit Sim
- 价值：零方差、零成本、可复现，是 judge 的对照组与第一道锚点

### P1 — Reference-guided 裁判

- `judgeCompletion` prompt 注入：`expectedCompletion`、`alternatives`、`rationale`
- 评判任务从"绝对质量打分"改为"语义等价归类"，**verdict 三档**：
  - `equivalent` — 与标准答案或某可接受答案语义等价
  - `acceptable` — 不在列表但正确可用
  - `wrong` — 不正确、有害或答非所问
- 输出增加 `matchedReference`（命中的参考）字段
- 保留现有多跑投票 + 中位分 + 不稳定检测；rubric 每档给定义与示例（G-Eval 风格）
- `JUDGE_RUBRIC_VERSION` 同步升级

#### 断言式判卷：把每次裁判缩到最小可判单元

整体式判卷一次问"好不好"，裁判自由裁量空间大。断言式判卷把每个 fixture 的验收条件拆成原子断言，每次裁判调用只判一条、只答 true/false。以 `syn-comment-to-code`（rationale: "// sort the array → 任何 sort 调用均可"）为例：

```json
"assertions": [
  { "id": "calls-sort", "check": "completion 对某个数组标识符调用了 .sort(", "mode": "deterministic", "required": true },
  { "id": "comparator-consistent", "check": "若传入比较器，方向与注释意图一致", "mode": "llm", "required": false },
  { "id": "no-suffix-dup", "check": "不复读 suffix 已有内容", "mode": "deterministic", "required": true }
]
```

要点：

- **二元判定比量表可靠**：单条断言 true/false 的裁判间一致性远高于整体打分（FActScore / Prometheus 的经验结论）；多次投票可省，judge runs 可从 3 降到 1-2，总成本不升反降
- **能确定性判的不用 LLM**：`mode: deterministic` 走 regex/AST/字符串比对，零成本零方差；LLM 只判语义断言（如"比较器方向与意图一致"）。选择优先级：确定性代码判 > 沙箱执行判（P3）> LLM 原子断言判 > LLM 整体判，能用左边的就不用右边的
- **断言来源**：fixture 作者在 `expected-completions.json` 手写（把 `rationale` 结构化为断言列表），质量最高；裁判自动生成断言有自创错误标准的风险，第一版不用
- **聚合推出对错**：任一 `required` 断言失败 → 判错，流程终止；全部通过 → 进入整体评判
- **可归因**：报告可按断言聚合失败原因（"67% 失败挂在同一条断言"），整体打分做不到

#### 两段式：断言判对错，整体判好坏

断言是离散检查，天然覆盖不全——补全可能条条断言都过，却又丑又绕、不符合本地惯例。因此断言之后仍需一次整体评判，两段各司其职：

```
补全 ──▶ 第一段：断言门（判"对不对"）
           ├─ 任一 required 断言失败 → verdict = wrong，终止（不再消耗整体评判）
           └─ 全部通过 ──▶ 第二段：整体评判（判"好不好"）
                             ├─ 命中参考 → equivalent + 质量分
                             └─ 未命中参考 → 判是否 acceptable + 质量分
```

- **断言门是廉价过滤器**：错的在门口拦下，整体评判只花在"可能可用"的补全上，省裁判调用
- **整体评判的职责同样被收窄**：prompt 附带断言结果，裁判不再核实事实，只评估断言覆盖不了的维度——代码风格、简洁度、惯用法、与周围代码的一致性。职责单一 → 更稳
- **质量分区分"对"的层次**：同为 `equivalent`，"对且优雅"与"对但别扭"由整体质量分拉开，供方案对比时参考
- **校准分工**（接 P2）：断言门用人工标注的断言真值校准；整体评判用人工质量分校准，两者分别报告一致率

### P2 — Judge 校准（meta-evaluation）

- 从历史报告抽 ~40 条补全人工标注三档 verdict
- 跑裁判 vs 人工标签，计算 accuracy + Cohen's κ + per-verdict confusion matrix，写入报告头
- judge-人一致率 ≥80% 才采信 accept rate；rubric 版本升级必重跑
- 这是唯一能证明"LLM 评分准确"的手段

### P3（可选）— 执行型评测

- synthetic 样本（add/sort 等自包含 JS）在 node 沙箱执行 + 从 fixture 派生断言
- workspace 样本不适用，仅作补充信号

### 清理项

- 下线 `eval/metrics/layer3_quality.ts`（0-10 单次打分），消除双轨口径混乱
- 报告列与 verdict 体系统一：`L3 Median /4` 等旧列随 `evalLayer3` 一并退场
- 修正 `expected-completions.json` 头注释与实际行为的脱节（P0 落地后注释即为真）

### 偏差控制：四大偏见对照与新增机制

对照 Zheng et al.（MT-Bench，arXiv:2306.05685）的实验结论逐项盘点：

| 偏见 | 论文数据 | 现有/已提案控制 | 剩余缺口 |
|------|---------|----------------|---------|
| 位置偏见 | GPT-4 交换顺序一致性仅 ~65%；Claude-v1 偏向第一位 75% | pairwise 位置轮换 + bootstrap CI（已有） | 轮换只是"跨多次统计抵消"，未采用论文的"双评一致才算赢"规则；不报告位置不一致率 |
| 冗长偏见 | "重复列表"攻击下 GPT-4 失败率 8.7%，Claude/GPT-3.5 高达 91.3% | reference 锚点（P1）间接缓解 | 无显式控制；裁判 prompt 未声明"长度不是优点" |
| 自我提升偏见 | GPT-4 判 GPT-4 胜率比人高 ~10%（数据有限） | 裁判非 DeepSeek（设计文档 #15） | 可接受；pairwise 中两臂同为 DeepSeek 产物，偏差对称抵消 |
| 推理有限/被错答误导 | 数学评分失败率 70%；**参考引导降到 15%** | reference-guided + 断言门（P1）正是此对策；执行（P3）根除可运行样本的该类错误 | 整体评判仍可能被"自信的错误"误导 → 靠 P2 校准兜底 |

论文数据同时验证了方案主线：参考引导把评分失败率从 70% 降到 15%，这正是 P1 的依据；断言门比"给个参考"更进一步——裁判连解题都不需要，只做核对。

新增机制（补缺口）：

1. **双评一致规则（swap-consistency）**：pairwise 每次比较跑 A-B 与 B-A 两序，两序同胜者才记 win/loss，否则记 tie。比单纯轮换更保守，直接消除位置偏见的个例影响；代价是 tie 率上升，需保留足够 `EVAL_PAIRWISE_JUDGE_RUNS`
2. **位置不一致率入报告**：与 `judgeUnstableRate` 并列；飙升说明裁判模型或提示词退化
3. **反冗长显式声明 + 确定性信号**：pairwise/holistic prompt 明确"更长的回答不是优点，无新增信息的重复是缺陷"；同时把 L2 已有的 `computeDuplicationRate` 作为确定性证据喂给裁判（或在记分中直接惩罚），用零方差信号结构性对冲 verbosity bias
4. **先推理后裁决（reason-then-judge）**：裁判 JSON 输出增加 `evidence` 字段并置于 verdict 之前，先引证据再给结论（论文 CoT 列：失败率 70%→30%）
5. **裁判陷阱集（judge trap suite）**：构造少量答案已知的陷阱样本随评测周期运行——位置陷阱（两序应同结论）、冗长陷阱（注水重复版不应胜出）、自信错误陷阱（看似合理但违背 rationale 应判 `wrong`）。与 P2 人工校准互补：人工校准测"和人一致"，陷阱测"已知坑不倒"；零标注成本，每次评测都可跑，陷阱全对是裁判上岗前提
6. **审计元数据**：报告头记录裁判模型名/快照、writer 模型、`JUDGE_RUBRIC_VERSION`；裁判模型升级视为 rubric 变更，需重跑校准与陷阱集

（论文的"多轮对话上下文"一条对本项目不适用：FIM 补全是单轮任务。）

## 5. 实施顺序与验收信号

1. **P0**：报告出现 Match Rate / Edit Sim 列；synthetic 数据集 match 类指标可复现
2. **P1**：裁判输出等价类三档 + `matchedReference`；judge 不稳定率不劣于现状
3. **P2**：报告头出现 judge-人一致率；≥80% 后以 reference-guided accept rate 为方案决策依据
4. **P3**：可执行样本的执行通过率作为 P0/P1 的交叉验证
5. **裁判健康**：位置不一致率与陷阱集通过率进入报告头，作为裁判模型/提示词变更的回归测试

正式实施时另立计划文档（`docs/plans/`），本文档作为其调研依据。
