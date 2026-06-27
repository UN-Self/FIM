# FIM: Fill-in-the-Middle 代码补全系统产品与技术设计文档

## 1. 产品定位

FIM 是一个面向开发者的跨编辑器代码补全系统，核心目标是提供低延迟、低打扰、可控、可本地化的 AI 行内补全能力。

它不是聊天工具，也不是 Agent IDE。它的第一职责是：在开发者停顿的一瞬间，根据光标前后的代码、当前文件、项目上下文和模型能力，生成一段可以直接上屏的补全内容。

核心原则：

- 低打扰：优先使用编辑器原生 ghost text，不弹窗，不打断输入。
- 低延迟：补全链路必须围绕响应速度设计，而不是围绕模型能力堆功能。
- 可控：prompt、上下文、模型、截断规则、缓存策略都应该可配置、可观测。
- 跨平台：VS Code、Zed、Neovim、JetBrains 等编辑器只做薄适配，核心逻辑下沉到服务端。
- 本地优先：优先支持 Ollama、llama.cpp、vLLM、OpenAI-compatible API，也允许接入云端模型。

## 2. 目标用户

### 2.1 主要用户

- 熟悉编辑器和本地开发环境的工程师。
- 希望使用 AI 补全，但不希望 IDE 被聊天框、侧边栏、复杂 UI 占据的开发者。
- 关注隐私、延迟、模型可替换性和上下文可控性的用户。

### 2.2 非目标用户

- 主要依赖自然语言聊天生成完整项目的用户。
- 需要完整 Agent 自动修改、多文件规划、自动执行命令的用户。
- 期望零配置、纯 SaaS、强商业化 onboarding 的用户。

## 3. 核心使用流程

典型补全流程如下：

```text
用户输入代码
  -> 编辑器检测到停顿或显式触发
  -> 扩展收集当前编辑器状态
  -> 扩展向本地服务端发送 CompletionRequest
  -> 服务端判断是否应该补全
  -> 服务端收集/检索项目上下文
  -> 服务端识别补全意图
  -> 服务端构建 FIM prompt
  -> 服务端请求模型
  -> 服务端后处理模型输出
  -> 扩展显示 ghost text
  -> 用户接受、继续输入或忽略
  -> 扩展回传接受/拒绝事件
```

## 4. 总体架构

FIM 采用 Client-Server 架构：

```text
VS Code Extension     Zed Config/Extension     Neovim Client
        |                    |                       |
        | CompletionRequest  | CompletionRequest     |
        v                    v                       v
                  Local FIM Engine Server
                            |
        +-------------------+-------------------+
        |                   |                   |
 Context Pipeline     Prompt Pipeline      Model Pipeline
        |                   |                   |
   RAG / Index       FIM Templates       Ollama / vLLM /
   Tree-sitter       Token Budget        OpenAI-compatible
   BM25 / Vector     Stop Words          Cloud APIs
```

### 4.1 编辑器扩展端

扩展端只负责贴近编辑器的事情：

- 注册行内补全 provider。
- 监听用户输入、停顿、显式触发。
- 实现 debounce 和请求取消。
- 获取当前光标、当前文件、未保存 buffer、选区、diagnostics。
- 把编辑器状态转换为通用 `CompletionRequest`。
- 调用本地 FIM Engine。
- 把返回结果转换为编辑器原生 ghost text。
- 在用户接受/拒绝补全后回传事件。
- 提供最小设置入口，例如服务端地址、模型配置、启用/禁用。

扩展端不应该承担：

- RAG 索引。
- 大规模文件扫描。
- 模型请求细节。
- 多模型 prompt 模板。
- 复杂上下文压缩。
- 向量数据库或 embedding 管理。
- 大量业务逻辑和质量策略。

### 4.2 服务端

服务端负责所有可跨编辑器复用、计算较重、变化较快的逻辑：

- 接收补全请求。
- 做请求去重、取消、缓存和并发控制。
- 维护 workspace 文件索引。
- 执行 RAG 检索和上下文排序。
- 使用 tree-sitter 做局部语法分析。
- 判断补全意图。
- 根据模型类型构建 FIM prompt。
- 控制 token budget。
- 请求模型。
- 处理流式响应。
- 做补全文本后处理。
- 记录性能日志和质量数据。

### 4.3 模型层

模型层以 OpenAI-compatible API 作为基础抽象，同时支持特定 provider 的差异化适配。

第一阶段支持：

- Ollama
- OpenAI-compatible `/v1/completions`
- OpenAI-compatible `/v1/chat/completions`
- vLLM
- llama.cpp server

后续支持：

- DeepSeek FIM endpoint
- Codestral FIM
- Qwen Coder FIM
- 自定义 HTTP provider

## 5. 扩展端与服务端职责边界

| 能力 | 扩展端 | 服务端 | 说明 |
| --- | --- | --- | --- |
| 用户停顿检测 | 是 | 否 | 编辑器最清楚输入节奏 |
| 行内补全注册 | 是 | 否 | 使用编辑器原生 API |
| prefix/suffix 获取 | 是 | 可选 | 未保存内容只有编辑器知道 |
| 当前光标/选区 | 是 | 否 | 编辑器实时状态 |
| diagnostics/LSP 报错 | 是 | 可选 | 扩展可以直接拿当前诊断 |
| 打开文件内容 | 是 | 可选 | 打开的未保存文件只能扩展拿 |
| workspace 文件扫描 | 可选 | 是 | 大项目扫描适合服务端 |
| tree-sitter 解析 | 可选 | 是 | 局部可在扩展，大规模放服务端 |
| RAG/索引/向量库 | 否 | 是 | 跨编辑器复用，避免扩展臃肿 |
| 意图识别 | 轻量规则 | 复杂规则 | 扩展只做快速 skip |
| prompt 构建 | 可选 | 推荐 | 模型模板统一维护 |
| 请求模型 | 可选 | 推荐 | 便于统一认证、缓存、限流 |
| 后处理 | 基础保护 | 推荐 | 质量策略应该统一 |
| ghost text 渲染 | 是 | 否 | 只能由编辑器完成 |
| 接受/拒绝事件 | 是 | 记录 | 编辑器知道用户行为 |
| 设置 UI | 是 | 否 | 贴近编辑器 |
| 性能日志 | 是 | 是 | 两边都需要 |

判断边界的规则：

```text
是否依赖编辑器实时状态？
  是 -> 放扩展端

是否重、慢、跨平台复用、依赖模型或索引？
  是 -> 放服务端
```

## 6. 核心模块设计

### 6.1 Completion Orchestrator

补全编排器负责一次补全请求的完整生命周期。

职责：

- 接收 `CompletionRequest`。
- 判断请求是否有效。
- 调用上下文收集器。
- 调用意图识别器。
- 调用检索层。
- 调用 prompt builder。
- 调用 model client。
- 调用 postprocessor。
- 返回 `CompletionResponse`。

伪代码：

```ts
class CompletionOrchestrator {
  async complete(request: CompletionRequest): Promise<CompletionResponse | null> {
    if (!this.shouldTrigger(request)) return null

    const context = await this.contextCollector.collect(request)
    const intent = this.intentDetector.detect(context)
    const retrieved = await this.retriever.retrieve(context, intent)
    const prompt = this.promptBuilder.build(context, intent, retrieved)
    const raw = await this.modelClient.complete(prompt, request.abortSignal)
    const result = this.postprocessor.process(raw, context)

    return result
  }
}
```

### 6.2 Context Collector

上下文收集器负责把原始请求转换为模型可用的补全上下文。

第一阶段只做：

- 当前文件 prefix。
- 当前文件 suffix。
- 当前行。
- 当前语言。
- 当前文件路径。
- 光标位置。

第二阶段加入：

- 当前函数/类。
- import 区域。
- 相关打开文件。
- diagnostics。
- git diff。
- 最近编辑片段。

第三阶段加入：

- repo symbols。
- BM25 相关片段。
- embedding 相似片段。
- 项目规则文件，例如 `README.md`、`CONTRIBUTING.md`、`.cursorrules`、`AGENTS.md`。

### 6.3 Intent Detector

意图识别器判断这次补全大致属于哪类任务。

初期使用规则，不使用 LLM：

- `line_continuation`：普通单行续写。
- `block_completion`：函数体、if、for、try 等块级续写。
- `import_completion`：补 import 或依赖引用。
- `argument_completion`：补函数参数。
- `comment_to_code`：根据注释补代码。
- `test_completion`：补测试断言、测试 case。

示例规则：

```text
当前行以 import/from/use/include 开头
  -> import_completion

光标前最近 token 是 {、:、=>、do
  -> block_completion

当前行或上一行是注释
  -> comment_to_code

否则
  -> line_continuation
```

### 6.4 Retrieval Layer

检索层负责从项目中找对当前补全有帮助的上下文。

实现阶段：

1. `NoopRetriever`
   - 不检索，便于 MVP。

2. `RecentFilesRetriever`
   - 使用最近打开文件和最近编辑文件。

3. `BM25Retriever`
   - 对文件片段做关键词检索。
   - 适合函数名、变量名、import、类型名。

4. `TreeSitterRetriever`
   - 提取当前文件的函数、类、import、调用关系。
   - 找到当前光标所在函数。

5. `VectorRetriever`
   - 使用 embedding 召回语义相似片段。
   - 作为可选增强，不作为 MVP 必需项。

### 6.5 Prompt Builder

Prompt Builder 负责把上下文转换为特定模型可理解的 FIM prompt。

它应该支持多种模板：

```text
DeepSeek FIM
Qwen Coder FIM
CodeLlama FIM
StarCoder FIM
OpenAI-compatible generic
```

通用结构：

```text
{system_or_context}
{fim_prefix_token}
{prefix}
{fim_suffix_token}
{suffix}
{fim_middle_token}
```

Prompt Builder 必须处理：

- token budget。
- prefix/suffix 长度比例。
- RAG 片段数量。
- 当前文件优先级。
- stop words。
- 模型特定控制符。

### 6.6 Model Client

Model Client 只负责请求模型，不关心编辑器，不关心补全策略。

接口示例：

```ts
interface ModelClient {
  complete(request: ModelCompletionRequest): Promise<ModelCompletionResponse>
}
```

必须支持：

- timeout。
- abort。
- stream。
- retry。
- provider-specific headers。
- API key 管理。
- 错误归一化。

### 6.7 Postprocessor

后处理器负责把模型输出转换为可直接上屏的补全文本。

规则：

- 去除 markdown 代码块。
- 去除模型解释文字。
- 去除重复 prefix。
- 与 suffix 比较，裁剪重复括号、分号、闭合标签。
- 限制最大行数。
- 限制最大字符数。
- 保留合理缩进。
- 遇到明显越界内容时截断。
- 空结果或低质量结果返回 null。

## 7. 通信协议

### 7.1 CompletionRequest

扩展端发送给服务端：

```ts
interface CompletionRequest {
  requestId: string
  editor: "vscode" | "zed" | "neovim" | "jetbrains"
  workspacePath: string
  filePath: string
  languageId: string
  cursor: {
    line: number
    character: number
  }
  prefix: string
  suffix: string
  currentLine: string
  selectedText?: string
  triggerKind: "automatic" | "manual"
  openFiles?: Array<{
    filePath: string
    languageId: string
    content: string
    isDirty: boolean
  }>
  diagnostics?: Array<{
    message: string
    severity: "error" | "warning" | "info"
    startLine: number
    startCharacter: number
    endLine: number
    endCharacter: number
  }>
}
```

### 7.2 CompletionResponse

服务端返回给扩展端：

```ts
interface CompletionResponse {
  requestId: string
  text: string
  replaceRange?: {
    startLine: number
    startCharacter: number
    endLine: number
    endCharacter: number
  }
  metadata: {
    model: string
    provider: string
    latencyMs: number
    intent: string
    cached: boolean
    retrievedChunks: number
  }
}
```

### 7.3 FeedbackEvent

扩展端在用户接受、拒绝或取消补全时回传：

```ts
interface FeedbackEvent {
  requestId: string
  event: "accepted" | "rejected" | "cancelled" | "overwritten"
  acceptedText?: string
  timestamp: number
}
```

这些反馈不一定用于训练模型，但可以用于本地质量分析：

- 哪些 prompt 模板接受率高。
- 哪些语言延迟高。
- 哪些文件类型应该禁用。
- RAG 是否提升接受率。

## 8. VS Code 适配方案

VS Code 扩展第一阶段使用 TypeScript 实现。

关键 API：

- `languages.registerInlineCompletionItemProvider`
- `InlineCompletionItemProvider`
- `InlineCompletionItem`
- `CancellationToken`
- `workspace.getConfiguration`
- `window.activeTextEditor`
- `languages.getDiagnostics`

VS Code 扩展职责：

```text
provideInlineCompletionItems
  -> 检查是否启用
  -> 检查语言是否启用
  -> debounce
  -> 生成 requestId
  -> 获取 prefix/suffix
  -> 调用 FIM Engine
  -> 返回 InlineCompletionItem
```

## 9. Zed 适配方案

Zed 不应以“移植 VS Code 插件”的方式作为第一目标。

第一阶段推荐：

- FIM Engine 暴露 OpenAI-compatible `/v1/completions` 接口。
- 用户在 Zed 中配置 `edit_predictions.open_ai_compatible_api` 指向本地服务。
- 服务端负责把 Zed 请求转换为内部 FIM 请求。

优点：

- 不需要一开始写完整 Zed 扩展。
- 可以快速验证 Zed 补全体验。
- 核心服务端可以复用。

后续再考虑：

- Zed extension。
- 更深的 workspace 集成。
- 自定义配置 UI。
- 更丰富的上下文传递。

## 10. 服务端接口形态

第一阶段建议使用 HTTP server，而不是直接上 LSP。

原因：

- 易调试。
- 易被 VS Code、Zed、Neovim 同时调用。
- 易兼容 OpenAI-compatible API。
- 可用 curl/Postman/日志直接验证。

推荐接口：

```text
POST /completion
POST /feedback
GET  /health
GET  /models
POST /workspace/index
POST /v1/completions
```

其中：

- `/completion` 是内部原生协议。
- `/v1/completions` 是兼容 Zed 和其他 OpenAI-compatible 客户端的协议。

LSP 可以作为第二阶段目标。原因是编辑器对 inline completion 的 LSP 支持并不完全一致，直接依赖 LSP 可能比 HTTP 适配更早遇到兼容性问题。

## 11. 性能目标

补全系统的体验由端到端延迟决定。

| 指标 | MVP 目标 | 理想目标 |
| --- | --- | --- |
| 扩展端上下文收集 | < 10ms | < 5ms |
| 服务端上下文处理 | < 20ms | < 10ms |
| 本地 RAG 检索 | < 50ms | < 15ms |
| 模型 TTFT | < 800ms | < 250ms |
| 端到端首字显示 | < 1000ms | < 350ms |
| 服务端常驻内存 | < 150MB | < 80MB |
| 单次补全最大输出 | 256 tokens | 128 tokens |

注意：如果使用远程大模型，150ms 级别的端到端响应通常不现实。产品应该明确区分：

- 本地小模型极速补全。
- 云端模型高质量补全。
- 手动触发补全。

## 12. 质量指标

除了延迟，还要关注补全是否真的有用。

核心指标：

- Acceptance Rate：用户接受补全的比例。
- Edit After Accept：接受后是否立刻大幅修改。
- Cancellation Rate：请求被取消比例。
- Empty Result Rate：空补全比例。
- Duplicate Rate：与已有代码重复比例。
- Overrun Rate：补全越界比例，例如补出整个函数外的内容。
- P95 Latency：95 分位延迟。

## 13. 安全与隐私

FIM 默认应遵循本地优先原则。

必须明确：

- 是否向远程模型发送代码。
- 发送哪些文件内容。
- 是否发送 diagnostics。
- 是否发送 git diff。
- 是否记录补全内容。
- API key 如何存储。
- 日志是否包含源码。

默认策略：

- 不上传任何内容，除非用户配置远程 provider。
- 日志默认不记录完整源码。
- 远程请求前可以提供 workspace allowlist。
- 支持 `.fimignore` 排除敏感文件。
- 默认排除 `.env`、密钥、证书、构建产物、依赖目录。

## 14. 配置设计

示例配置：

```json
{
  "fim.enabled": true,
  "fim.serverUrl": "http://127.0.0.1:38888",
  "fim.autoStartServer": true,
  "fim.languages": {
    "*": true,
    "markdown": false
  },
  "fim.completion": {
    "debounceMs": 180,
    "maxPrefixChars": 12000,
    "maxSuffixChars": 6000,
    "maxOutputTokens": 128,
    "enableCache": true
  },
  "fim.model": {
    "provider": "ollama",
    "model": "qwen2.5-coder:7b",
    "baseUrl": "http://127.0.0.1:11434"
  },
  "fim.rag": {
    "enabled": false,
    "bm25": true,
    "vector": false,
    "maxChunks": 6
  }
}
```

## 15. 开发路线图

### Phase 1: VS Code 单点验证

目标：证明基本补全手感。

范围：

- VS Code inline completion。
- 当前文件 prefix/suffix。
- HTTP 调用本地服务。
- 服务端构建 FIM prompt。
- 调用 Ollama 或 OpenAI-compatible provider。
- 返回 ghost text。
- 基础后处理。

不做：

- RAG。
- 全项目索引。
- 复杂 UI。
- 多编辑器。
- 复杂意图识别。

### Phase 2: 核心服务端抽象

目标：把补全逻辑从 VS Code 插件中抽出来。

范围：

- `CompletionRequest` / `CompletionResponse` 协议稳定。
- Completion Orchestrator。
- Prompt Builder。
- Model Client。
- Postprocessor。
- 本地 server 生命周期管理。
- 日志和性能指标。

### Phase 3: Zed 兼容

目标：让 Zed 可以使用同一个 FIM Engine。

范围：

- 实现 `/v1/completions`。
- 兼容 Zed edit prediction 配置。
- 验证 Zed ghost text 体验。
- 必要时增加 Zed 请求适配层。

### Phase 4: 轻量 RAG

目标：提升跨文件补全准确率。

范围：

- workspace 文件扫描。
- `.fimignore`。
- tree-sitter 解析。
- BM25 检索。
- 最近编辑文件召回。
- token budget 排序。

### Phase 5: 多编辑器适配

目标：验证架构是否真正跨平台。

候选：

- Neovim Lua client。
- JetBrains plugin。
- Zed extension。

## 16. 推荐目录结构

```text
fim/
  apps/
    vscode-extension/
      src/
        extension.ts
        inline-completion-provider.ts
        request-mapper.ts
        server-manager.ts

    zed-compat/
      README.md

  crates-or-packages/
    engine/
      src/
        main.*
        server.*
        completion/
          orchestrator.*
          types.*
        context/
          collector.*
          prefix_suffix.*
        intent/
          detector.*
        retrieval/
          retriever.*
          bm25.*
          tree_sitter.*
        prompt/
          builder.*
          templates.*
        model/
          client.*
          ollama.*
          openai_compatible.*
        postprocess/
          processor.*

  docs/
    protocol.md
    architecture.md
    providers.md
```

如果继续基于现有 `twinny/` 实验，可以先不调整到 monorepo，而是在 `twinny/src/core/` 中抽核心逻辑。

## 17. 技术选型建议

### 17.1 MVP

推荐：

- VS Code 扩展：TypeScript。
- 服务端：Node.js/TypeScript 或 Go。
- 模型：Ollama + Qwen Coder / DeepSeek Coder。
- 通信：HTTP JSON。

理由：

- 开发速度快。
- 调试成本低。
- 与现有 Twinny 代码更接近。

### 17.2 稳定版

推荐：

- 服务端：Rust 或 Go。
- 通信：HTTP + 可选 stdio。
- 索引：内存索引 + 本地持久化缓存。
- 解析：tree-sitter。
- 检索：BM25 优先，向量检索可选。

理由：

- 更适合发布单文件二进制。
- 性能和内存更可控。
- 更容易做跨平台分发。

## 18. 主要风险

### 18.1 延迟风险

远程模型网络延迟不可控。必须支持本地模型和严格 timeout。

### 18.2 补全质量风险

FIM 模板、上下文长度、后处理都会影响质量。必须让这些策略可配置、可观测。

### 18.3 编辑器 API 差异

VS Code、Zed、Neovim 对 inline completion 的支持方式不同。核心服务端不能依赖任何单一编辑器 API。

### 18.4 RAG 过早复杂化

RAG 很容易拖慢 MVP。必须先做好当前文件 FIM，再逐步加检索。

### 18.5 隐私风险

代码补全天然涉及源码上传。必须默认本地优先，并明确远程 provider 的数据边界。

## 19. MVP 验收标准

MVP 完成的标准：

- VS Code 中输入代码停顿后可以出现 ghost text。
- 服务端可独立启动，`GET /health` 返回正常。
- 扩展端通过 `/completion` 调用服务端。
- 支持至少一个本地模型 provider。
- 支持至少一个 OpenAI-compatible provider。
- 补全请求可以被取消。
- 补全结果不会包含 markdown 代码块或解释文字。
- 用户接受补全后扩展可以发送 feedback。
- 端到端日志能看到 requestId、latency、model、是否缓存。

MVP 不要求：

- Zed 插件。
- RAG。
- 复杂设置 UI。
- 多模型自动路由。
- Agent 能力。

## 20. 一句话总结

FIM 的正确实现路径不是“做一个更大的编辑器插件”，而是“做一个跨编辑器复用的补全引擎，再用极薄的编辑器适配层把它接入 ghost text”。

第一版只要把当前文件 FIM 补全做快、做稳、做可控，就已经打下了后续支持 Zed、RAG、多模型和多编辑器的基础。
