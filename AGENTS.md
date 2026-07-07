# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## TOP RULES

- WHEN WRITE PLAN AND SPEC DONT USE `superpowers/` DIRECT YOU MUST USE `DOCS/` IS OK

## Project Overview

**FIM** is a locally-hosted AI code completion and chat VS Code extension. The repo directory is named "FIM" (Fill-in-the-Middle). It supports 15+ AI providers (Ollama, OpenAI, Anthropic, Mistral, Groq, Gemini, etc.) for inline code completions and chat with RAG.

## Commands

```bash
npm run build            # esbuild dual bundle (extension + webview)
npm run watch            # esbuild watch mode (live reload)
npm run lint              # eslint src
npm run lint:fix          # eslint src --fix
npm run build-tests       # tsc compile tests to out/
npm test                  # Mocha extension tests (requires compiled tests + extension)
npm run vscode:package    # vsce package → .vsix
```

Run a single test: compile tests first (`npm run build-tests`), then edit `src/test/suite/index.ts` to export only the target suite.

## Architecture

### Dual-Bundle Build (`scripts/build.mjs`)

Two independent esbuild bundles built in parallel:
- **Extension bundle**: `src/index.ts` → `out/index.js` (Node.js, CJS, vscode externalized)
- **Webview bundle**: `src/webview/index.tsx` → `out/sidebar.js` (browser, IIFE, vscode externalized)

Both bundles share TypeScript types from `src/common/` but are otherwise isolated. Webview assets (WASM, ONNX, tree-sitter) are copied to `out/` during build.

### Layer Structure

```
src/
├── index.ts              # Extension entry: activate() wires everything together
├── common/               # Shared types, constants, interfaces (no VS Code deps)
│   ├── constants/        # Event names, commands, provider types, storage keys
│   ├── languages.ts      # 30+ language defs (comment syntax, extensions)
│   └── types.ts          # All TypeScript interfaces
├── extension/            # Node.js side (VS Code Extension Host)
│   ├── base.ts           # Base class: config access, provider getters
│   ├── llm.ts            # Core LLM streaming fetch (SSE, generic)
│   ├── embeddings.ts     # LanceDB vector search (ingest, query)
│   ├── reranker.ts       # ONNX reranker for RAG results
│   ├── chat.ts           # Chat service: RAG context, streaming, conversation building
│   ├── fim-templates.ts  # FIM prompt templates per model family
│   ├── provider-manager.ts  # Provider CRUD (globalState or file-based)
│   ├── provider-options.ts  # Builds request bodies per provider type for FIM
│   ├── file-interaction.ts  # LRU cache tracking file relevance scores
│   └── providers/        # VS Code API providers
│       ├── base.ts       # BaseProvider: webview event dispatcher hub
│       ├── completion.ts # InlineCompletionItemProvider (FIM core)
│       ├── sidebar.ts    # WebviewViewProvider
│       └── panel.ts      # WebviewPanelProvider
└── webview/              # Browser side (React, runs in iframe)
    ├── main.tsx          # Tab router (chat, providers, settings, embeddings)
    ├── chat.tsx          # TipTap editor, mentions, file attachments
    ├── hooks/            # 16 React hooks (useModels, useProviders, etc.)
    └── assets/locales/   # i18next JSON files (13 locales)
```

### Core Data Flows

**FIM Completion**: `CompletionProvider.provideInlineCompletionItems()` → extract prefix/suffix → optional tree-sitter AST parse → gather file-interaction context → build FIM prompt (model-specific template) → stream via `llm()` → validate bracket balance/AST → return `InlineCompletionItem`

**RAG Chat**: `Chat` class → embed query via provider → LanceDB vector search → ONNX reranker → read top file contents → inject as context → stream to LLM

**Extension ↔ Webview**: All communication via `postMessage`/`onDidReceiveMessage` with typed `ClientMessage<T>` and `ServerMessage<T>`. Event names centralized in `src/common/constants/events.ts`. `BaseProvider` dispatches events by type string to handler methods.

### Provider System

Three provider slots: **FIM** (completion), **Chat**, **Embeddings**. Most providers are normalized to OpenAI-compatible format via `fluency.js`. FIM template format varies by model family (codellama, deepseek, codestral, qwen) — configured in `src/extension/fim-templates.ts` and `src/extension/provider-options.ts`.

### User Data

Templates at `~/.fim/templates/` (Handlebars `.hbs`). Embeddings DB at `~/.fim/embeddings/<workspace>` (LanceDB tables: `<name>-documents` and `<name>-file-paths`). Symmetry config at `~/.config/symmetry/provider.yaml`.

## Code Style

- Double quotes, no semicolons, no trailing commas, 2-space indent, LF line endings
- Import order: React → external packages → internal modules → relative imports → CSS (`simple-import-sort`)
- Format: Prettier (`.prettierrc`), Lint: ESLint (`.eslintrc.cjs`)
- TypeScript strict mode, ES2020 target, commonjs modules, react-jsx

## Key Dependencies

- `@lancedb/lancedb` — vector database for RAG (native Node addon)
- `onnxruntime-node` / `ort-wasm-simd.wasm` — reranker model inference
- `web-tree-sitter` — AST parsing for completion validation
- `fluency.js` (TokenJS) — OpenAI-compatible chat client
- `hyperswarm` — P2P networking (Symmetry feature)
- React 18 + TipTap — webview UI
