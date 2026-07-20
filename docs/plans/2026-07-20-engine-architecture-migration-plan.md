# Engine、CodeGraph 与意图编排迁移计划

> **状态：架构迁移尚未实施；Eval 对照原型已落地。**
>
> 本计划将 FIM 从当前的单体 VS Code FIM 调用迁移为“代码事实骨架 + CodeGraph 衍生的代码智能 + 意图 LLM + 可替换 Writer”的本地 Engine。先用 TypeScript 建立边界，最后才评估并替换为 Go。Engine 是逻辑边界，不预设为常驻 Server；当前产品仍保持 DeepSeek-only。

## 实施记录

- **2026-07-20（初版）：** `eval` 已加入 `baseline`、`codegraph`、`codegraph-planner` 三组矩阵的 adapter 与配置（见 `eval/config.ts`）。CodeGraph context adapter、DeepSeek intent planner、样本意图真值已实现并通过编译。完整的 DeepSeek API 对照尚待使用真实 key 运行——迄今唯一跑通的报告（`eval/reports/2026-07-19T15-41-51-001Z`）仅覆盖 `noop-noop` 矩阵 5 个样本，且尚未接入 intent 命中率与上下文 token 聚合字段。
- **2026-07-20（评审修订）：** 架构评审后固化两点（详见 §0）：(1) 评测度量存在 L2/L3 打架与空补全假性通过，baseline 通过率在修复前不可作为对照判据；(2) DeepSeek FIM 走 `/beta` endpoint + split-only（服务端注入 token），`hasFimTokens` 不可作 FIM 判据。Engine 只固定逻辑边界，具体封装与部署方式在实施时决定（详见 Phase 5）。
- Engine、代码智能实现、生产 prompt builder、可选 RPC 化和 Go 替换仍未开始，后续阶段以本计划为准。

## 0. 前置事实与防错

以下事实与架构选择无关，任何阶段都必须遵守，避免重复踩坑。

### 0.1 评测度量必须先可信，再谈对照

当前 eval 的 baseline 汇总通过率（L1/L2/L3）在修复下列问题前**不可作为对照判据**；Phase 6“没有收益则不进默认路径”依赖这些数字可信。这些问题是度量层 bug，与是否引入 CodeGraph、Intent Planner 或更换 Engine 形态完全无关。

- **L2 与 L3 指标打架**：`syn-block-start`、`syn-import` 在 `eval/metrics/layer2_syntax.ts` 中被判 `syntaxValid:false`（tree-sitter `errorNodeCount>0`），但 L3 judge 判定语法正确并给高分（10/8）。根因是 L2 自行拼接 `prefix + completion + suffix` 时的切分，与 `eval/chain.ts` 实际下发给模型的 `prompt`/`suffix` 不一致。修复方向：让 L2 直接消费 chain artifacts 中的 prefix/suffix，而非重新切分；或对齐切分逻辑。
- **空补全假性通过**：`syn-line-continuation` 的 `layer1.hasCompletion:false`（补全返回空），却因空串天然“语法通过”计入 L2 通过并拿 L3 满分。修复方向：`hasCompletion:false` 的样本在 L1 层标记为“未生成”，并从 L2/L3 通过率分母中排除或单独归类。

未经此修复，`codegraph` / `codegraph-planner` 矩阵相对 `baseline` 的任何 +/- 都是噪声，无法支撑“增强是否值得”的判断。

### 0.2 DeepSeek FIM 端点事实

- FIM 是 DeepSeek `/beta` base_url 下的**独立 completion endpoint**，不是 chat completion 的能力。
- 本项目采用 **split-only**：客户端只传 `prompt`（prefix）与 `suffix`，FIM 分隔 token（`<｜fim▁begin｜>` / `<｜fim▁hole｜>` / `<｜fim▁end｜>`）由**服务端注入**，客户端 `prompt` 里不应出现这些 token。
- 因此 `eval/probes/prompt.ts` 的 `hasFimTokens` 在 split-only 下**恒为 false**，**不能**用作“是否走了 FIM”的判据。判断是否走 FIM 应检查请求 path 是否指向 `/beta`、以及 `suffix` 是否被独立传递。
- `deepseek-chat` 在 `/beta` FIM endpoint 下的实际补全质量，**必须用真实 key 跑 eval 验证**，不得凭模型名臆断其“不支持/支持 FIM”。（架构评审中曾因此误判 baseline 存在“未注入 FIM token”的 bug，实际是 split-only 设计使然——记此防再犯。）

## 1. 决策

### 1.1 图谱 vendor

选择 **CodeGraph** 作为初始代码智能实现来源。FIM 不承诺原样、完整地引入它：可以只保留需要的索引、符号、调用图和增量更新能力，也可以维护裁剪或 fork 后的实现。Graphify 不纳入默认链路，因为它面向多模态知识图谱，和当前代码补全所需能力不匹配；未来若有明确需求，可按同一 `GraphProvider` 契约评估。

代码智能仅作为可选、本地、可降级的能力。它不可用、未安装、未完成索引或索引过期时，补全必须退回当前文件的 prefix/suffix 与 AST，不得阻塞编辑。

### 1.2 部署方式延后决定与云端模型

“无产品遥测”指 FIM 不自行收集、分析或上传使用数据；它不要求模型必须本地运行。用户配置云端模型时，FIM 会把完成请求所需的代码上下文发送给该 provider，包括启用意图 planner 后的相关代码子图。provider、endpoint、密钥和发送范围必须由用户明确配置，FIM 不向未配置的第三方发送数据。

Engine 的逻辑边界固定，但部署方式不是本计划的决策项。实现时可按当时的性能、平台分发、vendor 改造范围和多客户端需求选择合适形态；本计划只要求这些选择不泄漏到 Extension Adapter、协议和业务编排中。

### 1.3 事实与推断的边界

代码层拥有事实，LLM 只做推断和补足：

- 代码层读取当前 document、精确 prefix/suffix、AST、原始图谱查询结果和原始代码片段。
- 代码层确定 token 上限、忽略规则、可访问文件范围、调用深度与最终 prompt 骨架。
- 意图 LLM 从相关代码子图中推断用户可能要做什么、应遵守哪些约束、还需要哪些已存在的符号。
- 意图 LLM 不得重写 prefix/suffix，不得返回任意 prompt，不得发明未经代码层验证的符号或文件。
- Prompt Builder 验证 LLM 的结构化结果，按符号 ID 取原始代码，再合成为最终 Writer 输入。

### 1.4 Writer 策略

FIM Writer 保留为默认路径。其价值是精确填入光标位置并与 suffix 对齐，而不是承担项目理解。

| 场景 | 编排 | Writer |
| --- | --- | --- |
| 自动或简单补全 | 代码骨架 + 可选图谱上下文 | DeepSeek FIM |
| 手动或复杂补全 | 代码骨架 + 图谱子图 + 意图 LLM | DeepSeek FIM |
| 实验路径 | 同一上下文与意图 | Direct Code Writer |

Direct Code Writer 不在产品中预设启用。它必须通过相同数据集上的质量、suffix 对齐、延迟和接受率评测，才可能替代某类 FIM 请求。

## 2. 目标流程

```text
VS Code 编辑器状态
  -> Extension Adapter
  -> Local Engine
       -> 代码层：prefix/suffix、AST、范围与预算
       -> CodeGraph：从当前符号出发构建相关代码子图
       -> Context Assembler：原始代码、签名、调用/被调用关系
       -> Intent Planner LLM：意图、约束、补充符号请求
       -> Prompt Builder：验证 planner 输出，填充固定骨架
       -> Writer：默认 DeepSeek FIM，实验性 Direct Writer
       -> Postprocessor
  -> Inline ghost text
```

图谱的职责是把项目压缩为与当前编辑点相关的代码子图，不是直接生成 prompt，也不是替 LLM 断言用户意图。

## 3. 目标目录

```text
apps/
  vscode-extension/
    src/
      extension.ts                  # VS Code 生命周期、命令、侧边栏
      inline-completion-provider.ts # 编辑器 API <-> protocol
      request-mapper.ts             # document/cursor/diagnostics -> CompletionRequest
      engine-client.ts              # Engine 流式调用适配
      webview/                      # 现有 React 设置 UI

packages/
  protocol/
    src/
      completion.ts                 # 请求、响应、流式事件
      planner.ts                    # IntentPlan 与校验结果
      graph.ts                      # GraphEvidence / ContextChunk
      feedback.ts
      errors.ts

services/
  engine-ts/
    src/
      completion/orchestrator.ts
      context/current-file.ts
      context/graph-assembler.ts
      planning/intent-planner.ts
      planning/plan-validator.ts
      prompt/builder.ts
      model/deepseek-fim.ts
      model/intent-client.ts
      postprocess/processor.ts
      cache.ts

  code-intelligence/
    src/
      provider.ts                   # GraphProvider 实现
      codegraph-adapter.ts          # 可裁剪或 fork 的 CodeGraph 适配
      indexer.ts                    # 索引与增量更新
      lifecycle.ts                  # init/sync/status/close
```

`engine-ts` 不得依赖 `vscode` 或第三方图谱实现的内部 API；它只依赖 `GraphProvider` 协议。`code-intelligence` 的具体封装、分发和运行方式在实施时决定，其运行时约束不得泄漏到 VS Code Extension Host 或未来 Go Engine。

## 4. 核心契约

### 4.1 补全请求

```ts
interface CompletionRequest {
  requestId: string
  workspace: { id: string; rootUri: string; revision?: string }
  document: {
    uri: string
    languageId: string
    text: string
    version: number
  }
  cursor: { line: number; character: number }
  mode: "automatic" | "manual"
  config: CompletionConfig
  provider: DeepSeekProviderConfig
}
```

当前未保存的 document 内容始终由 Extension 传入，绝不由图谱索引替代。

### 4.2 图谱与上下文

```ts
interface GraphProvider {
  status(workspace: WorkspaceRef): Promise<GraphStatus>
  refresh(request: GraphRefreshRequest): Promise<GraphRefreshResult>
  expand(seed: GraphSeed, budget: GraphBudget): Promise<GraphEvidence[]>
  read(symbolIds: string[], budget: TokenBudget): Promise<ContextChunk[]>
}

interface GraphEvidence {
  symbolId: string
  filePath: string
  relation: "definition" | "caller" | "callee" | "reference" | "import"
  signature?: string
  freshness: "fresh" | "stale"
  provenance: "codegraph"
}
```

`expand()` 只返回结构与可追溯证据；`read()` 才读取原始代码。Context Assembler 根据预算展开子图并保留文件路径、行范围和关系来源。

### 4.3 意图计划

```ts
interface IntentPlan {
  intent: IntentType
  confidence: number
  scope: "expression" | "statement" | "block" | "function"
  constraints: string[]
  requestedSymbolIds: string[]
}
```

Planner 只返回 JSON。Plan Validator 必须验证：符号存在于 `GraphEvidence`、scope 不超过当前可写范围、约束长度受限、置信度不足时回退到无 planner 路径。

## 5. Prompt 骨架

最终 prompt 由代码层拼装，顺序固定：

```text
[可选：已验证的项目上下文]
  - 原始相关代码片段
  - 符号签名与调用关系
  - 已验证的 IntentPlan 约束

[不可变：当前文件语言与路径]
[不可变：当前文件 prefix]

suffix = [不可变：当前文件 suffix]
```

意图 LLM 可以补足“相关代码应如何解释”，但原始代码和 prefix/suffix 是事实来源。它不得把摘要替换成代码，也不得决定最终 FIM 分隔格式。

“所有相关代码”指由图谱子图和 token budget 定义的完整相关集合，而不是不受限地传整棵依赖树。预算不足时优先保留：当前符号定义、直接 caller/callee、类型/接口、测试或调用约定；再按关系距离和新鲜度裁剪。

## 6. 实施阶段

### Phase 0: 固化当前行为

1. 为 skip 判定、prefix/suffix、DeepSeek split-only body、流式 chunk、stop word、截断和 AST 边界建立纯函数测试。
2. 建立 golden fixtures：单行续写、函数体、import、注释转代码、取消、网络错误。
3. 记录 FIM 基线：首 token、完成延迟、生成 token、语法通过率和人工/可观测接受率。

**验收：** `npm run build`、`npm run lint` 和现有测试通过；fixtures 不需启动 VS Code。

### Phase 1: 先拆逻辑边界，暂不移动整个仓库

1. 在现有仓库中提取 JSON 可序列化 protocol 和不依赖 VS Code 的 Engine 核心。
2. 从 `CompletionProvider` 迁出 FIM request builder、流式 accumulator、formatter、postprocessor 和缓存接口。
3. 保持当前补全行为等价，不在本阶段决定 Engine 的封装或部署方式。
4. 将 Extension Host 使用的纯工具从 `src/webview/utils.ts` 移到共享层。

**验收：** Engine 核心没有 `vscode` import；运行结果与 Phase 0 golden fixtures 一致。

### Phase 2: 代码智能 spike 与数据边界设计

1. 用 CodeGraph 的可裁剪实现验证索引、增量同步、符号查询、caller/callee 和结构化输出。
2. 验证安装、首次索引、冷启动、热查询、文件变化后的新鲜度和失败恢复。
3. 保持 `GraphProvider` 独立于 vendor 的封装和运行方式；具体部署选择留到实现时根据实际数据决定。
4. 增加本地索引的 workspace 级启用、索引位置说明、忽略规则、状态页、清除和重建入口；云端 completion/planner 发送的上下文遵循用户配置的 provider 与发送范围。
5. 验证 `.codegraph/` 不会被误提交，并记录其磁盘占用与清理行为。

**验收：** 证明裁剪后的代码智能实现能稳定输出本地、结构化、可追溯的图谱查询结果；否则停止，不将其接入主链路。

### Phase 3: 图谱子图与代码上下文组装

1. 从当前 AST 节点、文件、import 和局部标识符生成 `GraphSeed`。
2. 用 CodeGraph 获取定义、直接 caller/callee、引用和依赖边。
3. 实现 Context Assembler：按关系距离、新鲜度和 token budget 组装原始代码片段。
4. 实现完整降级：图谱 disabled/stale/error 时仅使用当前文件上下文。
5. 先接入手动触发；自动补全只允许极小、缓存命中的图谱查询。

**验收：** 每个注入 prompt 的跨文件片段都可追溯至符号、文件、行范围和关系；不会读取忽略文件或未授权 workspace。

### Phase 4: 意图 Planner 与固定 Prompt Builder

1. 用本地规则产生初始 intent 与 scope，避免每次自动补全调用 planner。
2. 仅在手动触发、复杂 AST 位置或低置信场景调用 Intent Planner。
3. Planner 接收当前文件事实和已组装的相关代码子图，返回 `IntentPlan` JSON。
4. Plan Validator 验证 symbols、scope、长度和置信度；失败时舍弃 plan，而不是阻断补全。
5. Prompt Builder 将已验证约束与原始代码放入固定 FIM 骨架；精确 prefix/suffix 始终由代码层保留。

**验收：** planner 的输出不可能直接改写当前文件事实；planner 超时、格式错误或幻觉均能无损回退。

### Phase 5: Engine 集成

将 Extension Adapter 接到 Engine 核心，但不在本计划中指定二者如何部署或通信。实施时选择最适合当前需求的运行方式；该选择不得改变 `CompletionRequest`、流式 completion、取消、feedback、错误处理或 CodeGraph provider 的业务语义。

1. Extension 只通过稳定接口请求 completion、取消请求并回传 feedback。
2. Engine 管理请求去重、并发锁、超时、缓存和上游 DeepSeek 取消。
3. 密钥不写日志、缓存或磁盘。
4. 若实际实现引入外部进程或服务，其启动、退出、崩溃恢复和资源清理由一个统一生命周期管理器负责。

**验收：** Extension 不依赖 Engine 内部实现细节；切换文件、关闭窗口、停止生成与 Extension Host 重载不会泄漏请求或任何实施时引入的资源。

### Phase 6: Eval v2 与 Writer 对照

1. 将 eval 从直接 import `src/extension` + VS Code stub，迁移为 protocol/Engine contract tests。
2. 样本升级为 workspace fixtures：当前文件、相关文件、图谱期望符号、期望 intent、期望约束和忽略文件。
3. 将 intent 链改为 `基础信号 -> 图谱子图 -> IntentPlan -> 精确 context`，不再让 IntentAdapter 脱离 ContextIR 单独运行。
4. 运行对照矩阵：
   - `baseline-fim`
   - `codegraph-context-fim`
   - `codegraph-planner-fim`
   - `codegraph-planner-direct-writer`
5. 新增指标：intent F1、符号/文件 Top-k 召回、上下文 token 效率、图谱新鲜度、查询 P50/P95、suffix 对齐、生成质量、端到端延迟和接受率。
6. 每组固定相同的 fixture、模型、温度和重复次数，避免模型随机性掩盖差异。

**验收：** 任何增强路径必须相对 baseline 在目标指标上有可重复收益；没有收益则不进入默认路径。

### Phase 7: Go 替换准备与执行

1. 将 protocol 固化为语言无关 schema，并在 CI 运行流式、取消和错误码 contract tests。
2. 记录 TypeScript Engine 的 CPU、内存、首请求、稳态延迟、失败率和代码智能开销。
3. 仅在性能或部署数据证明值得时，创建 Go Engine 实施计划。
4. Go Engine 复用 protocol、fixtures、contract tests 和 `GraphProvider`；不得改写 VS Code adapter 或图谱 vendor 边界。

**验收：** Go 替换只改变 Engine 实现，不改变协议、评测、Extension UI 或补全语义。

## 7. Eval 指标

| 层级 | 指标 | 目的 |
| --- | --- | --- |
| 图谱 | 索引/同步耗时、查询 P50/P95、新鲜度、忽略文件泄漏 | 判断 vendor 是否适合热路径 |
| Context | 相关符号/文件 Top-k、token 效率、可追溯率 | 判断子图是否真的带来相关代码 |
| Planning | intent F1、约束命中、置信度校准、无效 plan 回退率 | 判断 LLM 是否正确理解任务 |
| Writer | has completion、语法、suffix 对齐、重复率、LLM judge | 判断实际补全是否变好 |
| 产品 | 首 token、总延迟、接受率、取消成功率 | 判断用户体验是否值得复杂度 |

## 8. 风险与约束

| 风险 | 控制措施 |
| --- | --- |
| 图谱扩大上下文却降低质量 | 严格 token budget、baseline 对照、按关系距离裁剪 |
| planner 幻觉或改写事实 | 只接受 JSON plan；代码层验证 symbol ID 与 scope |
| 图谱实现的运行时或分发限制 | 保持 `GraphProvider` 边界；在实施时选择合适封装，不影响 Extension 与编排逻辑 |
| 索引泄露或磁盘数据不可控 | 显式授权、可见路径、忽略规则、清除入口、默认关闭 |
| 自动补全延迟上升 | planner 只用于手动/复杂请求；自动路径限时与降级 |
| FIM 与 Direct Writer 的比较失真 | 同一 fixture、相同上下文、重复运行、记录 suffix 对齐 |
| TypeScript 与 Go 双维护 | protocol/contract tests 先稳定；Go 只替换实现 |

## 9. 完成定义

本计划完成时，FIM 仍是 DeepSeek-only 的 VS Code 补全产品，但已具备：

1. 一个可独立运行、可被未来 Go 替换的本地 Engine。
2. 一个可选、可降级、可由 CodeGraph 裁剪或 fork 实现的代码智能 provider。
3. 一个不篡改代码事实的意图 LLM 编排层。
4. 一个同时评测 FIM Writer 与 Direct Writer 的独立 Eval v2。
5. 由质量、延迟、接受率和隐私约束共同决定的默认策略，而非假定图谱或直接生成必然更好。
