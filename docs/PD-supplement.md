
# FIM: Fill-in-the-Middle 补全系统 — PD 补充与难点清单

> 本文档是对 `docs/PD.md` 的增量补充。PD.md 已标注为「未来跨编辑器架构参考」，本文档同理。
>
> **各章节当前适用情况：**
>
> | 章节 | MVP 适用 | 说明 |
> |------|---------|------|
> | §1 IntentDetector 触发规则表 | ✅ 适用 | 意图识别是当前 MVP 技术验证核心 |
> | §2 预计算机制（Prefetcher） | ❌ Phase 2+ | MVP 先停顿触发 + KV cache |
> | §3 L1/L2 模型路由 | ❌ Phase 2+ | 当前只有云端 DeepSeek，无本地模型 |
> | §4 KV cache 复用 | ❌ 只做静态前置 | 块对齐、预计算兜底为优化项 |
> | §5 FeedbackEvent 简化 | ✅ 适用 | 只记录 Tab 接受，当前代码改造参考 |
> | §6 服务端进程生命周期 | ❌ Phase 3+ | 独立 Engine Server 属于远期跨编辑器架构 |
> | §7 tree-sitter 输入传输 | ✅ 适用 | MVP 传全文 + 缓存 tree |
> | §8 Postprocessor 范围控制 | ✅ 适用 | 11 步后处理链已存在于 completion-formatter.ts |

> **⚠️ 参见当前 MVP 权威文档：[`fim-overall-design.md`](./fim-overall-design.md)**

## 1. IntentDetector 触发规则表（补充 §6.3）

### 6.3.1 触发规则（Intent Gate）

意图识别器除了判断补全类型，还承担"这次停顿值不值得调 LLM"的门控职责。门控由本地规则完成，0 token、0ms，是降低 API 调用成本和提升响应感的第 1 道闸门。

#### 值得触发预计算的时机（白名单）

| 触发信号 | 推断意图 | 理由 |
| --- | --- | --- |
| 按下 Enter（新起一行） | block_completion | 新行大概率需要补全函数体/块体 |
| 输入 `{` `(` `[` `:` `=>` | block_completion | 块开始，多行补全概率高 |
| 输入 `.` | member_access | 成员访问，补方法/属性名 |
| Tab 接受上次补全后 | line_continuation | 链式补全，用户接受说明信任度高 |
| 显式 Alt+\ 手动触发 | any | 用户主动要求，必响应 |
| 停顿 ≥ debounceWait 且未在白名单也未在黑名单 | fallback | 兜底，覆盖漏网场景 |

#### 直接 skip 的时机（黑名单）

| 触发信号 | 理由 |
| --- | --- |
| 普通字母键（打词中间过程） | 词未写完，补全无意义 |
| 空格、分号、逗号、括号闭合 | 这些字符后补全价值低 |
| 光标在单词中间 | 已有 isMiddleOfString 判定 |
| 删除/撤销操作 | 用户在修正，不是在写新内容 |
| 纯缩进变化 | 只是格式调整 |
| 上次补全被忽略（非 Tab 接受）且未移动光标继续打字 | 用户用脚投票，短期降权 |

#### 配置

```text
fim.intentGate.enabled         (默认 true)      可关闭门控，回退到纯停顿触发
fim.intentGate.aggressiveness  (默认 "balanced")
  strict    只白名单
  balanced  白名单 + 停顿兜底
  off       纯停顿触发
```

#### 与预计算的关系

- 白名单命中 → 立即触发预计算（不等停顿）
- 停顿兜底 → 仅在未命中白名单也未命中黑名单时触发
- 黑名单命中 → 直接 skip，不发请求

#### 难点 4：意图门控边界

规则太严会漏补全（用户觉得"不灵"），太松会浪费请求（成本和延迟都上来）。

具体风险点：

- `.` 触发：在数字 `1.5` 中间打 `.` 也会触发，误判
- Enter 触发：空行 Enter（只是隔行）不该触发，但规则难区分
- Tab 接受后链式：用户 Tab 接受后又立刻删了，链式预取就浪费了

可能的解法（待验证）：

1. 冷启动用宽松规则 + 日志驱动收敛：MVP 用 `balanced`，记录每次触发的后续接受率，低接受率的规则逐步收紧
2. 复合信号：单个信号误判率高，用"Enter + 当前行非空 + 上一行非空"这种组合条件
3. 用户可调：暴露 `aggressiveness` 配置，让用户根据自己的打字习惯调

**建议**：门控规则表是 MVP 起点，不是终态，需要实测调参。PD §12 的质量指标（Acceptance Rate / Empty Result Rate）应作为门控调优的反馈信号。

---

## 2. 预计算机制（补充 §6.5）

### 6.5 Prefetcher（预计算器）

Prefetcher 在用户打字过程中，于关键时机（由 IntentDetector §6.3.1 白名单触发）主动发起后台补全请求，结果写入 PrefetchCache。用户停顿触发时，Orchestrator 先查 PrefetchCache，命中则接管已有流，未命中再实时请求。

#### 设计依据

| 来源 | 关键事实 | 对预计算的意义 |
| --- | --- | --- |
| vLLM Automatic Prefix Caching 文档 | APC 只减 prefill 不减 decoding，前缀不匹配时无收益 | 预计算的价值依赖前缀稳定化（见 §11.1） |
| Ollama API 文档 | `keep_alive` 默认 5m，模型常驻内存 | 本地模型常驻是预计算的前提，预取请求不触发重新加载 |
| GitHub Copilot 官方博客 | neighboring tabs 与 FIM 在后台运行不增加延迟 | 证明预计算可做到对用户无感 |

#### 用户场景与预计算的价值

场景 1 — 用户知道要写什么，边写边看 ghost text

- 预计算让 ghost text 在停顿前出现，用户扫一眼就 Tab
- "快"比"好"重要，小模型足够
- 云端大模型在这个场景反而有害（等待打断节奏）

场景 2 — 用户不确定，写半截/伪代码

- 小模型对不完整 prompt 有容忍度，基于上下文给参考
- 用户拿 ghost text 当灵感，不一定 Tab
- 如果想要高质量补全，手动 Alt+\ 触发 L2 云模型

预计算 + 小模型覆盖场景 1 的日常打字；L2 云模型覆盖场景 2 的深度思考。两者通过 triggerKind 路由（见 §6.6），互不干扰。

#### 预取时机（由 IntentDetector 白名单驱动）

```text
Enter（换行）   → 新行大概率补块体，prefix 稳定
{ ( [ : =>     → 块开始，接下来补内容
.              → 成员访问，补方法名
Tab 接受后      → 链式补全
Alt+\          → 用户主动要求，必响应

这些时机立即后台发请求，不经过 debounce。
```

#### 工作流程

```text
关键时机触发 → 后台 ModelClient.complete() 流式跑
               onData 回调 → 累积到 PrefetchedRequest.buffer

用户停顿 → Orchestrator 查 PrefetchCache
           ├ 命中且 prefix 一致 → 接管流（见下）
           ├ 命中但 prefix 偏离 → abort + 实时重发
           └ 未命中 → 走正常实时请求
```

#### 流接管机制（核心）

预取流不停在"跑完才算数"。停顿时若预取仍在 streaming，Orchestrator 把该流的回调切换到前台显示，已累积的 buffer 一次性 flush。

```typescript
interface PrefetchedRequest {
  abort: () => void
  buffer: string                  // 已累积 token
  status: "streaming" | "done"
  attach(onData, onEnd): void     // 停顿时调用，切换回调到前台
}

// 预取时: onData 写 buffer
// 停顿时: attach(前台onData, 前台onEnd)
//         → buffer flush 给前台
//         → 后续 token 直接送 InlineCompletionProvider 显示
```

用户看到的体验：停顿瞬间已有半截 ghost text 显示（预取累积的），后续 token 继续流入 → ghost text 实时增长。

#### PrefetchCache 条目结构

```text
{
  promptHash: string        // prefix+suffix+cursorPos 的 hash
  buffer: string            // 已累积的 token
  status: "streaming" | "done" | "aborted"
  timestamp: number
  modelId: string           // 区分 L1/L2
  prefixSnapshot: string    // 命中校验用
  request: PrefetchedRequest
}
```

#### 过期与淘汰

- TTL: 默认 2000ms（预取结果只在短时间窗口内有意义）
- 容量: LRU，默认 5 条
- 失效: 用户继续打字导致 prefix 偏离 → 该条目作废

#### 难点 1：预计算请求生命周期

预取请求在飞，用户还在打字，什么时候 abort、什么时候留着？

```text
t=0ms    按 Enter → 预取请求 A 发出(prefix="...foo()\n  ")
t=50ms   打 "r"   → prefix = "...foo()\n  r"
t=100ms  打 "et"  → prefix = "...foo()\n  ret"
t=300ms  停顿     → 真实 prefix = "...foo()\n  ret"
```

请求 A 的 prefix 和停顿时已不同，A 的 buffer 不能直接接管。

文献依据：

- vLLM APC 文档：前缀不匹配时缓存无收益 → 等价于"预取结果对偏离的 prefix 不可用"
- Ollama keep_alive：即使 abort，已算完的前缀 KV 仍留在内存，下一次请求可复用

可能的解法（待验证）：

1. prefix 偏离度判断：停顿时比较真实 prefix 和预取 prefixSnapshot。若真实 prefix 是预取 prefix 的前缀延伸（用户只是继续打字），可接管；若出现分叉（用户删改、跳行），abort 重发
2. N+1 变体预取：预取时同时取"当前 prefix + 换行"的变体，覆盖用户继续打字的常见路径
3. abort 不浪费：本地模型 abort 后 KV cache 保留，下一次请求 prefill 成本降低

**建议**：预取生命周期是 MVP 之后的优化项。MVP 先做"停顿触发 + KV cache"即可拿到大部分收益；预取作为 Phase 2 增强。

#### 难点 3：SSE 流式 + PrefetchCache 协议

预取是流式累积，停顿时 buffer 可能只有半截，要等还是重发？

文献依据：

- vLLM APC：prefill 占大头，重发要重算 prefill → 接管比重发划算
- Ollama keep_alive：重发的 load_duration 接近 0，但 prompt_eval_duration（prefill）仍要重算

解法：MVP 默认接管流，不重发。机制见流接管机制。

唯一重发的情况：预取 prefix 与停顿时真实 prefix 偏离过大（归难点 1 判断）。

---

## 3. L1/L2 模型路由（补充 §6.6）

### 6.6 ModelClient 与 L1/L2 路由

ModelClient 暴露统一 `complete()` 接口，内部按 triggerKind 路由到 L1（本地）或 L2（云端）。两套实现独立开发、独立取舍，互不耦合。

#### 设计原则

- 同一入口：Orchestrator 只调 `ModelClient.complete()`，不知道请求最终去了本地还是云端
- if 分流：路由逻辑集中在 ModelClient 内部一处，便于后续替换或禁用任一层
- 互不干扰：L1 和 L2 的 provider 配置、请求构造、错误处理完全隔离

#### 路由规则

```text
triggerKind = "automatic" (短停顿 + 预计算)
  → L1 本地小模型
  → 理由: 高频、体验敏感、错得起

triggerKind = "long-pause" (停顿 ≥ longPauseThreshold)
  → L2 云端 API
  → 理由: 用户卡住了，值得给高质量结果
  → 不做预计算，停顿确认后才发请求

triggerKind = "manual" (Alt+\)
  → L2 云端 API
  → 理由: 用户主动要求

配置:
  fim.l1.debounceWait        (默认 300ms)   L1 触发延迟
  fim.l2.longPauseThreshold  (默认 2000ms)  L2 长停顿阈值，可调
  fim.l2.enabled             (默认 false)   不配置就不调 API
```

#### 为什么 L2 只在长停顿或手动触发

停顿等 1s 很烦，因为补全命中率不是 100%。用户停顿 5 次可能只有 2 次 ghost text 是想要的。如果每次停顿都等 1s：5 次停顿 × 1s = 5s 干等，其中 3 次等完发现补全不对 → 白等 → 用户会关掉自动补全。

小模型的价值不是"质量"，是"让白等的成本趋近于 0"。1.5B 本地模型 TTFT 200ms，即使补全不对，用户扫一眼就忽略，不心疼。这是为什么小模型必须做 L1 主力——不是因为它好，是因为它"错得起"。

L2 云端 API 每次调用都重发完整 prompt，input token 计费。实时读用户输入会导致缓存命中率为 0，每次都是全额 input token。用户删改代码更让上下文回退，预取结果全作废。所以 L2 不做预计算，只在"用户真的停下来想了"的时候调。

#### 统一接口

```typescript
interface ModelClient {
  complete(request: ModelRequest): Promise<ModelResponse>
}

interface ModelRequest {
  prompt: string
  triggerKind: "automatic" | "manual" | "long-pause"
  abortSignal: AbortSignal
  onData?: (chunk: string) => void   // 流式回调
}

interface ModelResponse {
  text: string
  model: string
  provider: "l1-local" | "l2-cloud"
  latencyMs: number
  cached: boolean
}
```

#### 实现拆分

```text
ModelClient (统一入口)
  ├ LocalModelClient  → Ollama /v1/completions
  │   └ keep_alive 常驻，suffix 字段原生 FIM 支持
  └ CloudModelClient  → OpenAI-compatible /v1/chat/completions
      └ 按 provider 类型拼 body (复用现有 provider-options.ts)
```

#### 配置

```text
fim.l1.enabled      (默认 true)  本地模型开关
fim.l1.model        (默认 "qwen2.5-coder:1.5b")
fim.l1.baseUrl      (默认 "http://127.0.0.1:11434")
fim.l1.keepAlive    (默认 "30m")  模型常驻时长
fim.l2.enabled      (默认 false) 云模型开关
fim.l2.provider     云端 provider 配置
```

#### 难点 6：本地模型硬件门槛

用户机器跑不动 7B/14B 怎么办？模型选择策略？

事实依据（Ollama 官方页面 ollama.com/library/qwen2.5-coder）：

| 模型 | Ollama 下载大小 | 32K context | 适合的硬件 |
| --- | --- | --- | --- |
| 0.5B | 398MB | ✓ | 任何机器（含 4GB RAM） |
| 1.5B | 986MB | ✓ | 8GB RAM 的笔记本 |
| 3B | 1.9GB | ✓ | 8-16GB RAM |
| 7B | 4.7GB | ✓ | 16GB RAM + 可选 GPU |
| 14B | 9.0GB | ✓ | 32GB RAM 或 8GB+ VRAM |
| 32B | 20GB | ✓ | 64GB RAM 或 24GB+ VRAM |

分析：

- 1.5B（986MB）是消费级笔记本的甜点——几乎所有开发机都能跑
- 7B（4.7GB）需要 16GB RAM，部分老机器吃力
- 32B 性能接近 GPT-4o，但 20GB 下载 + 64GB RAM 门槛排除大部分用户
- Qwen 官方说明 1.5B 是 base model（非 instruct），适合 FIM 任务

可能的解法：

1. 默认 1.5B + 引导升级：首次启动检测可用内存，默认推荐 1.5B（986MB）；检测到 16GB+ RAM 时推荐 7B；用户可在设置里手动改
2. 不把模型选择写死在代码里：`fim.l1.model` 是配置项，用户可填任意 Ollama 模型名；FIM 只负责把 prompt 发给 Ollama，不关心模型大小；文档提供推荐表，让用户按硬件选
3. L1 不可用时静默降级：Ollama 没启动 / 模型没拉 → 自动补全不工作，但不报错；用户手动 Alt+\ 时，若 L1 不可用且 L2 已配置 → 直接走 L2；状态栏提示 "L1 unavailable, manual trigger uses L2"

**建议**：

- MVP 默认模型 `qwen2.5-coder:1.5b`（覆盖最广）
- 不做自动内存检测和模型推荐（YAGNI），让用户按文档自己选
- L1/L2 的可用性检测放在 Engine Server 启动时做一次，结果缓存

---

## 4. KV cache 复用与前缀稳定化（补充 §11.1）

### 11.1 KV cache 复用与 prompt 前缀稳定化

本地模型（Ollama/llama.cpp）在 keep_alive 期间模型常驻内存，已计算的 prompt 前缀 KV cache 可被后续请求复用，跳过 prefill。这是本地模型 TTFT 接近实时的关键技术。

#### 命中机制（以 vLLM/llama.cpp 为例）

- KV cache 以固定大小块为单位（通常 16 token/block）
- 每个块的 hash = hash(父块 hash + 本块 token)
- 新请求按 prompt token 逐块查 hash，命中则跳过该块 prefill
- 只缓存完整块，不满 16 token 的尾部不缓存

来源：vLLM Prefix Caching 设计文档（docs.vllm.ai/en/latest/design/prefix_caching.html）。

#### FIM prompt 的命中率问题

FIM prompt 结构（以 Qwen 为例）：

```text
<|fim_prefix|>{fileContext}\n{header}{prefix}<|fim_suffix|>{suffix}<|fim_middle|>
```

问题：每打一个字符，`{prefix}` 就变，从 `{prefix}` 开始的所有块全 miss。命中率取决于 `{prefix}` 在整个 prompt 中的位置。

#### 前缀稳定化策略

1. 静态部分前置：fileContext + header 放在 `{prefix}` 之前 → 这些 token 跨请求稳定，块命中率高 → 即使 `{prefix}` 变了，前面的块仍命中
2. 动态部分后置：`{prefix}` 放在尽量靠后 → 命中的静态部分占 prompt 主体 → miss 的只有 `{prefix}` 开始的尾部块
3. contextLength 控制：静态部分 + 动态 prefix 总长不超过模型 context 上限（Qwen2.5-Coder 32K）

#### 命中率估算

```text
典型 prompt 结构 (contextLength=100 行):
  静态部分 (fileContext+header): ~200 token (13 块)
  动态 prefix:                   ~800 token (50 块)
  suffix + special tokens:        ~150 token (9 块)
  总计:                           ~1150 token (72 块)

用户打 1 个字符 (prefix 末尾 +1 token):
  仍命中: 前 13 块 (静态部分) = 18% 块命中
  miss:   后 59 块 (动态部分)

优化后 (静态部分扩到 600 token):
  仍命中: 前 37 块 = 51% 块命中
  miss:   后 35 块
  → prefill 时间减半
```

#### 难点 2：KV cache 命中率

每打一个字符 prefix 就变，从变化点开始的块全 miss。命中率取决于"变化点之前有多少稳定 token"。

场景演示（基于 vLLM 块大小 16 token）：

```text
prompt = [fileContext 200token][header 50token][prefix 800token][suffix 150token]
块号:      0-12 (稳定)         13-15(稳)      16-65(变)        66-74(变)

用户打 1 字符:
  块 0-15 命中 (静态部分)    → 跳过 prefill
  块 16 开始 miss (prefix 变) → 要重算

  命中率 = 16/75 = 21%
  prefill 节省 = 21%
```

vLLM 文档的关键限制：

- "We only cache full blocks" → prefix 末尾不满 16 token 的块不缓存
- 块 hash 包含父块 hash → 父块 miss 则子块必然 miss（级联失效）

可能的解法：

1. 静态部分最大化（MVP 做法）：fileContext + header + import 区 + 类/函数签名尽量放前面；tree-sitter 抽"当前函数签名"放 prompt 头部，这些跨字符稳定；实测目标：静态部分占 prompt 50%+ token
2. prefix 对齐块边界（优化项）：在 prefix 末尾补空白/注释让 token 数凑到 16 的倍数；下一次请求 prefix 多了 1 token，只要没越过块边界，整个块仍命中；代价：prompt 多一些无意义 token，但 1.5B 模型 prompt 容量充足
3. 接受 miss，靠预计算弥补：KV cache miss 不可怕，只要预计算已经把 prefill 跑完了；停顿时接管流（见 §6.5），用户不看 prefill 时间，只看 ghost text 出没出来；这条是 fallback 思路：稳定化做不好也不影响体验，只是本地 CPU 费一点

**建议**：

- MVP 只做策略 1（静态部分前置），不做到 token 级块对齐
- 命中率不作为 MVP 验收指标，作为优化期观测项
- 预计算（§6.5）是 KV cache miss 的兜底——即使 miss，预取也把成本提前了

#### 配置

```text
fim.l1.keepAlive       (默认 "30m") 模型常驻时长
fim.l1.contextStable   (默认 true)  启用前缀稳定化
fim.contextLength      (默认 100)   prefix/suffix 总行数
```

---

## 5. FeedbackEvent 简化（修订 §7.3）

### 7.3 FeedbackEvent（修订）

原设计有 accepted/rejected/cancelled/overwritten 四态，实现复杂且 VS Code API 不支持 rejected/cancelled 检测。修订为只跟踪 Tab 接受。

#### 事实依据

VS Code InlineCompletionItemProvider 没有接受/拒绝事件 API。来源：VS Code API 文档（code.visualstudio.com/api/references/vscode-api）grep `InlineCompletion` 全文。

- `InlineCompletionItemProvider` 接口只有一个方法 `provideInlineCompletionItems`
- 没有 `onDidAcceptInlineCompletion` 事件
- 唯一钩子是 `InlineCompletionItem` 的可选 `command` 属性，在用户 Tab 接受后执行
- 用户继续打字时 provider 会被重新调用，新 completion 不匹配则 ghost text 自动消失——不需要扩展手动隐藏，但无法区分"忽略"和"拒绝"

#### 简化方案

只发一种 feedback：

```typescript
interface FeedbackEvent {
  requestId: string
  event: "accepted"   // 只记录 Tab 接受
  acceptedText?: string
  timestamp: number
}

// 发送时机: InlineCompletionItem 的 command 属性绑定的回调
```

不记录的事件：

- rejected: 检测不到，不记
- cancelled: 与"继续打字"无法区分，不记
- overwritten: 接受后又改，属于编辑器正常操作，不记

#### 用途

- 统计 Acceptance Rate: accepted / 总请求数
- 门控调优反馈: 哪些触发时机接受率高（见 §6.3.1）
- 不用于模型训练，仅本地质量分析

#### 当前代码的改造

删除 `index.ts:129-145` 那段基于字符串比对的 `setAcceptedLastCompletion` 逻辑，改为在 `InlineCompletionItem` 的 command 里直接发 FeedbackEvent。

---

## 6. 服务端进程生命周期管理（补充 §10.1）

### 10.1 服务端进程生命周期管理

FIM Engine 作为独立 HTTP server 进程运行，由 VS Code 扩展在 `activate()` 时拉起，`deactivate()` 时清理。

#### 事实依据

| 来源 | 关键事实 |
| --- | --- |
| VS Code API 文档 | `vscode.d.ts` 没有 `createChildProcess`；但扩展宿主是 Node 运行时，可直接用 `child_process.spawn/fork` |
| VS Code Language Server 指南 | 官方 `vscode-languageclient` 的 `LanguageClient` 用 `TransportKind.ipc` fork Node 子进程；`deactivate()` 里 `await client.dispose()` 清理——这是官方范式 |
| VS Code Remote 文档 | "扩展宿主能用 Node API"，但远程场景下子进程跑在哪一端要注意 |

#### 启动

```text
activate() 时:
  1. 检查目标端口(默认 127.0.0.1:38888)是否已占用
     ├ 已占用且 health check 通过 → 复用现有进程
     └ 已占用但无响应 → kill stale 进程，重新拉起
  2. 用 child_process.fork() 启动 Engine server
  3. 写 PID 文件到 ~/.fim/engine.pid
  4. 等待 /health 返回 200 才继续激活扩展

fork 方式参考 vscode-languageclient 的 TransportKind.ipc 范式，
但 Engine 用 HTTP 而非 IPC，便于 Zed/curl 复用。
```

#### 崩溃恢复

```text
Engine 进程崩溃:
  - 扩展检测到子进程 exit 事件 → 自动重启(最多 3 次/分钟)
  - 重启失败 → 状态栏提示 "FIM Engine unavailable"
  - 用户手动触发时若 Engine 不可用 → 回退到当前 completion.ts
    的内进程模式(临时降级)

扩展宿主崩溃(reload window):
  - deactivate() 不一定执行
  - 下次 activate() 通过端口探测 + PID 文件清理 stale 进程
```

#### 清理

```text
deactivate() 时:
  1. 发 SIGTERM 给 Engine 进程
  2. 等 3 秒，未退出则 SIGKILL
  3. 删除 PID 文件

注册为 context.subscriptions 的 Disposable，确保正常 reload
时自动清理。
```

#### 端口冲突

- 默认 38888，可通过 `fim.enginePort` 配置
- 启动时若端口被占且非 FIM Engine → 报错提示用户改端口
- 绑定 127.0.0.1 only，不对外暴露

#### 配置

```text
fim.enginePort        (默认 38888)
fim.engineAutoStart   (默认 true)  扩展激活时自动拉起
fim.engineRestartMax  (默认 3)     每分钟最大重启次数
```

---

## 7. tree-sitter 输入传输（补充 §6.2/§6.4）

### tree-sitter 在服务端的输入传输

PD §6.2/§6.4 假设 server 端做 tree-sitter 解析，但 server 拿不到 VS Code 的 `TextDocument` 对象。`CompletionRequest` 只传了 prefix/suffix 窗口，tree-sitter 解析需要完整文件（或至少当前函数）。

#### 事实依据

| 事实 | 来源 | 对设计的影响 |
| --- | --- | --- |
| `parser.parse()` 接受任意字符串，可只传片段 | tree-sitter README | 不强制传完整文件，可只传当前函数体 |
| 支持增量解析 `parse(newCode, oldTree)` | tree-sitter README | 编辑后只重算受影响部分，无需重传+重算全文 |
| 容错解析，对不完整代码仍产出 AST | tree-sitter README | 用户写到一半的代码也能解析，适合补全场景 |
| `web-tree-sitter`（WASM）在 Node.js 明显慢于原生绑定 | tree-sitter README | Engine server 端应该用原生 `node-tree-sitter`，当前 FIM 用的 WASM 版要换 |

#### 三种传输方案对比

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A. 全文传输 | 每次请求传完整文件内容 | server 端解析最完整，AST 准确 | 大文件传输开销大；每次请求都传冗余 |
| B. 窗口传输 | 只传 prefix/suffix（当前做法） | 传输量小 | AST 不完整，只能解析窗口内结构，跨函数引用丢失 |
| C. 增量同步 | 首次传全文 + 旧 tree，后续传编辑增量 | 传输量最小，解析最快 | 需要维护文件状态，复杂度高；编辑器侧要 track 变化 |

#### 推荐方案（MVP）：A + B 混合

```text
CompletionRequest 新增字段:
  fullContent?: string      // 完整文件内容(可选)
  fileVersion?: number      // 文件版本号，用于失效缓存

Engine 侧维护文件缓存:
  Map<filePath, { content, version, tree }>

请求处理:
  1. 若 fullContent 提供且 version > 缓存 version
     → 更新缓存，用增量解析更新 tree
  2. 若 fullContent 未提供
     → 用 prefix/suffix 做降级解析(只解析窗口)
  3. 用缓存 tree 做 getNodeAtPosition 等操作

传输时机:
  - 文件首次请求: 传 fullContent
  - 文件未编辑: 不传 fullContent，复用缓存
  - 文件有编辑: 传 fullContent + 新 version

性能:
  - 增量解析只重算受影响部分(tree-sitter 核心特性)
  - 缓存 tree 避免重复解析
  - Engine 用原生 node-tree-sitter 而非 web-tree-sitter(WASM)
```

#### 为什么不用方案 C（纯增量）

- 需要编辑器侧精确 track 每次编辑的 `startIndex/oldEndIndex/newEndIndex`——VS Code 的 `onDidChangeTextDocument` 能拿到，但 Zed 的 `/v1/completions` 协议拿不到
- 跨编辑器协议不一致，方案 C 只对 VS Code 生效
- MVP 阶段复杂度太高

#### 为什么不用方案 B（纯窗口）

- 当前 FIM 就是纯窗口，AST 只能看到 prefix/suffix 范围内的结构
- 跨函数引用、import 区、类定义在窗口外，AST 看不到
- 这导致 `getIsMultilineCompletion` 和 `onData` 的结构化截断判断不准

#### 难点 5：tree-sitter 输入传输

**建议**：

- MVP 传全文 + Engine 缓存 tree + 增量解析
- Engine 必须用 `node-tree-sitter`（原生绑定），不能用 `web-tree-sitter`（WASM 太慢）
- 当前 FIM 代码用的是 `web-tree-sitter`，迁移到独立 server 时要换绑定
- Zed 走 `/v1/completions` 不传 fullContent，自动降级到窗口解析

---

## 8. Postprocessor 与补全范围控制（补充 §6.7）

### 6.7 Postprocessor（补充）

Postprocessor 负责把模型输出转换为可直接上屏的补全文本，控制补全范围在一个函数或完整块内。

#### 范围控制策略

补全范围的硬上限：

- `numPredictFim`（默认 512 tokens）输出 token 上限
- `maxLines`（默认 40 行）输出行数上限

软上限（靠截断逻辑，在 ModelClient 流式 onData 里做）：

1. stop words 命中 → 立即截断，按 FIM 模板族切换（STOP_LLAMA / STOP_QWEN 等）
2. 单行模式（`multilineCompletionsEnabled=false`）出现换行即截断
3. 函数体结束：`isInsideFunction && completion.includes("}")` 且括号平衡 → 截到最后一个 `}`
4. 结构边界：`}\s*\n\s*\S+` 匹配 + 缩进回退 → 截到 `}`
5. 语法完整 + 结束符：`hasEndPattern`（`} ) ] ;`）+ `hasCompleteSyntax` → 截断

#### Postprocessor 链（从 CompletionFormatter 迁移）

```text
 1. matchCompletionBrackets     括号不匹配则停
 2. preventQuotationCompletions 去注释 header 残留
 3. preventDuplicateLine        与后3行相似度>0.8 置空
 4. removeDuplicateQuotes       去重复引号
 5. removeUnnecessaryMiddleQuotes
 6. ignoreBlankLines
 7. removeInvalidLineBreaks
 8. removeDuplicateText         与光标后文本重叠裁掉
 9. skipMiddleOfWord
10. skipSimilarCompletions      相似度>0.6 置空
11. trimStart
```

这 11 步从当前 `CompletionFormatter` 平移，不改逻辑，只改归属（从 `completion.ts` 内嵌移到独立 Postprocessor 模块）。

#### 与 Prefetcher 的协作

流式截断（步骤 1-5）在 ModelClient onData 里做，决定何时 abort 流。最终后处理（步骤 6-11）在 Postprocessor 里做，处理已完成的补全文本。

预计算场景：流式截断照常在后台跑；停顿接管后，Postprocessor 在 ghost text 显示前跑一遍。

---

## 9. 难点汇总

| # | 难点 | MVP 是否必须解决 | 对应补充节 |
| --- | --- | --- | --- |
| 1 | 预计算请求生命周期 | ❌ Phase 2 | §6.5 |
| 2 | KV cache 命中率 | ❌ 只做静态前置 | §11.1 |
| 3 | SSE 流接管协议 | ✅ MVP 接管流 | §6.5 |
| 4 | 意图门控边界 | ✅ MVP 用 balanced | §6.3.1 |
| 5 | tree-sitter 输入传输 | ✅ 全文+缓存 | §10/§6.2 |
| 6 | 本地模型硬件门槛 | ❌ 用户自选 | §6.6 |
| 7 | 跨编辑器协议稳定性 | ❌ MVP 只 VS Code | §7.3 |

MVP 必须解决的（3 个）：流接管、意图门控 balanced 档、tree-sitter 全文+缓存

MVP 可绕过的（4 个）：预计算生命周期（先停顿触发）、KV cache 块对齐（先静态前置）、硬件门槛（用户自选模型）、跨编辑器（先 VS Code）

---

## 10. 难点 7：跨编辑器协议稳定性（补充 §7.3）

### 跨编辑器协议差异

PD §7.1 的 `CompletionRequest` 能否覆盖所有编辑器？

| 编辑器 | 接 inline completion 的方式 | 与 PD 协议的兼容性 |
| --- | --- | --- |
| VS Code | `InlineCompletionItemProvider`，扩展调引擎 | 直接适配，扩展做薄客户端 |
| Zed | 配置 `edit_predictions.provider = "open_ai_compatible_api"`，直接调 `/v1/completions`，不经扩展 | 引擎需暴露 OpenAI-compatible 端点 |
| Neovim | 没有原生 API，靠插件用 extmark 自建 | 需写 Neovim 插件（Lua），调引擎 HTTP |

来源：

- VS Code API 文档（code.visualstudio.com/api/references/vscode-api）
- Zed 文档（zed.dev/docs/ai/edit-prediction.html）
- copilot.vim 源码（github.com/github/copilot.vim）

#### 分析

1. Zed 不走 FIM 扩展，它直接发 `/v1/completions` 请求到引擎。这意味着引擎必须同时支持：
   - PD §7.1 的原生 `POST /completion`（VS Code 用）
   - OpenAI-compatible `POST /v1/completions`（Zed 用，body 是 `{model, prompt, max_tokens, temperature, stop}`）

2. 两个协议的请求体不同：
   - `/completion` 传 `prefix`/`suffix`/`languageId`/`cursor` 等结构化字段，引擎内部拼 FIM prompt
   - `/v1/completions` 传已经拼好的 `prompt` 字符串，引擎直接转发给模型
   - Zed 的 `prompt_format` 自己拼 FIM 模板 → 引擎对 Zed 来说只是透传，不做 ContextCollector/PromptBuilder 的工作

3. 这导致 ContextCollector 只对 VS Code 生效：Zed 不传 `openFiles`/`diagnostics`/`workspacePath`，引擎拿不到跨文件上下文。Zed 的补全质量会低于 VS Code。

#### 可能的解法

1. MVP 只做 VS Code（推荐）：`/v1/completions` 端点留接口但不实现 ContextCollector。Zed 能用但质量打折。
2. Zed 适配层：引擎识别 Zed 请求（User-Agent 或 prompt 格式），用 prompt 里的文件路径反查 workspace 文件做上下文增强——复杂，非 MVP。
3. Neovim 插件模仿 VS Code 客户端：Lua 插件传结构化 `CompletionRequest`，引擎走完整 ContextCollector 链路——质量好但要写插件。

**建议**：

- `/v1/completions` 是 Zed 兼容的最低成本路径，但 ContextCollector 对它失效
- MVP 阶段 Zed 通过 `/v1/completions` 能用，但只有当前文件 FIM，无跨文件上下文
- Neovim 留到 Phase 5，需要写 Lua 插件传结构化请求

---

## 11. 事实依据来源汇总

| 来源 | 用途 |
| --- | --- |
| GitHub Copilot 官方博客（github.blog/ai-and-ml/github-copilot/how-github-copilot-is-getting-better-at-understanding-your-code） | FIM +10%、neighboring tabs +5%、低阈值匹配最佳、后台运行不增加延迟 |
| vLLM Prefix Caching 设计文档（docs.vllm.ai/en/latest/design/prefix_caching.html） | 块级哈希、只缓存完整块、block size 通常 16 token、级联失效 |
| vLLM Automatic Prefix Caching 文档（docs.vllm.ai/en/latest/features/automatic_prefix_caching.html） | APC 只减 prefill 不减 decoding、前缀不匹配时无收益 |
| Ollama API 文档（github.com/ollama/ollama/blob/main/docs/api.md） | `keep_alive` 默认 5m、`suffix` 字段原生 FIM 支持、设 0 卸载模型 |
| Qwen2.5-Coder Ollama 页面（ollama.com/library/qwen2.5-coder） | 6 个尺寸 398MB-20GB、32K context、1.5B 是 base model 适合 FIM |
| VS Code API 文档（code.visualstudio.com/api/references/vscode-api） | InlineCompletionItemProvider 无接受事件、command 钩子、继续打字自动消失 |
| Zed 文档（zed.dev/docs/ai/edit-prediction.html） | edit_prediction 配置、prompt_format 枚举、OpenAI-compatible 请求体 |
| copilot.vim 源码（github.com/github/copilot.vim） | Neovim 无原生 inline completion、extmark virtual text 方案 |
| tree-sitter README（github.com/tree-sitter/tree-sitter） | 增量解析、容错解析、WASM 慢于原生绑定 |
| VS Code Language Server 指南 | LanguageClient TransportKind.ipc 范式、deactivate 清理 |
