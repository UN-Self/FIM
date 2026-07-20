# FIM 评测框架（eval）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建独立 TS 评测子项目 `eval/`，直接 import FIM 源码 + vscode stub，跑通补全全链路 A→G，三层 metrics + 逐环 probe，支持可换 adapter 横向对比，第一版用 Noop 占位基线。

**Architecture:** `chain.ts` 集中编排 A→G 全链路（prefix/suffix → 上下文 → 意图 → prompt → DeepSeek → 截断+格式化 → 补全），每环产物喂给对应 probe；`runner.ts` 遍历样本 × 对比矩阵聚合报告。eval 不实例化 `CompletionProvider`，只调 FIM 的纯函数；vscode 依赖用 stub 喂。截断逻辑从 completion.ts 抽取到 `src/extension/postprocessor.ts`（FIM 和 eval 共用，单一真相源）。

**Tech Stack:** TypeScript 4.7 / commonjs / Node 16 / web-tree-sitter（WASM）/ fastest-levenshtein / DeepSeek API（被测）/ OpenAI-compatible API（Layer3 裁判）。

## Global Constraints

- **eval 是独立子项目**：自己的 `eval/package.json` + `eval/tsconfig.json`，共享 FIM 根 `node_modules`（不重复声明 FIM 已有依赖：async-lock / web-tree-sitter / fastest-levenshtein）。
- **直接 import FIM 源码**：`import { getFimPrompt } from "../src/extension/fim-templates"`，不调编译产物，改 src 立刻反映。
- **vscode 重定向**：eval 的 tsconfig `paths: { "vscode": ["./stub/vscode.ts"] }` 把所有 `import "vscode"` 重定向到 stub。
- **代码风格**：双引号、无分号、无尾逗号、2 空格缩进、LF（对齐 FIM 的 .prettierrc）。
- **STOP_DEEPSEEK 真实值**：`["<｜fim begin｜>", "<｜fim hole｜>", "<｜fim end｜>", "<END>", "<｜end of sentence｜>"]`（注意全角 `｜`、`fim begin` 带空格，不是 `fim▁begin`）。
- **不实例化 CompletionProvider**：eval 只调纯函数，VS Code 集成层不测。
- **DeepSeek key + 裁判 key 从 env 读**：`DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` / `JUDGE_BASE_URL` / `JUDGE_API_KEY` / `JUDGE_MODEL`。裁判 key 为空 → Layer3 skip。

## File Structure

**FIM src 修改（2 处）：**
- `src/common/deepseek.ts` — 删 react 污染（`import { ReactNode }` + `logo?: ReactNode`）
- `src/extension/postprocessor.ts` — 新建，从 completion.ts 抽取的 `truncateCompletion` 纯函数
- `src/extension/providers/completion.ts` — onData 改为调 `truncateCompletion`

**eval 新建：**
- `eval/package.json` `eval/tsconfig.json` — 子项目配置（已建，Task 1 完善）
- `eval/stub/vscode.ts` — vscode 假对象（Position/Range/FakeDocument/FakeEditor）
- `eval/datasets/types.ts` — Sample 类型 + fim-self 快照 loader
- `eval/datasets/synthetic/*.ts` — 合成边界用例
- `eval/adapters/types.ts` — ContextAdapter/IntentAdapter 接口 + ContextIR/IntentResult
- `eval/adapters/context/noop.ts` `eval/adapters/intent/noop.ts` — Noop 占位
- `eval/chain.ts` — A→G 编排
- `eval/probes/*.ts` — context/intent/prompt/completion probe
- `eval/metrics/layer1_has.ts` `layer2_syntax.ts` `layer3_quality.ts` — 三层指标
- `eval/runner.ts` — 样本 × 矩阵 × 报告
- `eval/config.ts` — env 配置加载
- `eval/build.mjs` — copy wasm 到 eval/out/

---

## Task 1: common 层 react 清理

**Files:**
- Modify: `src/common/deepseek.ts`

**Interfaces:**
- Produces: 纯净的 `FimProvider` 类型（无 ReactNode），eval 可直接 import。`FimProvider` 字段：`apiHostname?/apiKey?/apiPath?/apiPort?/apiProtocol?/features?/fimTemplate?/id/label/modelName/provider/repositoryLevel?/type`。

- [ ] **Step 1: 删除 react import 和 logo 字段**

把 `src/common/deepseek.ts` 第 1 行 `import { ReactNode } from "react"` 删掉，第 22 行 `logo?: ReactNode` 删掉。

修改后完整文件：

```ts
export const DEEPSEEK_PROVIDER_ID = "deepseek-default"
export const DEEPSEEK_DEFAULT_BASE_URL =
  "https://api.deepseek.com/beta/completions"
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat"

export const API_PROVIDERS = {
  Deepseek: "deepseek"
}

export interface FimProvider {
  apiHostname?: string
  apiKey?: string
  apiPath?: string
  apiPort?: number
  apiProtocol?: string
  features?: string[]
  fimTemplate?: string
  id: string
  label: string
  modelName: string
  provider: string
  repositoryLevel?: boolean
  type: string
}

export const DEFAULT_PROVIDER_FORM_VALUES: FimProvider = {
  apiHostname: "api.deepseek.com",
  apiKey: "",
  apiPath: "/beta/completions",
  apiProtocol: "https",
  id: DEEPSEEK_PROVIDER_ID,
  label: "DeepSeek",
  modelName: DEEPSEEK_DEFAULT_MODEL,
  provider: API_PROVIDERS.Deepseek,
  type: "fim"
}
```

- [ ] **Step 2: 编译验证 FIM 仍正常**

Run: `npm run build`
Expected: 成功（logo 字段零使用，删掉不影响）。

- [ ] **Step 3: Commit**

```bash
git add src/common/deepseek.ts
git commit -m "refactor: remove ReactNode pollution from common/deepseek.ts"
```

---

## Task 2: 抽取 truncateCompletion 纯函数到 postprocessor.ts

**Files:**
- Create: `src/extension/postprocessor.ts`
- Modify: `src/extension/providers/completion.ts`（onData 的截断逻辑改为调纯函数）

**Interfaces:**
- Consumes: `CompletionProvider` 现有的 `onData` 截断逻辑（completion.ts:248-440）
- Produces: `truncateCompletion(args: TruncateArgs): string` 纯函数，输入结构化参数，输出截断后的 completion 字符串。eval 的 chain.ts F 环节和 completion.ts 都调它。

- [ ] **Step 1: 分析 onData 截断逻辑的输入依赖**

阅读 `src/extension/providers/completion.ts` 的 `onData` 方法（约 248-440 行）。它依赖：
- `this._completion`（累积的 completion 字符串）
- `this._provider.modelName` / `this._provider.fimTemplate`（stop words 用）
- `this._chunkCount`（chunk 计数）
- `this._nodeAtPosition`（tree-sitter 节点，可能为 null）
- `this._parser`（tree-sitter parser）
- `this._position`（光标位置）
- `this._prefixSuffix.prefix`（前缀）
- `this._isMultilineCompletion`（是否多行补全）
- `this.config`（multilineCompletionsEnabled / maxLines / numPredictFim）
- `getStopWords` / `getFimDataFromProvider` / `getCurrentLineText` / `getLineBreakCount`（来自 utils/fim-templates）

抽取成纯函数时，把这些都作为参数传入。

- [ ] **Step 2: 写 postprocessor.ts（含 TruncateArgs 类型 + truncateCompletion 函数）**

创建 `src/extension/postprocessor.ts`。把 completion.ts onData 里**从 stopWords 命中检查到 return this._completion 的整段截断逻辑**搬过来，改成接收参数、返回字符串。`this._completion` → 参数 `completion`，`this._xxx` → 参数字段。

```ts
import Parser, { SyntaxNode } from "web-tree-sitter"

import {
  CLOSING_BRACKETS,
  FIM_TEMPLATE_FORMAT,
  LINE_BREAK_REGEX,
  MAX_EMPTY_COMPLETION_CHARS,
  MIN_COMPLETION_CHUNKS,
  MULTI_LINE_DELIMITERS,
  MULTILINE_INSIDE,
  MULTILINE_OUTSIDE,
  OPENING_BRACKETS
} from "../common/constants"
import type { Bracket, PrefixSuffix } from "../common/types"
import {
  getCurrentLineText,
  getFimDataFromProvider,
  getLineBreakCount
} from "./utils"
import { getStopWords } from "./fim-templates"
import { Position } from "vscode"

export interface TruncateArgs {
  completion: string
  chunkCount: number
  providerModelName: string
  providerFimTemplate: string
  providerKey: string
  nodeAtPosition: SyntaxNode | null
  parser: Parser | undefined
  position: Position | null
  prefixSuffix: PrefixSuffix
  isMultilineCompletion: boolean
  multilineCompletionsEnabled: boolean
  maxLines: number
  streamResponse: unknown
}

const isMatchingBracket = (open: Bracket, close: string): boolean => {
  const pairs: Record<Bracket, string> = {
    "(": ")",
    "[": "]",
    "{": "}"
  }
  return pairs[open] === close
}

export function truncateCompletion(args: TruncateArgs): string {
  const {
    completion,
    chunkCount,
    providerModelName,
    providerFimTemplate,
    providerKey,
    nodeAtPosition,
    parser,
    position,
    prefixSuffix,
    isMultilineCompletion,
    multilineCompletionsEnabled,
    maxLines,
    streamResponse
  } = args

  const stopWords = getStopWords(
    providerModelName,
    providerFimTemplate || FIM_TEMPLATE_FORMAT.automatic
  )

  const providerFimData = getFimDataFromProvider(
    providerKey,
    streamResponse as any
  )
  if (providerFimData === undefined) return ""

  let result = completion + providerFimData
  const newChunkCount = chunkCount + 1

  if (
    result.length > MAX_EMPTY_COMPLETION_CHARS &&
    result.trim().length === 0
  ) {
    return result
  }

  if (stopWords.some((stopWord) => result.includes(stopWord))) {
    return result
  }

  if (
    !multilineCompletionsEnabled &&
    newChunkCount >= MIN_COMPLETION_CHUNKS &&
    LINE_BREAK_REGEX.test(result.trimStart())
  ) {
    return result
  }

  const isMultilineCompletionRequired =
    !isMultilineCompletion &&
    multilineCompletionsEnabled &&
    newChunkCount >= MIN_COMPLETION_CHUNKS &&
    LINE_BREAK_REGEX.test(result.trimStart())
  if (isMultilineCompletionRequired) {
    return result
  }

  try {
    if (nodeAtPosition && parser) {
      const takeFirst =
        MULTILINE_OUTSIDE.includes(nodeAtPosition.type) ||
        (MULTILINE_INSIDE.includes(nodeAtPosition.type) &&
          nodeAtPosition.childCount > 2)

      const lineText = getCurrentLineText(position) || ""
      const contextBeforeCompletion = prefixSuffix.prefix || ""

      const isInsideFunction =
        contextBeforeCompletion.includes("=>") ||
        contextBeforeCompletion.includes("function") ||
        nodeAtPosition.type.includes("function") ||
        nodeAtPosition.type.includes("method") ||
        nodeAtPosition.parent?.type.includes("function") ||
        nodeAtPosition.parent?.type.includes("method")

      if (providerFimData.includes("\n")) {
        const { rootNode } = parser.parse(`${lineText}${result}`)
        const { hasError } = rootNode

        const openBrackets: string[] = []
        let isBalanced = true

        for (const char of result) {
          if (OPENING_BRACKETS.includes(char as Bracket)) {
            openBrackets.push(char)
          } else if (CLOSING_BRACKETS.includes(char as Bracket)) {
            const lastOpen = openBrackets.pop()
            if (!lastOpen || !isMatchingBracket(lastOpen as Bracket, char)) {
              isBalanced = false
              break
            }
          }
        }

        const hasSubstantialContent = result.trim().length > 20
        const hasCompleteSyntax = openBrackets.length === 0 && isBalanced
        const hasEndPattern = /\}\s*$|\)\s*$|\]\s*$|;\s*$/.test(result)
        const endsWithEmptyLine = /\n\s*\n\s*$/.test(result)

        const lines = result.split("\n")
        const lastLineIndent = lines.length > 1
          ? lines[lines.length - 1].length - lines[lines.length - 1].trimStart().length
          : 0
        const firstLineIndent = lines.length > 0
          ? lines[0].length - lines[0].trimStart().length
          : 0
        const indentationReturned = lines.length > 2 && lastLineIndent <= firstLineIndent

        const structuralBoundaryPattern = /\}\s*\n(\s*)\S+/m.test(result)

        if (isInsideFunction && result.includes("}")) {
          const lastClosingBraceIndex = result.lastIndexOf("}")
          if (hasCompleteSyntax) {
            const contentAfterBrace = result.substring(lastClosingBraceIndex + 1).trim()
            if (!contentAfterBrace || /^\s*\n\s*\S+/.test(contentAfterBrace)) {
              return result.substring(0, lastClosingBraceIndex + 1)
            }
          }
        }

        if (structuralBoundaryPattern && hasCompleteSyntax) {
          const match = result.match(/\}\s*\n(\s*)\S+/m)
          if (match && match.index !== undefined) {
            const closingBracePos = match.index + 1
            const indentAfterBrace = match[1].length
            if (indentAfterBrace <= firstLineIndent) {
              return result.substring(0, closingBracePos)
            }
          }
        }

        if (
          nodeAtPosition &&
          isMultilineCompletion &&
          newChunkCount >= 2 &&
          (takeFirst || hasCompleteSyntax) &&
          !hasError &&
          (hasEndPattern || endsWithEmptyLine || indentationReturned ||
           (hasSubstantialContent && hasCompleteSyntax))
        ) {
          if (
            MULTI_LINE_DELIMITERS.some((delimiter) => result.endsWith(delimiter)) ||
            endsWithEmptyLine ||
            (hasEndPattern && hasCompleteSyntax) ||
            (structuralBoundaryPattern && hasCompleteSyntax)
          ) {
            return result
          }
        }
      }
    }
  } catch {
    return ""
  }

  if (getLineBreakCount(result) >= maxLines) {
    return result
  }

  return ""
}
```

- [ ] **Step 3: completion.ts 的 onData 改为调 truncateCompletion**

修改 `src/extension/providers/completion.ts`。在 `onData` 方法里，把原来那一大段截断逻辑替换为调用 `truncateCompletion`。`onData` 接收 `StreamResponse`，累加 `providerFimData` 后判断是否截断。

替换 `onData` 方法体（保留方法签名 `private onData(data: StreamResponse | undefined): string`）：

```ts
  private onData(data: StreamResponse | undefined): string {
    if (!this._provider) return ""

    const providerFimData = getFimDataFromProvider(
      this._provider.provider,
      data
    )
    if (providerFimData === undefined) return ""

    this._completion = this._completion + providerFimData
    this._chunkCount = this._chunkCount + 1

    if (
      this._completion.length > MAX_EMPTY_COMPLETION_CHARS &&
      this._completion.trim().length === 0
    ) {
      this.abortCompletion()
      logger.log(
        `Streaming response end as llm in empty completion loop:  ${this._nonce}`
      )
    }

    const truncated = truncateCompletion({
      completion: this._completion,
      chunkCount: this._chunkCount,
      providerModelName: this._provider.modelName,
      providerFimTemplate: this._provider.fimTemplate || FIM_TEMPLATE_FORMAT.automatic,
      providerKey: this._provider.provider,
      nodeAtPosition: this._nodeAtPosition,
      parser: this._parser,
      position: this._position,
      prefixSuffix: this._prefixSuffix,
      isMultilineCompletion: this._isMultilineCompletion,
      multilineCompletionsEnabled: this.config.multilineCompletionsEnabled,
      maxLines: this.config.maxLines,
      streamResponse: data
    })

    if (truncated && truncated !== "") {
      this._completion = truncated
      return this._completion
    }

    return ""
  }
```

> 注意：`truncateCompletion` 返回非空字符串表示"已截断，完成"；返回空字符串表示"继续累积"。`onData` 里 `providerFimData` 累加和空补全循环 abort 逻辑保留在 onData（这些是流式累积状态，不属于纯截断）。stop words 命中检查在 truncateCompletion 内部，原 onData 里的 `stopWords.some` 块删除（已移入纯函数）。

在 completion.ts 顶部 import 区加：

```ts
import { truncateCompletion } from "../postprocessor"
```

- [ ] **Step 4: 编译验证 FIM 仍正常**

Run: `npm run build`
Expected: 成功。如果报错（某个常量/函数没 import），补 import。注意 `MULTILINE_INSIDE`/`MULTILINE_OUTSIDE`/`MULTI_LINE_DELIMITERS`/`LINE_BREAK_REGEX` 来自 `common/constants`，completion.ts 已 import，postprocessor.ts 也要 import。

- [ ] **Step 5: 手动验证补全仍工作**

Run: `npm run build`（已在 Step 4 做）。在 VS Code Extension Development Host（F5）触发一次补全，确认 ghost text 正常出现、截断行为和之前一致。

- [ ] **Step 6: Commit**

```bash
git add src/extension/postprocessor.ts src/extension/providers/completion.ts
git commit -m "refactor: extract truncateCompletion into postprocessor.ts (shared by FIM + eval)"
```

---

## Task 3: eval 子项目骨架 + vscode stub

**Files:**
- Modify: `eval/package.json`（已建，完善 scripts）
- Modify: `eval/tsconfig.json`（已建，确认 paths）
- Create: `eval/stub/vscode.ts`
- Create: `eval/build.mjs`

**Interfaces:**
- Produces: `vscode` stub 模块，导出 `Position`/`Range`/`Uri`/`FakeDocument`/`FakeEditor` 类 + `window`/`workspace`/`commands` no-op 对象。后续所有 import `../src/extension/*` 的 eval 文件经 tsconfig paths 重定向到此。

- [ ] **Step 1: 完善 eval/package.json**

`eval/package.json` 替换为：

```json
{
  "name": "fim-eval",
  "version": "0.0.1",
  "private": true,
  "description": "FIM completion evaluation harness",
  "type": "commonjs",
  "scripts": {
    "build": "node build.mjs && tsc -p tsconfig.json",
    "eval": "node build.mjs && tsc -p tsconfig.json && node out/runner.js"
  },
  "devDependencies": {
    "@types/node": "^16.18.68",
    "esbuild": "^0.21.5",
    "typescript": "^4.7.4"
  }
}
```

> 注意：eval 共享 FIM 根 node_modules。`web-tree-sitter`/`fastest-levenshtein`/`async-lock` 从根解析，不在此声明。`esbuild` 用于 build.mjs copy 逻辑（其实 build.mjs 用 fs 即可，esbuild 可选——若不用可删）。

- [ ] **Step 2: 确认 eval/tsconfig.json**

`eval/tsconfig.json`（已建，确认内容）：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2020"],
    "outDir": "./out",
    "rootDir": "..",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "vscode": ["./stub/vscode.ts"]
    }
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules", "out"]
}
```

> `rootDir: ".."` 让 tsc 能编译 `../src/**`（被 eval import）。输出到 `eval/out/`，路径会带 `src/` 和 `eval/` 前缀。

- [ ] **Step 3: 写 vscode stub**

创建 `eval/stub/vscode.ts`。覆盖链路用到的方法：`getPrefixSuffix` 用 `document.lineCount`/`document.getText(range)`/`Position`/`Range`；`CompletionFormatter` 用 `editor.document`/`editor.selection.active`/`document.lineAt(line)`/`currentLine.range.end`/`document.getText(range)`。

```ts
// eval/stub/vscode.ts
// Minimal vscode stub for eval. Only implements what the FIM completion chain uses.

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(public start: Position, public end: Position) {}
}

export interface TextLine {
  text: string
  range: Range
  rangeIncludingLineBreak: Range
  firstNonWhitespaceCharacterIndex: number
  isEmptyOrWhitespace: boolean
  lineNumber: number
}

export interface Uri {
  fsPath: string
  toString(): string
}

export const Uri = {
  file: (path: string): Uri => ({
    fsPath: path,
    toString: () => path
  })
}

export interface TextDocument {
  uri: Uri
  languageId: string
  lineCount: number
  getText(range?: Range): string
  lineAt(line: number | Position): TextLine
  save(): Promise<boolean>
}

export function createFakeDocument(
  text: string,
  fsPath: string,
  languageId: string
): TextDocument {
  const lines = text.split("\n")
  return {
    uri: Uri.file(fsPath),
    languageId,
    lineCount: lines.length,
    getText(range?: Range): string {
      if (!range) return text
      const startLine = range.start.line
      const endLine = range.end.line
      const startChar = range.start.character
      const endChar = range.end.character
      if (startLine === endLine) {
        return (lines[startLine] || "").slice(startChar, endChar)
      }
      const parts = [lines[startLine].slice(startChar)]
      for (let i = startLine + 1; i < endLine; i++) parts.push(lines[i])
      parts.push((lines[endLine] || "").slice(0, endChar))
      return parts.join("\n")
    },
    lineAt(line: number | Position): TextLine {
      const lineNumber = typeof line === "number" ? line : line.line
      const text = lines[lineNumber] || ""
      const start = new Position(lineNumber, 0)
      const end = new Position(lineNumber, text.length)
      return {
        text,
        range: new Range(start, end),
        rangeIncludingLineBreak: new Range(start, new Position(lineNumber + 1, 0)),
        firstNonWhitespaceCharacterIndex: text.length - text.trimStart().length,
        isEmptyOrWhitespace: text.trim().length === 0,
        lineNumber
      }
    },
    save: () => Promise.resolve(true)
  }
}

export interface TextEditor {
  document: TextDocument
  selection: { active: Position }
}

export function createFakeEditor(
  document: TextDocument,
  cursor: Position
): TextEditor {
  return { document, selection: { active: cursor } }
}

// no-op stubs for window/workspace/commands (eval doesn't drive real VS Code IO)
export const window = {
  activeTextEditor: undefined as TextEditor | undefined,
  showInformationMessage: () => undefined,
  createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} })
}

export const workspace = {
  getConfiguration: () => ({
    get: () => undefined,
    update: () => Promise.resolve()
  }),
  textDocuments: [] as TextDocument[],
  workspaceFolders: undefined as unknown
}

export const commands = {
  registerCommand: () => ({ dispose() {} }),
  executeCommand: () => Promise.resolve()
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

export enum InlineCompletionTriggerKind {
  Invoke = 0,
  Automatic = 1
}

export type InlineCompletionItem = unknown
```

- [ ] **Step 4: 写 build.mjs（copy tree-sitter wasm）**

创建 `eval/build.mjs`。把 FIM 根 `node_modules/tree-sitter-wasms/out/*.wasm` 拷到 `eval/out/tree-sitter-wasms/`，让 parser.ts 的 `path.join(__dirname, "tree-sitter-wasms", ...)` 能找到。

```js
// eval/build.mjs
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootModules = path.join(__dirname, "..", "node_modules", "tree-sitter-wasms", "out")
const dest = path.join(__dirname, "out", "tree-sitter-wasms")

if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })

if (fs.existsSync(rootModules)) {
  for (const file of fs.readdirSync(rootModules)) {
    if (file.endsWith(".wasm")) {
      fs.copyFileSync(path.join(rootModules, file), path.join(dest, file))
    }
  }
  console.log(`copied tree-sitter wasms to ${dest}`)
} else {
  console.warn(`warn: tree-sitter-wasms not found at ${rootModules}`)
}
```

- [ ] **Step 5: 编译验证 stub 不报错**

Run: `cd eval && npx tsc -p tsconfig.json --noEmit 2>&1 | head -20`
Expected: 无错误（或只有 eval 暂无 .ts 业务文件的空编译警告）。stub 本身应编译通过。

> 注意：eval 根目录暂无业务代码，tsc 可能报 "No inputs were found"。这是正常的，下个 Task 加业务文件后就不报了。

- [ ] **Step 6: Commit**

```bash
git add eval/package.json eval/tsconfig.json eval/stub/vscode.ts eval/build.mjs
git commit -m "feat(eval): scaffold eval subproject + vscode stub"
```

---

## Task 4: adapters 类型 + Noop 实现

**Files:**
- Create: `eval/adapters/types.ts`
- Create: `eval/adapters/context/noop.ts`
- Create: `eval/adapters/intent/noop.ts`

**Interfaces:**
- Produces: `ContextAdapter`/`IntentAdapter` 接口、`ContextIR`/`ContextChunk`/`IntentResult` 类型、`NoopContextCollector`/`NoopIntentDetector` 类。chain.ts 消费这些。

- [ ] **Step 1: 写 adapters/types.ts**

创建 `eval/adapters/types.ts`：

```ts
import { PrefixSuffix } from "../../src/common/types"

export interface ContextChunk {
  filePath: string
  text: string
  relevanceScore?: number
  reason?: string
}

export interface ContextIR {
  chunks: ContextChunk[]
  tokenEstimate: number
  source: string
}

export type IntentType =
  | "line_continuation"
  | "block_completion"
  | "import_completion"
  | "argument_completion"
  | "comment_to_code"
  | "test_completion"
  | "unknown"

export interface IntentResult {
  intent: IntentType
  confidence: number
  signals: string[]
}

export interface ContextAdapterInput {
  filePath: string
  languageId: string
  prefixSuffix: PrefixSuffix
  cursor: { line: number; character: number }
}

export interface ContextAdapter {
  name: string
  collect(input: ContextAdapterInput): Promise<ContextIR>
}

export interface IntentAdapterInput {
  languageId: string
  prefixSuffix: PrefixSuffix
  cursor: { line: number; character: number }
}

export interface IntentAdapter {
  name: string
  detect(input: IntentAdapterInput): Promise<IntentResult>
}

export interface AdapterMatrix {
  label: string
  contextAdapter: ContextAdapter
  intentAdapter: IntentAdapter
}
```

- [ ] **Step 2: 写 NoopContextCollector**

创建 `eval/adapters/context/noop.ts`：

```ts
import { ContextAdapter, ContextAdapterInput, ContextIR } from "../types"

export const NoopContextCollector: ContextAdapter = {
  name: "noop",
  async collect(_input: ContextAdapterInput): Promise<ContextIR> {
    return { chunks: [], tokenEstimate: 0, source: "noop" }
  }
}
```

- [ ] **Step 3: 写 NoopIntentDetector**

创建 `eval/adapters/intent/noop.ts`：

```ts
import { IntentAdapter, IntentAdapterInput, IntentResult } from "../types"

export const NoopIntentDetector: IntentAdapter = {
  name: "noop",
  async detect(_input: IntentAdapterInput): Promise<IntentResult> {
    return { intent: "unknown", confidence: 0, signals: [] }
  }
}
```

- [ ] **Step 4: 编译验证**

Run: `cd eval && npx tsc -p tsconfig.json --noEmit 2>&1 | head -20`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add eval/adapters/
git commit -m "feat(eval): add adapter interfaces + Noop baseline implementations"
```

---

## Task 5: datasets 类型 + fim-self 快照 loader + 合成用例

**Files:**
- Create: `eval/datasets/types.ts`
- Create: `eval/datasets/loader.ts`
- Create: `eval/datasets/synthetic/cases.ts`

**Interfaces:**
- Produces: `Sample` 类型、`loadSamples(source)` 函数、一批合成边界用例。runner.ts 消费 `Sample[]`。

- [ ] **Step 1: 写 datasets/types.ts**

创建 `eval/datasets/types.ts`：

```ts
export interface Sample {
  id: string
  source: "synthetic" | "fim-self"
  filePath: string
  cursor: { line: number; character: number }
  languageId: string
  expectedCompletion?: string
}
```

- [ ] **Step 2: 写 synthetic/cases.ts（合成边界用例）**

创建 `eval/datasets/synthetic/cases.ts`。这些是手造的小文件 + 光标位置，覆盖边界场景。每个 case 写一个临时文件到 `eval/out/synthetic/<id>.<ext>`，Sample.filePath 指向它。

```ts
import * as fs from "fs"
import * as path from "path"
import { Sample } from "../types"

interface SyntheticCase {
  id: string
  filename: string
  languageId: string
  content: string
  cursorLine: number
  cursorCharacter: number
}

const cases: SyntheticCase[] = [
  {
    id: "syn-empty-file",
    filename: "empty.ts",
    languageId: "typescript",
    content: "",
    cursorLine: 0,
    cursorCharacter: 0
  },
  {
    id: "syn-line-continuation",
    filename: "line-cont.ts",
    languageId: "typescript",
    content: "const result = 1 + 2",
    cursorLine: 0,
    cursorCharacter: 19
  },
  {
    id: "syn-block-start",
    filename: "block-start.ts",
    languageId: "typescript",
    content: "function add(a, b) {\n  ",
    cursorLine: 1,
    cursorCharacter: 2
  },
  {
    id: "syn-import",
    filename: "import.ts",
    languageId: "typescript",
    content: "import { ",
    cursorLine: 0,
    cursorCharacter: 9
  },
  {
    id: "syn-comment-to-code",
    filename: "comment.ts",
    languageId: "typescript",
    content: "// sort the array\n",
    cursorLine: 1,
    cursorCharacter: 0
  }
]

export function getSyntheticSamples(): Sample[] {
  const dir = path.join(__dirname, "synthetic")
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return cases.map((c) => {
    const filePath = path.join(dir, c.filename)
    fs.writeFileSync(filePath, c.content)
    return {
      id: c.id,
      source: "synthetic" as const,
      filePath,
      cursor: { line: c.cursorLine, character: c.cursorCharacter },
      languageId: c.languageId
    }
  })
}
```

- [ ] **Step 3: 写 loader.ts（fim-self 快照）**

创建 `eval/datasets/loader.ts`。从 FIM 仓库真实代码切 `(文件, 光标)` 样本。光标位置人造（放在函数体空行、行尾等合理位置）。

```ts
import * as fs from "fs"
import * as path from "path"
import { Sample } from "./types"
import { getSyntheticSamples } from "./synthetic/cases"

// 真实快照：从 FIM 仓库 src/ 切样本。光标位置人造（函数体空行/行尾）。
const fimSelfSnapshots: Sample[] = [
  {
    id: "fim-self-completion-ondata",
    source: "fim-self",
    // FIM 自己的 completion.ts，光标放在 onData 方法体内某行尾
    filePath: path.resolve(__dirname, "..", "..", "..", "src", "extension", "providers", "completion.ts"),
    cursor: { line: 260, character: 0 },
    languageId: "typescript"
  },
  {
    id: "fim-self-utils-getprefix",
    source: "fim-self",
    filePath: path.resolve(__dirname, "..", "..", "..", "src", "extension", "utils.ts"),
    cursor: { line: 190, character: 0 },
    languageId: "typescript"
  }
]

export function loadSamples(source: "synthetic" | "fim-self" | "all"): Sample[] {
  const synthetic = source === "fim-self" ? [] : getSyntheticSamples()
  const fimSelf = source === "synthetic" ? [] : fimSelfSnapshots.filter((s) => fs.existsSync(s.filePath))
  return [...synthetic, ...fimSelf]
}
```

> 注意：fim-self 的 filePath 用 `path.resolve(__dirname, "..", "..", "..", "src", ...)` —— eval 编译后 `__dirname` 是 `eval/out/datasets/`，往上三层到 FIM 根，再进 src。光标行号是示例值，跑起来如果行号超出文件会 fallback 到文件末尾（chain.ts 处理）。

- [ ] **Step 4: 编译验证**

Run: `cd eval && npx tsc -p tsconfig.json --noEmit 2>&1 | head -20`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add eval/datasets/
git commit -m "feat(eval): add Sample types + fim-self snapshot loader + synthetic cases"
```

---

## Task 6: config.ts（env 配置加载）

**Files:**
- Create: `eval/config.ts`

**Interfaces:**
- Produces: `EvalConfig` 类型 + `loadConfig()` 函数。chain.ts/runner.ts/layer3 消费。

- [ ] **Step 1: 写 config.ts**

创建 `eval/config.ts`：

```ts
export interface EvalConfig {
  deepseek: {
    apiKey: string
    model: string
  }
  judge: {
    baseUrl: string
    apiKey: string
    model: string
    enabled: boolean
  }
  contextLength: number
  dataset: "synthetic" | "fim-self" | "all"
}

export function loadConfig(): EvalConfig {
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || ""
  const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat"
  const judgeBaseUrl = process.env.JUDGE_BASE_URL || ""
  const judgeApiKey = process.env.JUDGE_API_KEY || ""
  const judgeModel = process.env.JUDGE_MODEL || ""
  const dataset = (process.env.EVAL_DATASET as EvalConfig["dataset"]) || "all"

  return {
    deepseek: { apiKey: deepseekApiKey, model: deepseekModel },
    judge: {
      baseUrl: judgeBaseUrl,
      apiKey: judgeApiKey,
      model: judgeModel,
      enabled: Boolean(judgeBaseUrl && judgeApiKey && judgeModel)
    },
    contextLength: 100,
    dataset
  }
}
```

- [ ] **Step 2: 编译验证**

Run: `cd eval && npx tsc -p tsconfig.json --noEmit 2>&1 | head -20`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add eval/config.ts
git commit -m "feat(eval): add config loader (env-based, DeepSeek + judge)"
```

---

## Task 7: chain.ts — A→G 全链路编排

**Files:**
- Create: `eval/chain.ts`

**Interfaces:**
- Consumes: FIM 的 `getPrefixSuffix`/`getFimPrompt`/`llm`/`getParser`/`getNodeAtPosition`/`truncateCompletion`/`CompletionFormatter`/`removeStopWords` 相关；`NoopContextCollector`/`NoopIntentDetector`；stub 的 `createFakeDocument`/`createFakeEditor`/`Position`；`Sample`/`ContextAdapter`/`IntentAdapter`/`AdapterMatrix`。
- Produces: `ChainResult` 类型 + `runChain(sample, matrix, config)` 函数。runner.ts 消费。

- [ ] **Step 1: 写 chain.ts**

创建 `eval/chain.ts`。编排 A→G，每环产出喂给 probe（probe 在 Task 8，此处先留 hook，probe 调用可选）。

```ts
import * as fs from "fs"

import { DEFAULT_PROVIDER_FORM_VALUES, FimProvider } from "../src/common/deepseek"
import { PrefixSuffix } from "../src/common/types"
import { CompletionFormatter } from "../src/extension/completion-formatter"
import { getFimPrompt } from "../src/extension/fim-templates"
import { llm } from "../src/extension/llm"
import { truncateCompletion } from "../src/extension/postprocessor"
import { getNodeAtPosition, getParser } from "../src/extension/parser"
import { getPrefixSuffix } from "../src/extension/utils"
import { createFakeDocument, createFakeEditor, Position } from "./stub/vscode"

import { ContextAdapter, ContextIR, IntentAdapter, IntentResult } from "./adapters/types"
import { EvalConfig } from "./config"
import { Sample } from "./datasets/types"

export interface ChainArtifacts {
  prefixSuffix: PrefixSuffix
  context: ContextIR
  intent: IntentResult
  prompt: { prompt: string; stopWords: string[] }
  model: { rawCompletion: string; latencyMs: number; error?: string }
  completion: { text: string; truncated: boolean }
}

export interface ChainResult {
  sampleId: string
  matrixLabel: string
  artifacts: ChainArtifacts
}

function makeProvider(config: EvalConfig): FimProvider {
  return {
    ...DEFAULT_PROVIDER_FORM_VALUES,
    modelName: config.deepseek.model,
    apiKey: config.deepseek.apiKey
  }
}

export async function runChain(
  sample: Sample,
  matrix: { label: string; contextAdapter: ContextAdapter; intentAdapter: IntentAdapter },
  config: EvalConfig
): Promise<ChainResult> {
  const provider = makeProvider(config)
  const fileContent = fs.readFileSync(sample.filePath, "utf-8")
  const lines = fileContent.split("\n")
  const cursorLine = Math.min(sample.cursor.line, lines.length - 1)
  const cursor = new Position(cursorLine, sample.cursor.character)
  const document = createFakeDocument(fileContent, sample.filePath, sample.languageId)

  // A. prefix/suffix
  const prefixSuffix = getPrefixSuffix(config.contextLength, document, cursor)

  // B. context
  const context = await matrix.contextAdapter.collect({
    filePath: sample.filePath,
    languageId: sample.languageId,
    prefixSuffix,
    cursor: { line: cursorLine, character: sample.cursor.character }
  })

  // C. intent
  const intent = await matrix.intentAdapter.detect({
    languageId: sample.languageId,
    prefixSuffix,
    cursor: { line: cursorLine, character: sample.cursor.character }
  })

  // D. prompt
  const prompt = getFimPrompt(
    provider.modelName,
    provider.fimTemplate || "automatic",
    {
      context: context.chunks.map((c) => c.text).join("\n"),
      prefixSuffix,
      header: "",
      fileContextEnabled: context.chunks.length > 0,
      language: sample.languageId
    }
  )
  const stopWords = ["<｜fim begin｜>", "<｜fim hole｜>", "<｜fim end｜>", "<END>", "<｜end of sentence｜>"]

  // E. model
  const startTime = Date.now()
  let rawCompletion = ""
  let modelError: string | undefined
  let nodeAtPosition: any = null
  let parser: any

  try {
    // 解析 AST（F 截断要用）
    parser = await getParser(sample.filePath)
    if (parser) {
      const tree = parser.parse(fileContent)
      nodeAtPosition = getNodeAtPosition(tree, cursor)
    }
  } catch (e) {
    // AST 解析失败不阻断，F 截断降级（无 node）
  }

  const fimRequest = {
    body: {
      max_tokens: 512,
      model: provider.modelName,
      prompt,
      stream: true,
      temperature: 0.2
    },
    options: {
      hostname: provider.apiHostname || "",
      port: provider.apiPort ? Number(provider.apiPort) : undefined,
      path: provider.apiPath || "",
      protocol: provider.apiProtocol || "",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: provider.apiKey ? `Bearer ${provider.apiKey}` : ""
      }
    },
    onStart: () => {},
    onError: (err: Error) => { modelError = err.message },
    onData: (data: any) => {
      const truncated = truncateCompletion({
        completion: rawCompletion,
        chunkCount: 0,
        providerModelName: provider.modelName,
        providerFimTemplate: provider.fimTemplate || "automatic",
        providerKey: provider.provider,
        nodeAtPosition,
        parser,
        position: cursor,
        prefixSuffix,
        isMultilineCompletion: false,
        multilineCompletionsEnabled: true,
        maxLines: 40,
        streamResponse: data
      })
      if (truncated && truncated !== "") {
        rawCompletion = truncated
        return truncated
      }
      // 累积：从 data 取增量文本
      const chunk = data?.response || data?.choices?.[0]?.text || data?.choices?.[0]?.delta?.content || ""
      rawCompletion += chunk
      return ""
    }
  }

  await new Promise<void>((resolve) => {
    llm({
      ...fimRequest,
      onEnd: () => resolve()
    }).catch(() => resolve())
  })

  const latencyMs = Date.now() - startTime

  // F. postprocess（格式化）
  let finalText = rawCompletion
  let truncated = false
  try {
    const editor = createFakeEditor(document, cursor)
    const formatter = new CompletionFormatter(editor as any)
    finalText = formatter.format(rawCompletion) as string
  } catch (e) {
    // 格式化失败用原始补全
  }

  return {
    sampleId: sample.id,
    matrixLabel: matrix.label,
    artifacts: {
      prefixSuffix,
      context,
      intent,
      prompt: { prompt, stopWords },
      model: { rawCompletion, latencyMs, error: modelError },
      completion: { text: finalText, truncated }
    }
  }
}
```

> 注意：
> - `onData` 里 `truncateCompletion` 的 `completion` 传当前累积值，但它内部会再 `+ providerFimData`——这里有个语义问题：truncateCompletion 内部做了 `result = completion + providerFimData`。所以 chain 里不应在 onData 外部先累加，而是让 truncateCompletion 处理。但 chain 拿不到"已累积的 completion"状态（onData 是流式回调）。**简化方案**：chain 的 onData 每次 chunk 进来就调 truncateCompletion，传入累积的 rawCompletion + 当前 data，truncateCompletion 内部累加并判断。若返回非空=截断完成，赋给 rawCompletion 并 abort（但 llm 的 abort 在 onStart 给的 controller）。第一版为简化：onData 只累加 rawCompletion，不中途截断；流结束后一次性调 truncateCompletion 做最终截断。这样无需中途 abort，逻辑简单。**采用此简化**——见 Step 2 修正。

- [ ] **Step 2: 修正 onData 为"流后一次性截断"简化**

chain.ts 的 E 环节改为：onData 只累加 rawCompletion，不调 truncateCompletion；流结束后一次性调 truncateCompletion 截断。

替换 E 环节（从 `// E. model` 到 `await new Promise` 结束）为：

```ts
  // E. model — onData 只累加，流后一次性截断
  const startTime = Date.now()
  let rawCompletion = ""
  let modelError: string | undefined
  let nodeAtPosition: any = null
  let parser: any

  try {
    parser = await getParser(sample.filePath)
    if (parser) {
      const tree = parser.parse(fileContent)
      nodeAtPosition = getNodeAtPosition(tree, cursor)
    }
  } catch {
    // AST 解析失败不阻断
  }

  await new Promise<void>((resolve) => {
    llm({
      body: {
        max_tokens: 512,
        model: provider.modelName,
        prompt,
        stream: true,
        temperature: 0.2
      },
      options: {
        hostname: provider.apiHostname || "",
        port: provider.apiPort ? Number(provider.apiPort) : undefined,
        path: provider.apiPath || "",
        protocol: provider.apiProtocol || "",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: provider.apiKey ? `Bearer ${provider.apiKey}` : ""
        }
      },
      onStart: () => {},
      onError: (err: Error) => { modelError = err.message },
      onData: (data: any) => {
        const chunk = data?.response || data?.choices?.[0]?.text || data?.choices?.[0]?.delta?.content || ""
        rawCompletion += chunk
      },
      onEnd: () => resolve()
    }).catch(() => resolve())
  })

  const latencyMs = Date.now() - startTime

  // F. postprocess — 先截断后格式化
  let finalText = rawCompletion
  let truncated = false
  if (rawCompletion) {
    const truncatedResult = truncateCompletion({
      completion: rawCompletion,
      chunkCount: 1,
      providerModelName: provider.modelName,
      providerFimTemplate: provider.fimTemplate || "automatic",
      providerKey: provider.provider,
      nodeAtPosition,
      parser,
      position: cursor,
      prefixSuffix,
      isMultilineCompletion: false,
      multilineCompletionsEnabled: true,
      maxLines: 40,
      streamResponse: { response: "", choices: [{ text: "" }] }
    })
    if (truncatedResult) {
      finalText = truncatedResult
      truncated = true
    }
  }
  try {
    const editor = createFakeEditor(document, cursor)
    const formatter = new CompletionFormatter(editor as any)
    finalText = formatter.format(finalText) as string
  } catch {
    // 格式化失败用截断后的文本
  }
```

> 注意：`truncateCompletion` 的 `streamResponse` 传一个空的（`response: ""`），因为 chain 是流后一次性调用，增量 providerFimData 应为空——但 truncateCompletion 内部会 `result = completion + providerFimData`，providerFimData 为空时 result = completion。这依赖 `getFimDataFromProvider` 对空 response 返回 `""` 而非 `undefined`。**需验证**：若返回 undefined，truncateCompletion 直接 return ""，chain 拿到空。Step 3 会跑起来验证。

- [ ] **Step 3: 编译验证**

Run: `cd eval && npx tsc -p tsconfig.json --noEmit 2>&1 | head -30`
Expected: 可能报类型错误（`formatter.format` 返回类型、`llm` 的 StreamRequest 类型不匹配）。逐个修：`formatter.format(...)` 加 `as string`；`llm({...})` 的参数用 `as any` 绕过严格类型（eval 场景可接受）。

- [ ] **Step 4: Commit**

```bash
git add eval/chain.ts
git commit -m "feat(eval): add chain.ts A→G pipeline orchestration"
```

---

## Task 8: metrics 三层

**Files:**
- Create: `eval/metrics/layer1_has.ts`
- Create: `eval/metrics/layer2_syntax.ts`
- Create: `eval/metrics/layer3_quality.ts`

**Interfaces:**
- Produces: `Layer1Result`/`Layer2Result`/`Layer3Result` 类型 + `evalLayer1()`/`evalLayer2()`/`evalLayer3()` 函数。probes/completion.ts 消费。

- [ ] **Step 1: 写 layer1_has.ts**

创建 `eval/metrics/layer1_has.ts`：

```ts
export interface Layer1Result {
  hasCompletion: boolean
  noError: boolean
  latencyMs: number
}

export function evalLayer1(
  completionText: string,
  modelError: string | undefined,
  latencyMs: number
): Layer1Result {
  return {
    hasCompletion: completionText.trim().length > 0,
    noError: !modelError,
    latencyMs
  }
}
```

- [ ] **Step 2: 写 layer2_syntax.ts**

创建 `eval/metrics/layer2_syntax.ts`。用 tree-sitter 解析 `prefix + completion + suffix`，检查 error 节点、括号平衡、与 suffix 重复。

```ts
import Parser from "web-tree-sitter"

import { getParser } from "../../src/extension/parser"

export interface Layer2Result {
  syntaxValid: boolean
  bracketBalanced: boolean
  noOverrun: boolean
  noDuplication: boolean
  errorNodeCount: number
}

const OPENING = ["[", "{", "("]
const CLOSING = ["]", "}", ")"]

function checkBracketBalance(text: string): boolean {
  const stack: string[] = []
  const pairs: Record<string, string> = { "]": "[", "}": "{", ")": "(" }
  for (const char of text) {
    if (OPENING.includes(char)) stack.push(char)
    else if (CLOSING.includes(char)) {
      if (stack.pop() !== pairs[char]) return false
    }
  }
  return stack.length === 0
}

export async function evalLayer2(
  prefix: string,
  completion: string,
  suffix: string,
  filePath: string,
  languageId: string
): Promise<Layer2Result> {
  const fullText = `${prefix}${completion}${suffix}`

  let errorNodeCount = 0
  let syntaxValid = true
  try {
    const parser = await getParser(filePath)
    if (parser) {
      const tree = parser.parse(fullText)
      const iterate = (node: Parser.SyntaxNode) => {
        if (node.type.includes("ERROR") || node.hasError) errorNodeCount++
        for (const child of node.children) iterate(child)
      }
      iterate(tree.rootNode)
      syntaxValid = errorNodeCount === 0 && !tree.rootNode.hasError
    } else {
      // 无 parser 的语言，跳过语法检查（视为通过）
      syntaxValid = true
    }
  } catch {
    syntaxValid = false
  }

  const bracketBalanced = checkBracketBalance(completion)
  const noOverrun = !/\n\s*\n\s*\n/.test(completion.trim()) // 粗略：补全不应有连续多空行（越界信号）
  const noDuplication = !suffix.startsWith(completion.trim().split("\n").pop() || "___NOMATCH___")

  return { syntaxValid, bracketBalanced, noOverrun, noDuplication, errorNodeCount }
}
```

> 注意：`noOverrun`/`noDuplication` 是粗略启发式，第一版够用。真正的越界检测在 truncateCompletion 里已做（chain F 环节），layer2 这里做独立校验。

- [ ] **Step 3: 写 layer3_quality.ts**

创建 `eval/metrics/layer3_quality.ts`。LLM-judge，调 OpenAI-compatible `/v1/chat/completions`。

```ts
export interface Layer3Result {
  score: number
  reasoning: string
  judged: boolean
}

export async function evalLayer3(
  prefix: string,
  completion: string,
  suffix: string,
  judge: { baseUrl: string; apiKey: string; model: string; enabled: boolean }
): Promise<Layer3Result> {
  if (!judge.enabled) {
    return { score: 0, reasoning: "judge not configured, Layer3 skipped", judged: false }
  }

  const prompt = `You are evaluating a code completion. Score it 0-10.

Context BEFORE cursor (prefix):
\`\`\`
${prefix.slice(-500)}
\`\`\`

Completion:
\`\`\`
${completion}
\`\`\`

Context AFTER cursor (suffix):
\`\`\`
${suffix.slice(0, 500)}
\`\`\`

Evaluate: Is the completion correct? Is it what the user likely wanted? Is the code style reasonable?
Respond in JSON: {"score": <0-10>, "reasoning": "<one sentence>"}`

  try {
    const url = `${judge.baseUrl.replace(/\/$/, "")}/v1/chat/completions`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${judge.apiKey}`
      },
      body: JSON.stringify({
        model: judge.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0
      })
    })
    if (!res.ok) {
      return { score: 0, reasoning: `judge API error: ${res.status}`, judged: false }
    }
    const data = await res.json() as any
    const content = data?.choices?.[0]?.message?.content || ""
    const match = content.match(/\{[^}]+\}/s)
    if (match) {
      const parsed = JSON.parse(match[0])
      return {
        score: Number(parsed.score) || 0,
        reasoning: String(parsed.reasoning || ""),
        judged: true
      }
    }
    return { score: 0, reasoning: `judge response unparseable: ${content.slice(0, 100)}`, judged: false }
  } catch (e) {
    return { score: 0, reasoning: `judge error: ${(e as Error).message}`, judged: false }
  }
}
```

- [ ] **Step 4: 编译验证**

Run: `cd eval && npx tsc -p tsconfig.json --noEmit 2>&1 | head -20`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add eval/metrics/
git commit -m "feat(eval): add three-layer metrics (has/syntax/quality)"
```

---

## Task 9: probes 层

**Files:**
- Create: `eval/probes/context.ts`
- Create: `eval/probes/intent.ts`
- Create: `eval/probes/prompt.ts`
- Create: `eval/probes/completion.ts`

**Interfaces:**
- Produces: `ContextProbeResult`/`IntentProbeResult`/`PromptProbeResult`/`CompletionProbeResult` + 对应 probe 函数。chain/runner 消费。

- [ ] **Step 1: 写 probes/context.ts**

```ts
import { ContextIR } from "../adapters/types"

export interface ContextProbeResult {
  chunkCount: number
  tokenEstimate: number
}

export function probeContext(context: ContextIR): ContextProbeResult {
  return {
    chunkCount: context.chunks.length,
    tokenEstimate: context.tokenEstimate
  }
}
```

- [ ] **Step 2: 写 probes/intent.ts**

```ts
import { IntentResult } from "../adapters/types"

export interface IntentProbeResult {
  intent: string
  confidence: number
}

export function probeIntent(intent: IntentResult): IntentProbeResult {
  return { intent: intent.intent, confidence: intent.confidence }
}
```

- [ ] **Step 3: 写 probes/prompt.ts**

```ts
const FIM_TOKENS = ["<｜fim begin｜>", "<｜fim hole｜>", "<｜fim end｜>"]

export interface PromptProbeResult {
  length: number
  tokenEstimate: number
  hasFimTokens: boolean
}

export function probePrompt(prompt: string): PromptProbeResult {
  return {
    length: prompt.length,
    tokenEstimate: Math.ceil(prompt.length / 4),
    hasFimTokens: FIM_TOKENS.some((t) => prompt.includes(t))
  }
}
```

- [ ] **Step 4: 写 probes/completion.ts**

```ts
import { Layer1Result, Layer2Result, Layer3Result, evalLayer1, evalLayer2, evalLayer3 } from "../metrics"
import { EvalConfig } from "../config"

export interface CompletionProbeResult {
  layer1: Layer1Result
  layer2: Layer2Result
  layer3: Layer3Result
}

export async function probeCompletion(
  completionText: string,
  modelError: string | undefined,
  latencyMs: number,
  prefix: string,
  suffix: string,
  filePath: string,
  languageId: string,
  config: EvalConfig
): Promise<CompletionProbeResult> {
  const layer1 = evalLayer1(completionText, modelError, latencyMs)
  const layer2 = await evalLayer2(prefix, completionText, suffix, filePath, languageId)
  const layer3 = await evalLayer3(prefix, completionText, suffix, config.judge)
  return { layer1, layer2, layer3 }
}
```

> 注意：`Layer1Result`/`Layer2Result`/`Layer3Result`/`evalLayer1/2/3` 需从 metrics 的 index 导出。下个 Step 加 `eval/metrics/index.ts`。

- [ ] **Step 5: 写 metrics/index.ts 聚合导出**

创建 `eval/metrics/index.ts`：

```ts
export * from "./layer1_has"
export * from "./layer2_syntax"
export * from "./layer3_quality"
```

- [ ] **Step 6: 编译验证**

Run: `cd eval && npx tsc -p tsconfig.json --noEmit 2>&1 | head -20`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add eval/probes/ eval/metrics/index.ts
git commit -m "feat(eval): add probes (context/intent/prompt/completion)"
```

---

## Task 10: runner.ts + 报告 + 端到端跑通

**Files:**
- Create: `eval/runner.ts`

**Interfaces:**
- Consumes: `runChain`/`loadSamples`/`loadConfig`/`NoopContextCollector`/`NoopIntentDetector`/各 probe。
- Produces: 可执行的 `node out/eval/runner.js`，输出 `eval/reports/<timestamp>.json` + `.md`。

- [ ] **Step 1: 写 runner.ts**

创建 `eval/runner.ts`：

```ts
import * as fs from "fs"
import * as path from "path"

import { NoopContextCollector } from "./adapters/context/noop"
import { NoopIntentDetector } from "./adapters/intent/noop"
import { AdapterMatrix } from "./adapters/types"
import { runChain } from "./chain"
import { loadConfig } from "./config"
import { loadSamples } from "./datasets/loader"
import { probeCompletion, probeContext, probeIntent, probePrompt } from "./probes"

async function main() {
  const config = loadConfig()
  if (!config.deepseek.apiKey) {
    console.error("ERROR: DEEPSEEK_API_KEY env not set")
    process.exit(1)
  }

  const matrices: AdapterMatrix[] = [
    {
      label: "noop-noop",
      contextAdapter: NoopContextCollector,
      intentAdapter: NoopIntentDetector
    }
  ]

  const samples = loadSamples(config.dataset)
  console.log(`loaded ${samples.length} samples, ${matrices.length} matrices`)

  const results: any[] = []
  for (const sample of samples) {
    for (const matrix of matrices) {
      process.stdout.write(`  ${sample.id} [${matrix.label}]... `)
      try {
        const chainResult = await runChain(sample, matrix, config)
        const completion = chainResult.artifacts.completion
        const completionProbe = await probeCompletion(
          completion.text,
          chainResult.artifacts.model.error,
          chainResult.artifacts.model.latencyMs,
          chainResult.artifacts.prefixSuffix.prefix,
          chainResult.artifacts.prefixSuffix.suffix,
          sample.filePath,
          sample.languageId,
          config
        )
        results.push({
          sampleId: sample.id,
          matrixLabel: matrix.label,
          contextProbe: probeContext(chainResult.artifacts.context),
          intentProbe: probeIntent(chainResult.artifacts.intent),
          promptProbe: probePrompt(chainResult.artifacts.prompt.prompt),
          completionProbe
        })
        console.log(
          `L1=${completionProbe.layer1.hasCompletion ? "✓" : "✗"} ` +
          `L2=${completionProbe.layer2.syntaxValid ? "✓" : "✗"} ` +
          `L3=${completionProbe.layer3.judged ? completionProbe.layer3.score : "skip"}`
        )
      } catch (e) {
        console.log(`FAIL: ${(e as Error).message}`)
        results.push({ sampleId: sample.id, matrixLabel: matrix.label, error: (e as Error).message })
      }
    }
  }

  // 聚合报告
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const reportDir = path.join(__dirname, "..", "reports")
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })

  const summary = matrices.map((m) => {
    const matrixResults = results.filter((r) => r.matrixLabel === m.label && !r.error)
    const total = matrixResults.length || 1
    const l1Pass = matrixResults.filter((r) => r.completionProbe?.layer1.hasCompletion).length
    const l2Pass = matrixResults.filter((r) => r.completionProbe?.layer2.syntaxValid).length
    const judged = matrixResults.filter((r) => r.completionProbe?.layer3.judged)
    const l3Avg = judged.length
      ? judged.reduce((s, r) => s + r.completionProbe.layer3.score, 0) / judged.length
      : 0
    const latencies = matrixResults.map((r) => r.completionProbe?.layer1.latencyMs || 0)
    const avgLatency = latencies.reduce((s, l) => s + l, 0) / total
    return {
      matrix: m.label,
      l1Rate: `${Math.round((l1Pass / total) * 100)}%`,
      l2Rate: `${Math.round((l2Pass / total) * 100)}%`,
      l3Avg: l3Avg.toFixed(1),
      avgLatencyMs: Math.round(avgLatency),
      samples: matrixResults.length
    }
  })

  // JSON
  fs.writeFileSync(
    path.join(reportDir, `${timestamp}.json`),
    JSON.stringify({ timestamp, results, summary }, null, 2)
  )

  // Markdown
  const md = [
    `# Eval Report ${timestamp}`,
    ``,
    `| matrix | L1通过率 | L2通过率 | L3均分 | 平均延迟 | 样本数 |`,
    `|--------|---------|---------|--------|---------|--------|`,
    ...summary.map((s) =>
      `| ${s.matrix} | ${s.l1Rate} | ${s.l2Rate} | ${s.l3Avg} | ${s.avgLatencyMs}ms | ${s.samples} |`
    )
  ].join("\n")
  fs.writeFileSync(path.join(reportDir, `${timestamp}.md`), md)

  console.log(`\nreport: ${path.join(reportDir, `${timestamp}.md`)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

> 注意：`new Date()` 在 eval 运行时（普通 Node 进程）可用——这不是 workflow 脚本环境，Date 限制不适用。

- [ ] **Step 2: 编译 + copy wasm**

Run: `cd eval && npm run build`
Expected: build.mjs copy wasm 成功 + tsc 编译成功，无错误。

- [ ] **Step 3: 端到端跑通（需 DEEPSEEK_API_KEY）**

Run: `cd eval && DEEPSEEK_API_KEY=<your-key> EVAL_DATASET=synthetic node out/eval/runner.js`
Expected: 跑完 5 个合成用例，输出每个的 L1/L2/L3 状态，生成 `eval/reports/<timestamp>.md` 报告表。

> 若无 DEEPSEEK_API_KEY，此步无法跑——可先只验证编译通过（Step 2），实跑等有 key 时做。

- [ ] **Step 4: 验证报告内容**

Run: `cat eval/reports/*.md`
Expected: 看到 Markdown 表格，noop-noop 行有 L1/L2/L3 数据。

- [ ] **Step 5: Commit**

```bash
git add eval/runner.ts
git commit -m "feat(eval): add runner with report generation, end-to-end pipeline"
```

---

## Task 11: 文档 + .gitignore

**Files:**
- Create: `eval/README.md`
- Modify: `.gitignore`

- [ ] **Step 1: 写 eval/README.md**

```markdown
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

见 `docs/2026-07-16-eval-framework-design.md`。

- `chain.ts` — A→G 全链路编排
- `adapters/` — 可换组件（第一版 Noop，后续 graphify/codegraph 并入）
- `probes/` — 逐环中间产物探针
- `metrics/` — 三层指标（has/syntax/quality）
- `runner.ts` — 样本 × 矩阵 × 报告

## 加新 adapter

1. 在 `adapters/context/` 或 `adapters/intent/` 新建实现，满足 `ContextAdapter`/`IntentAdapter` 接口
2. 在 `runner.ts` 的 `matrices` 数组加一项
3. 跑 `npm run eval`，报告里横向对比
```

- [ ] **Step 2: 更新 .gitignore**

在 FIM 根 `.gitignore` 加 eval 的编译产物和报告：

```
eval/out/
eval/reports/
```

- [ ] **Step 3: Commit**

```bash
git add eval/README.md .gitignore
git commit -m "docs(eval): add README + gitignore for eval outputs"
```

---

## Self-Review 已执行

**Spec coverage:**
- §1 目标原则 → 全 plan 贯穿（单一真相源 Task 2/7、基线干净 Task 4、不编造 Task 5）
- §2 决策 18 项 → 全覆盖
- §3 模块边界 → Task 3-10 各文件
- §4 数据流 + 中间产物 → Task 4（adapters 类型）、Task 7（chain artifacts）
- §5.1 stub → Task 3 Step 3
- §5.2 源码复用映射 → Task 7 import
- §5.3 截断抽取 → Task 2
- §5.4 react 清理 → Task 1
- §5.5 wasm 路径 → Task 3 Step 4（build.mjs copy）
- §5.6 config → Task 6
- §6 metrics + probe → Task 8 + Task 9
- §7 runner + 报告 → Task 10
- §8 错误处理 → Task 7（try/catch AST/model）、Task 10（单样本失败不阻塞）
- §9 YAGNI → 未实现 graphify/codegraph/规则意图/录制/Pass-to-Run，符合
- §10 后续演进 → 不在 plan 范围（plan 只做第一版）

**Placeholder scan:** 无 TBD/TODO，每步有真实代码。Task 7 Step 2 的"简化方案"是明确的设计决策非 placeholder。

**Type consistency:** `TruncateArgs`（Task 2）↔ chain.ts 调用（Task 7）字段一致；`ContextIR`/`IntentResult`（Task 4）↔ chain artifacts（Task 7）一致；`Layer1/2/3Result`（Task 8）↔ probe（Task 9）↔ runner（Task 10）一致。
