# 修改 DeepSeek 默认模型名: `deepseek-chat` → `deepseek-v4-flash`

**日期**: 2026-07-24
**原因**: deepseek-chat 将于 2026/07/24 弃用，需替换默认值为当前可用模型。

## 变更清单

### 常量定义

| 文件 | 变更 |
|------|------|
| `src/common/deepseek.ts:4` | `DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash"` |

### 扩展代码

| 文件 | 行号 | 变更 |
|------|------|------|
| `src/extension/engine-adapter.ts` | 169 | `?? "deepseek-chat"` → `?? "deepseek-v4-flash"` |
| `src/webview/providers.tsx` | 161 | `placeholder="deepseek-chat"` → `placeholder="deepseek-v4-flash"` |

### 测试

| 文件 | 行号 | 变更 |
|------|------|------|
| `src/test/deepseek.test.ts` | 28-29 | 测试描述及断言期望值更新 |
| `src/test/engine-cancellation.test.ts` | 13 | 测试数据更新 |
| `src/test/postprocessor.test.ts` | 16 | 测试数据更新 |

### Eval 脚本

| 文件 | 行号 | 变更 |
|------|------|------|
| `eval/config.ts` | 34 | 环境变量 fallback 默认值 |
| `eval/.env.example` | 7, 8, 38 | 注释和示例值 |
| `eval/README.md` | 12 | 文档说明 |

### 参考文档

| 文件 | 行号 | 变更 |
|------|------|------|
| `docs/reference/development.md` | 282 | 环境变量表格 |
| `docs/reference/providers.md` | 17 | Provider 配置表格 |

### 注释

| 文件 | 行号 | 变更 |
|------|------|------|
| `services/engine-ts/src/utils.ts` | 43 | JSDoc 示例字符串 |

### 不修改

- `docs/archive/*.md` — 历史档案，保留原样

## 验证

- `npm test` — 全部测试通过
- `npm run lint` — 无 lint 错误

## 风险

老用户 globalState 中已存储的 provider 配置可能保留旧模型名 `"deepseek-chat"`。
弃用后 DeepSeek API 将返回错误，用户可通过 Provider 设置界面手动更新模型名。
无需自动迁移逻辑。
