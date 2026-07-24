# 分层日志设计（Leveled Logging）

> 当前状态：已实现，具体以代码为准。
>
> 相关背景：`npm run eval` 曾在每个 FIM 请求打印完整 body + options（含 `Authorization: Bearer <key>`），导致 eval stdout 几十 KB 噪音并泄漏 API key。根因是 [src/common/logger.ts](../../src/common/logger.ts) 没有日志等级概念，所有输出无条件打印。

## 1. 背景与问题

当前日志体系是"扁平"的：

- `Logger` 单例只有 `log` / `error` / `logError`，**没有等级过滤**，所有调用都同时写入 `console` 和 VS Code "FIM" OutputChannel。
- [src/extension/utils.ts](../../src/extension/utils.ts) 的 `logStreamOptions` 在每个 FIM 请求被调用一次（[src/extension/llm.ts:13](../../src/extension/llm.ts#L13)），全量 dump request body（FIM prompt）+ options（含 `Authorization` 头）。
- [src/extension/completion-formatter.ts](../../src/extension/completion-formatter.ts) 有约 16 处裸 `console.log("After <step>: ...")` 及一个补全全量 dump 块（389-395 行），均被 `this.isDebugEnabled` 守卫；但 `setDebug()` 在全仓从未被调用，该 flag 恒为 false —— 实为死代码。
- eval 框架 stub 了 vscode（[eval/stub/vscode.ts:113](../../eval/stub/vscode.ts#L113)），OutputChannel 为空实现，`logger.log` 落到 `console.log` → stdout，于是 eval stdout 被 `[fim] ***Fim Stream Debug***` 淹没。

## 2. 目标与非目标

**目标**

- 引入多层日志等级，默认静音调试噪音（请求 dump、formatter 跟踪）。
- 双重控制：`FIM_LOG_LEVEL` 环境变量（eval + 扩展通用）+ `fim.logLevel` VS Code 设置（扩展内覆盖）。
- 无条件脱敏 `Authorization` 头，杜绝任何等级下泄漏 API key。
- 把 completion-formatter 跟踪与散落的 `console.*` 收纳进分级 logger。

**非目标**

- 不引入 pino/winston 等外部日志框架（保持依赖精简）。
- 不改用 VS Code 原生 `LogOutputChannel`（路线 B，本次不取）。
- 不动 eval 自己面向用户的进度输出（runner.ts 的 `console.log`）。

## 3. 等级体系

```
ERROR=0  WARN=1  INFO=2(默认)  DEBUG=3  TRACE=4
```

- 输出规则：`方法等级 <= 当前阈值` 时输出。
- 默认阈值 `INFO`：error / warn / info 输出，debug / trace 抑制。
- `ERROR` 等级为 0，永远满足条件 → 错误始终输出。

### 各等级承载内容

| 等级 | 内容 |
|------|------|
| ERROR | `logger.error` / `logError`（FetchError、Abort、Timeout 等） |
| WARN | 可恢复异常（如 parser 取解析器失败、gitignore 解析错误） |
| INFO | 生命周期与运营信息（扩展启动、加载样本数等）——现有 `logger.log` 全部归此 |
| DEBUG | completion-formatter 各步骤跟踪（`After <step>: ...`）、gitignore 文件查找过程 |
| TRACE | FIM 请求全量 dump（`logStreamOptions`）、补全最终全量 dump（formatter 389-395） |

## 4. Logger API（[src/common/logger.ts](../../src/common/logger.ts)）

```ts
export enum LogLevel { Error = 0, Warn = 1, Info = 2, Debug = 3, Trace = 4 }

export function parseLogLevel(name?: string): LogLevel
// 大小写不敏感映射 "error"|"warn"|"info"|"debug"|"trace"；非法或缺省 → Info
```

- 新增 `private level: LogLevel`，构造时 `this.level = parseLogLevel(process.env.FIM_LOG_LEVEL)`。
- 新增 `setLevel(level: LogLevel): void`。
- 新增 `private shouldEmit(method: LogLevel): boolean` → `method <= this.level`。
- 方法：`error` / `warn` / `info` / `debug` / `trace`，每个先 `shouldEmit` 判断，再写 console + OutputChannel。
  - console 前缀：`[fim]` (info) / `[fim:WARN]` / `[fim:DEBUG]` / `[fim:TRACE]` / `[fim:ERROR]`（保持现有 error 前缀）。
  - OutputChannel 行标签：`[ERROR]` / `[WARN]` / `[INFO]` / `[DEBUG]` / `[TRACE]`（替代当前写死的 `[INFO]` / `[ERROR_*]`）。
- **`log` 改为 `info` 的别名**：`public log = (message: string) => this.info(message)`。现有约 20 处 `logger.log(...)` 调用零改动。
- `logError` 保留原样（ERROR 级 + FetchError/Abort/Timeout 彩色格式），其输出经 `shouldEmit(Error)` 判断（恒真，行为不变）。

## 5. level 解析与优先级

**优先级：`fim.logLevel` 设置（用户显式设置时） > `FIM_LOG_LEVEL` 环境变量 > 默认 INFO**

实现要点：

- 构造时先吃 env（`parseLogLevel(process.env.FIM_LOG_LEVEL)`）。
- [src/index.ts](../../src/index.ts) `activate()` 中读 `fim.logLevel`：**仅当用户显式设置**时调用 `logger.setLevel(...)` 覆盖；注册 `workspace.onDidChangeConfiguration` 监听该 key，变更时重新解析。
- 为了让"设置未设 → env 生效"成立，**`fim.logLevel` 在 schema 中不设默认值**（默认 `undefined`）。`config.get<string>("logLevel")` 在用户未设置时返回 `undefined`，此时回退到 env。文档里把"默认 INFO"写在 description 中，由 logger 自身的 env 缺省回退实现。
- 解析函数统一封装：`resolveLevel(settingValue, envValue) => settingValue ? parseLogLevel(settingValue) : parseLogLevel(envValue)`。activate 与配置变更监听器都调用它。

eval 行为：vscode 被 stub、无设置入口 → 构造时读 env 即最终值，天然满足优先级。

## 6. 设置项

- [src/common/settings-schema.ts](../../src/common/settings-schema.ts)：新增 `fim.logLevel`，枚举 `error | warn | info | debug | trace`，**无默认值**（默认行为 = INFO，见 §5），description 说明优先级与 `FIM_LOG_LEVEL` 的关系。
- `package.json` `contributes.configuration` 同步加入该项。

## 7. API key 脱敏（无条件）

在 `logStreamOptions` 序列化 `options` 前，深 clone 一份并替换敏感字段：

- `options.headers.Authorization` → `Bearer <redacted>`
- `body.apiKey`（若存在）→ `<redacted>`

**所有等级都脱敏**——脱敏独立于等级门控；只有 dump 行为本身受 TRACE 门控。这样即便用户开 TRACE 调试 FIM prompt，也不会把 key 写进 stdout/日志。

## 8. 调用点迁移

| 位置 | 现状 | 改为 |
|------|------|------|
| [src/extension/utils.ts](../../src/extension/utils.ts) `logStreamOptions` | 每请求无条件全量 dump | `logger.trace(...)` + 脱敏；llm.ts 调用点不变 |
| [src/extension/completion-formatter.ts](../../src/extension/completion-formatter.ts) ~16 处 `console.log("After <step>")` | 死代码（`isDebugEnabled` 恒 false） | `logger.debug(...)`（需 import logger） |
| 同文件 388-396 `debug()` dump 块 | 仅在 `debug()` 被调用时输出（全仓无调用方） | `logger.trace(...)` |
| [src/extension/utils.ts](../../src/extension/utils.ts) gitignore 解析 `console.log`（748/754/760） | 常开 | `logger.debug(...)` |
| [src/extension/utils.ts](../../src/extension/utils.ts) `console.error`（495/581/776） | 常开 | `logger.warn(...)` 或 `logger.error(...)`（按严重度） |
| [src/extension/parser.ts:41](../../src/extension/parser.ts#L41) `console.error("Error in getParser")` | 常开 | `logger.warn(...)` |
| [src/extension/engine-adapter.ts:110](../../src/extension/engine-adapter.ts#L110) | 已用 `logger.error` | 不动 |
| [eval/runner.ts](../../eval/runner.ts) 各 `console.log`/`console.error`（"loaded N samples"、"L1=.. L2=.."、"report:"、FAIL） | — | **不动**——eval 自己的进度输出，非 FIM 调试噪音 |

## 9. eval 行为与验收标准

默认（INFO）下，`npm run eval` 的 stdout 只包含：

- eval 自身进度行（`loaded N samples, M matrices`、`<sample> [matrix] run ...`、`L1=.. L2=.. L3=..`、`report: ...`）；
- `[fim]` 生命周期 INFO（如有）；
- 错误（`[fim:ERROR]` / `logError`）。

**不包含**：请求 dump、formatter 跟踪、API key。

调试 FIM prompt 时：`FIM_LOG_LEVEL=trace npm run eval`（恢复 dump，但 key 仍脱敏）。

## 10. 测试

用项目现有测试设置（根 `package.json` 的 `test` = `vitest run`；CLAUDE.md 写的 mocha 已过时，实现阶段先确认框架与位置）。

用例：

1. **阈值**：`setLevel(Error)` 下只 `error` 写出，`info/debug/trace` 抑制；`setLevel(Info)` 下 `debug/trace` 抑制；`setLevel(Trace)` 下全部写出。
2. **解析**：`parseLogLevel("DEBUG")` / `"debug"` → `Debug`；非法值 / `undefined` → `Info`。
3. **优先级**：`resolveLevel("debug", "trace")` → `Debug`（设置胜）；`resolveLevel(undefined, "debug")` → `Debug`（env 胜）；`resolveLevel(undefined, undefined)` → `Info`。
4. **脱敏**：含 `Authorization: Bearer sk-xxx` 的 options 经脱敏后序列化结果含 `Bearer <redacted>`、不含原 key。

Logger 依赖 vscode OutputChannel，测试用 spy/mock 替换 OutputChannel（或复用 eval stub 的形态）。

## 11. 影响面与风险

- **行为兼容**：现有 `logger.log/error/logError` 调用语义不变（log→info 别名，error/logError 恒输出）。默认 INFO 下扩展用户看到的日志与现状基本一致（少了 formatter 的裸 console.log，这本就不该对用户可见）。
- **eval 体验**：stdout 从几十 KB 降到几行，且不再泄漏 key。
- **风险点**：`fim.logLevel` 若误设 schema 默认值会破坏"env 在扩展内仍生效"的优先级——故刻意不设默认值（§5、§6 已约束）。
- **范围克制**：不重构 Logger 为多实例、不换 OutputChannel 类型、不引外部依赖。
