# Provider 配置

> **当前 MVP 阶段仅支持 DeepSeek。** 未来多 provider 扩展通过统一的 gateway 抽象层接入，不碎片化管理。

## DeepSeek（默认 Provider）

FIM 默认使用 DeepSeek API 提供 FIM（Fill-in-the-Middle）代码补全。DeepSeek 原生支持 FIM 格式（`<｜f#fim▁begin｜>` / `<｜#fim▁hole｜>` / `<｜#fim▁end｜>`），无需额外模板适配。

### 配置项

| 字段 | 说明 | 默认值 |
|------|------|--------|
| **API Hostname** | API 域名 | `api.deepseek.com` |
| **API Path** | FIM 补全端点 | `/beta/completions` |
| **API Protocol** | 协议 | `https` |
| **API Key** | DeepSeek API Key | （需自行填写） |
| **Model Name** | 模型名称 | `deepseek-v4-flash` |

### 获取 API Key

1. 注册 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 在 API Keys 页面创建新 key
3. 复制 key 填入 FIM 的 Provider 配置

### FIM 模板

DeepSeek FIM 模板格式：

```text
<｜f#fim▁begin｜>{fileContext}
{header}{prefix}<｜#fim▁hole｜>{suffix}<｜#fim▁end｜>
```

Stop words: `"<｜#fim▁begin｜>"`, `"<｜#fim▁hole｜>"`, `"<｜#fim▁end｜>"`, `"<|endoftext|>"`, `"<|fim_prefix|>"`, `"<|fim_suffix|>"`, `"<|fim_middle|>"`, `"<|end▁of▁sentence|>"`, `"<|User|>"`, `"<|Assistant|>"`

---

## 未来扩展框架（Gateway 占位，当前不实现）

以下仅为架构预留记录，说明多 provider 未来如何经统一 gateway 接入而不碎片化。表中除 DeepSeek 外的端点当前均未实现，仅作扩展示例。

### 设计原则

- 单一 model profile（不是多个独立 provider 槽位）
- 一个 profile 可配置多个角色：completion / chat（教师面板）/ embedding / rerank
- 用户配置一个 base URL + API key，FIM 自动发现可用模型
- 高级设置允许按角色覆盖 path

### 未来可经 gateway 接入的端点（当前仅 DeepSeek 实现）

| Provider | 补全端点 | 备注 |
|----------|---------|------|
| OpenAI-compatible | `/v1/completions` | 需适配 FIM → chat completions 转换 |
| Ollama | `/api/generate` | 本地模型，原生 FIM suffix 支持 |
| vLLM | `/v1/completions` | 高性能推理引擎 |
| DeepSeek（当前唯一已实现） | `/beta/completions` | 原生 FIM 支持 |

### 不采用多 Provider 槽位的原因

fim-overall-design.md §5 明确：不回到碎片化的多 provider 管理。用户只需要一个 model profile，FIM 内部按角色路由。
