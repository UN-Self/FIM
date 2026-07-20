# FIM 评测框架（eval）设计文档

> **状态**：设计已确认，待写实施计划。
> **日期**：2026-07-16
> **背景**：FIM 要做出好效果的补全，但没有测试框架就无法衡量"上下文收集策略 / 意图识别"对补全的影响。本文档定义一个独立的评测子项目 `eval/`，贯穿补全链路逐环评测，支持可换组件（graphify / codegraph / 自研）横向对比。

## 1. 目标与原则

### 1.1 目标

- 量化补全质量，回答"这个上下文策略 / 意图识别让补全变好了吗"。
- 支持可换组件横向对比（Noop 基线 vs graphify vs codegraph）。
- 中间产物层层评测，能归因"哪一环改善了补全"。

### 1.2 核心原则

- **以效果成果为导向**：评测的是最终补全好不好，不是中间环节自洽不自洽。
- **单一真相源**：eval 直接 import FIM 的 `src` 源码（不重实现、不调编译产物），改 src 立刻反映。
- **基线干净**：第一版上下文/意图用 Noop 占位，任何增强都是可量化增量。
- **不编造数据**：样本来自真实文件（FIM 自己的代码）+ 人造光标位置，预留真实会话录制接口。
- **参数不拍脑袋**：上下文范围、token 预算等参数由评测结果驱动，不预设。

## 2. 已确认决策

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 架构方向 | fim-overall-design.md 权威（单体 VS Code 扩展），跨编辑器留作未来 |
| 2 | server | 不做，单体先验证效果 |
| 3 | eval 语言 | 全 TypeScript（用 FIM 源码，node 就 node）|
| 4 | eval 形态 | 独立子项目 `eval/` |
| 5 | 引用 FIM 代码 | 直接 import `src` 源码 + vscode stub（方案 A）|
| 6 | 链路范围 | 一步到位 A→G 全链路，B/C 用 Noop 占位 |
| 7 | 上下文收集占位 | NoopContextCollector（基线）|
| 8 | 意图识别占位 | NoopIntentDetector（基线）|
| 9 | 样本 | 合成 + 真实快照（先用 FIM 自己的代码）|
| 10 | 样本真实性 | 真实文件 + 人造光标，预留录制接口 |
| 11 | 跨语言通信 | JSON/stdout 每次 spawn（graphify/codegraph 有 Py 有 Node）|
| 12 | 中间产物 | 每环都评测，graphify/codegraph 可换对比 |
| 13 | "好"的优先级 | 有补全 → 语法对+不越界 → 是不是想要的 |
| 14 | Layer3 | LLM-as-Judge |
| 15 | 裁判偏见 | 用不同模型当裁判（非 DeepSeek）|
| 16 | 裁判配置 | OpenAI-compatible，baseUrl+key 从 env 读 |
| 17 | common react 清理 | 顺手清掉 deepseek.ts 的 ReactNode |
| 18 | 模块组织 | 方案 Z（chain.ts 集中链路 + 职责分离）|

## 3. 架构与模块边界

```
eval/
├── chain.ts              ← A→G 全链路编排，唯一读懂流程的地方
├── runner.ts             ← 样本 × chain × probe 收集 × 报告
├── config.ts             ← 配置加载（env 读 DeepSeek key + 裁判 key）
├── stub/
│   └── vscode.ts         ← 假 vscode 模块（lineCount/getText/Position/Range）
├── datasets/
│   ├── types.ts          ← Sample 类型定义
│   ├── synthetic/        ← 合成边界用例（手写 .ts 夹具）
│   └── snapshots/fim-self/ ← 真实快照（从 FIM 仓库切的 文件+光标）
├── adapters/
│   ├── types.ts          ← GraphAdapter/IntentAdapter/ContextAdapter 接口 + ContextIR
│   ├── context/noop.ts   ← NoopContextCollector（默认基线）
│   └── intent/noop.ts    ← NoopIntentDetector（默认基线）
├── probes/
│   ├── context.ts        ← 评上下文产物
│   ├── intent.ts         ← 评意图产物
│   ├── prompt.ts         ← 评 prompt 产物
│   └── completion.ts     ← 评最终补全（调 metrics 三层）
├── metrics/
│   ├── layer1_has.ts     ← 非空、不报错
│   ├── layer2_syntax.ts  ← tree-sitter 解析 + 括号平衡 + 越界
│   └── layer3_quality.ts ← LLM-judge（OpenAI-compatible，env 配）
└── reports/              ← json + markdown 报告输出
```

### 模块职责

- `chain.ts`：接收 `Sample` + adapter 选择，顺序跑 A→G，每环产物喂给对应 probe，返回 `ChainResult`。
- `runner.ts`：加载样本集 × 遍历对比矩阵 × 跑 chain × 聚合报告。
- `adapters/`：可换组件，统一接口，第一版只有 Noop 实现。
- `probes/`：每环中间产物的评测探针。
- `metrics/`：三层客观指标，被 completion probe 调用。
- `stub/vscode.ts`：骗过 FIM 源码里 `import "vscode"` 的最小假对象。

### 依赖关系（单向无环）

```
runner → chain → {adapters, probes}
                 probes → metrics
chain → import ../src/extension/* (FIM 源码，经 stub 喂 vscode)
metrics/layer3 → 裁判模型 API
```

## 4. 数据流与中间产物类型

全链路 A→G，每环产出显式类型，probe 挂在每环上。

```ts
// 输入
interface Sample {
  id: string
  source: "synthetic" | "fim-self"
  filePath: string
  cursor: { line: number; character: number }
  languageId: string
  expectedCompletion?: string  // 可选标注答案，第一版可空
}

// A. prefix/suffix 提取
interface PrefixSuffixArtifact { prefix: string; suffix: string }
//   实现：用 stub 的 FakeDocument 喂 FIM 的 getPrefixSuffix()

// B. 上下文收集（adapter 产出）
interface ContextIR {
  chunks: ContextChunk[]
  tokenEstimate: number
  source: string  // "noop" | "graphify" | "codegraph" | ...
}
interface ContextChunk {
  filePath: string
  text: string
  relevanceScore?: number
  reason?: string  // import? 调用? 热度?
}
//   NoopContextCollector 返回 { chunks: [], tokenEstimate: 0, source: "noop" }

// C. 意图识别（adapter 产出）
interface IntentResult {
  intent: "line_continuation" | "block_completion" | "import_completion"
       | "argument_completion" | "comment_to_code" | "test_completion" | "unknown"
  confidence: number
  signals: string[]
}
//   NoopIntentDetector 返回 { intent: "unknown", confidence: 0, signals: [] }

// D. FIM prompt 拼接
interface PromptArtifact { prompt: string; stopWords: string[] }
//   实现：调 FIM 的 getFimPrompt()

// E. 调 DeepSeek
interface ModelOutput { rawCompletion: string; latencyMs: number; error?: string }
//   实现：调 FIM 的 llm()，真实 DeepSeek API

// F. 后处理（两步：先截断后格式化）
interface ProcessedCompletion { text: string; truncated: boolean }
//   步骤1：调抽取出的 truncateCompletion() 做截断（括号平衡/结构边界/maxLines）
//   步骤2：调 FIM 的 CompletionFormatter.format() 做格式化（去重复/缩进/引号）
//   两步顺序与当前 completion.ts 一致：onData 截断 → provideInlineCompletion 格式化
```

### 数据流（单向管道）

```
Sample
  → A: PrefixSuffixArtifact      （无 probe，基础提取）
  → B: ContextIR                 ── probe: context.ts
  → C: IntentResult              ── probe: intent.ts
  → D: PromptArtifact            ── probe: prompt.ts
  → E: ModelOutput               （无单独 probe，原始输出）
  → F: ProcessedCompletion       ── probe: completion.ts → metrics 三层
  → G: 最终补全文本
```

### ChainResult

```ts
interface ChainResult {
  sampleId: string
  artifacts: {
    prefixSuffix: PrefixSuffixArtifact
    context: ContextIR
    intent: IntentResult
    prompt: PromptArtifact
    model: ModelOutput
    completion: ProcessedCompletion
  }
  probes: {
    context?: ContextProbeResult
    intent?: IntentProbeResult
    prompt?: PromptProbeResult
    completion: CompletionProbeResult
  }
}
```

### 设计要点

1. 每环产物都是显式类型，probe 拿结构化数据不是字符串。
2. ContextIR 是统一中间表示，graphify/codegraph/自研都适配成 `ContextChunk[]`，横向对比公平。
3. A 和 E 不挂 probe，probe 集中在 B/C/D/F。

## 5. FIM 源码复用、stub、耦合点处理

### 5.1 vscode stub 范围

```ts
// eval/stub/vscode.ts
export class Position { constructor(public line, public character) {} }
export class Range { constructor(public start, public end) {} }
export class FakeDocument {
  constructor(private text: string, public uri: FakeUri, public languageId: string) {}
  get lineCount() { return this.text.split("\n").length }
  getText(range?: Range) { /* 按 range 切片，无 range 返回全文 */ }
  save() { return Promise.resolve(true) }
}
// window/workspace/commands 大部分 no-op 空实现
```

tsconfig 用 `paths: { "vscode": ["./stub/vscode.ts"] }` 重定向。

### 5.2 FIM 源码复用映射

| 链路环节 | FIM 函数 | vscode 依赖 | eval 复用方式 |
|---------|---------|-----------|--------------|
| A prefix/suffix | `getPrefixSuffix` | TextDocument/Position/Range 类型 | 直接 import，喂 FakeDocument |
| B 上下文 | FIM 的 getFileInteractionContext | workspace IO | 不复用，adapter 自实现，Noop 返回空 |
| C 意图 | （FIM 没有） | — | eval 新建，Noop |
| D prompt | `getFimPrompt` / `getFimTemplateRepositoryLevel` | 无（纯） | 直接 import |
| E 调模型 | `llm` | 无（fetch） | 直接 import |
| F 后处理 | `CompletionFormatter.format` | TextEditor | import，喂 FakeEditor |
| F 截断 | `CompletionProvider.onData` 截断逻辑 | 嵌在 completion.ts，耦合 vscode | 抽取为纯函数，见 5.3 |

### 5.3 耦合点：截断逻辑抽取（会动 FIM src）

`CompletionProvider.onData`（completion.ts:248-440）的截断逻辑（括号平衡、结构边界、函数体结束、maxLines）和 vscode 状态混在一起。

**处理方案**：抽成纯函数 `truncateCompletion(args) → string`，放进 FIM 的 `src/extension/postprocessor.ts`（新文件），输入结构化参数（completion 文本、node、prefixSuffix、config、parser），输出截断后文本。`CompletionProvider.onData` 改为调它，eval 的 chain.ts F 环节也调它。单一真相源。

这是 fim-overall-design.md §4.2 / PD-supplement §8 本来就要求的后处理独立，eval 顺带推动，不是为 eval 改 FIM。

### 5.4 common 层 react 清理

`src/common/deepseek.ts` 删掉 `import { ReactNode }` 和 `logo?: ReactNode` 两行（`logo` 零使用，已确认）。让 common 层纯净，eval 能直接 import `FimProvider` 类型。

### 5.5 tree-sitter wasm 路径

`parser.ts` 用 `path.join(__dirname, "tree-sitter-wasms", ...)` 找 wasm。eval 编译后 `__dirname` 是 `eval/out/`，wasm 不在。第一版用**拷贝**：eval 的 build 脚本把 wasm 拷到 `eval/out/tree-sitter-wasms/`。后续如需可配置路径再改。

### 5.6 配置（config.ts）

```ts
interface EvalConfig {
  deepseek: { apiKey: string; model: string }       // DEEPSEEK_API_KEY, DEEPSEEK_MODEL
  judge: {                                           // Layer3 裁判，OpenAI-compatible
    baseUrl: string; apiKey: string; model: string   // JUDGE_BASE_URL, JUDGE_API_KEY, JUDGE_MODEL
    enabled: boolean                                  // key 为空则 false，Layer3 skip
  }
  contextLength: number                              // 复用 FIM 默认 100
  dataset: "synthetic" | "fim-self" | "all"
  matrix: AdapterMatrix[]                            // 对比矩阵
}
```

## 6. metrics 与 probe 指标

### 6.1 三层 metrics

```ts
// layer1_has.ts — 有补全
interface Layer1Result {
  hasCompletion: boolean  // 非空、非纯空白
  noError: boolean        // API 没报错、没超时
  latencyMs: number
}

// layer2_syntax.ts — 语法对 + 不越界（纯本地 tree-sitter）
interface Layer2Result {
  syntaxValid: boolean       // prefix+completion+suffix 拼起来 tree-sitter 解析无 error
  bracketBalanced: boolean   // 括号平衡
  noOverrun: boolean         // 没超出当前函数/块边界
  noDuplication: boolean     // 不和 suffix 重复
  errorNodeCount: number     // AST error 节点数（连续可观测）
}

// layer3_quality.ts — LLM-judge
interface Layer3Result {
  score: number       // 0-10
  reasoning: string   // 裁判理由
  judged: boolean     // false = 裁判未配置，skip
}
// judge prompt: 给裁判 prefix + completion + suffix，问"补全是否正确、是否是用户想要的、写法是否合理"，打分+理由
```

### 6.2 probe 指标

```ts
interface ContextProbeResult {
  chunkCount: number
  tokenEstimate: number
  // 召回率/噪声率留接口（需"应召回哪些"标注，第一版 Noop 无意义）
}
interface IntentProbeResult {
  intent: string
  confidence: number
  // 第一版只记录，不判对错（Noop=unknown）
}
interface PromptProbeResult {
  length: number
  tokenEstimate: number  // ~length/4
  hasFimTokens: boolean
}
interface CompletionProbeResult {
  layer1: Layer1Result
  layer2: Layer2Result
  layer3: Layer3Result
}
```

**第一版诚实性**：context/intent probe 在 Noop 基线下只记录不评判。基线就是 Noop，probe 记录"Noop 召回 0"正是基线该有的样子。等 graphify/codegraph 并入、有真实上下文，召回/噪声指标才有意义，那时补标注逻辑。

## 7. runner 对比矩阵与报告

### 7.1 对比矩阵

```ts
interface AdapterMatrix {
  label: string  // "noop-noop" | "graphify-rule" | ...
  contextAdapter: ContextAdapter
  intentAdapter: IntentAdapter
}
```

runner 流程：
```
for sample in dataset:
  for matrix in matrices:              // 每个样本跑所有 adapter 组合
    result = chain.run(sample, matrix)
    results.push(result)
report = aggregate(results)            // 按 matrix 分组聚合
writeReport(report)                    // reports/<timestamp>.json + .md
```

### 7.2 报告

JSON（机器可读，趋势对比）+ Markdown（人读）。核心对比表：

```
| matrix         | L1通过率 | L2通过率 | L3均分 | 平均延迟 | 样本数 |
| noop-noop      | 98%      | 62%      | 6.1   | 820ms   | 50    |
| graphify-noop  | 97%      | 78%      | 7.3   | 910ms   | 50    |
| graphify-rule  | 97%      | 81%      | 7.6   | 905ms   | 50    |
```

一眼看出"加 graph 让 L2 通过率 62%→78%，L3 均分 6.1→7.3"。

## 8. 错误处理

- **DeepSeek API 失败**：chain 的 E 环节捕获，`ModelOutput.error` 记录，Layer1 `noError=false`，后续 F/G 跳过，该样本该 matrix 记为失败。
- **裁判未配置**：Layer3 `judged=false`，报告标注 "Layer3 skipped"，L1/L2 仍正常。
- **tree-sitter 解析失败**：Layer2 `syntaxValid=false`，不中断链路。
- **graph adapter spawn 失败**：该 adapter 该样本记失败，不中断整批。
- **单个样本失败不阻塞整批评测**：runner 收集失败、报告里单列失败统计。

## 9. 不做的事（YAGNI）

- 不做独立 Engine Server（单体先验证效果）。
- 不做真实会话录制（第一版用真实文件+人造光标，预留接口）。
- 不实现 graphify/codegraph adapter（第一版 Noop，后续 clone 并入）。
- 不实现规则版意图识别（第一版 Noop，后续作为 adapter 对比）。
- 不做 Pass-to-Run（需要真实项目环境，重）。
- 不做 L3 的标注答案 EM/编辑距离（第一版用 LLM-judge）。
- 不做在线 A/B（需用户埋点，太早）。
- 不做 context/intent probe 的召回率/对错评判（Noop 基线下无意义，等真实 adapter）。

## 10. 后续演进

1. clone graphify/codegraph，适配成 ContextAdapter，接入对比矩阵。
2. 实现规则版 IntentDetector（PD-supplement §6.3.1 六类规则），作为 intent adapter 对比。
3. 真实上下文收集（import graph + AST graph，范围按评测结果定）。
4. context/intent probe 补召回率/噪声率/对错评判（需标注"应召回哪些""应识别成什么意图"）。
5. 真实会话录制接口落地（样本从乙升级到甲）。
6. 效果验证完、链路稳定后，再抽独立 Engine Server（Phase 3+）。
7. 教师对话面板（Phase 2+，影响意图识别，不写代码）。
