# @fim/engine-ts

FIM completion engine core — pure TypeScript + Node.js. Zero VS Code dependencies.

## Purpose

This service is the "local engine" from the architecture plan. It contains all completion logic extracted from the current monolithic `CompletionProvider` — prompt building, streaming, postprocessing, and caching — but with **no** `vscode` imports. The VS Code adapter (in `apps/vscode-extension/`) is responsible for translating editor state into the protocol types defined in `@fim/protocol`.

## Structure

```
src/
  index.ts                     Barrel export
  types.ts                     Engine-private interfaces (PrefixSuffix, CursorPosition)
  utils.ts                     Pure utility functions (shared from webview)
  cache.ts                     LRU completion cache
  completion/
    orchestrator.ts            Central entry point: wiring, dedup, lock, timeout
  context/
    current-file.ts            Prefix/suffix extraction (pure, no vscode)
  prompt/
    builder.ts                 Fixed-skeleton FIM prompt builder
  model/
    deepseek-fim.ts            DeepSeek streaming client (fetch + SSE parsing)
  postprocess/
    processor.ts               Truncation + formatting pipeline
```

## Constraints

- **NO** `vscode` import anywhere in this package
- **NO** filesystem access (no `fs`, no `path` to real files)
- **NO** web-tree-sitter (AST parsing is an adapter concern)
- Only depends on `@fim/protocol` (types), `async-lock`, and `fastest-levenshtein`

## Build

```bash
npm run build   # tsc → dist/
```

## Usage (from the VS Code adapter)

```ts
import { CompletionOrchestrator } from "@fim/engine-ts"

const engine = new CompletionOrchestrator({ debounceWait: 300 })

const result = await engine.complete(
  {
    requestId: "req-1",
    workspace: { id: "ws1", rootUri: "/path/to/project" },
    document: { uri: "file:///src/app.ts", languageId: "typescript", text: "...", version: 1 },
    cursor: { line: 42, character: 10 },
    mode: "automatic",
    config: { /* CompletionConfig */ },
    provider: { /* DeepSeekProviderConfig */ }
  },
  (event) => {
    if (event.type === "chunk") renderGhostText(event.text)
  }
)
```
