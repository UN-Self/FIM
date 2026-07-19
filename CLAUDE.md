# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## TOP RULES

- WHEN WRITE PLAN AND SPEC DONT USE `superpowers/` DIRECT YOU MUST USE `DOCS/` IS OK

## Project Overview

**FIM** is a locally-hosted, telemetry-free AI code completion VS Code extension. The repo directory is named "FIM" (Fill-in-the-Middle). It targets inline code completion only — chat and RAG have been deprecated. The current (and only) provider is **DeepSeek**; the architecture keeps a provider gateway (a `FimProvider` abstraction over a generic `llm()` streaming call, plus the provider-config entry point) so other providers can be added later through one extension point, rather than managed as fragmented forks.

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
├── extension.global.d.ts # Global ambient type declarations
├── common/               # Shared types, constants, interfaces (no VS Code deps)
│   ├── constants/        # Event names, commands, context keys, storage keys, UI/misc constants
│   ├── deepseek.ts       # DeepSeek provider defaults (id, base URL, model, API provider map)
│   ├── languages.ts      # Language defs (comment syntax, extensions)
│   ├── logger.ts         # Logger singleton
│   ├── models.ts         # Model metadata
│   ├── provider-url.ts   # Provider base-URL build/parse helpers
│   ├── settings-schema.ts # Setting definitions & schema (types, groups, options)
│   └── types.ts          # All TypeScript interfaces
├── extension/            # Node.js side (VS Code Extension Host)
│   ├── base.ts           # Base class: config access, provider getters
│   ├── llm.ts            # Core LLM streaming fetch (SSE, generic)
│   ├── fim-templates.ts  # FIM prompt templates per model family
│   ├── cache.ts          # LRUCache — completion result cache
│   ├── completion-formatter.ts # CompletionFormatter — shapes raw stream output
│   ├── postprocessor.ts  # truncateCompletion — bracket/AST validation & truncation
│   ├── parser.ts         # tree-sitter parser factory & node lookup
│   ├── tree.ts           # FileTreeProvider — sidebar file-tree view
│   ├── context.ts        # VS Code ExtensionContext get/set wrapper
│   ├── config-messages.ts # Messages emitted on config updates
│   ├── file-interaction.ts # LRU cache tracking file relevance scores
│   ├── utils.ts          # Misc helpers (debounce, selection, language, brackets)
│   └── providers/        # VS Code API providers
│       ├── base.ts       # BaseProvider: webview event dispatcher hub
│       ├── completion.ts # InlineCompletionItemProvider (FIM core)
│       └── sidebar.ts    # WebviewViewProvider
└── webview/              # Browser side (React, runs in iframe)
    ├── index.tsx         # Webview entry
    ├── main.tsx          # Tab router (providers, settings)
    ├── providers.tsx     # Provider management UI
    ├── provider-form.ts  # DeepSeek provider form state & builder
    ├── settings.tsx      # Settings UI
    ├── model-select.tsx  # Model selector component
    ├── i18n.ts           # i18next init (en, zh-CN)
    ├── icons.tsx         # SVG icon components
    ├── utils.ts          # Webview-side helpers
    ├── hooks/            # React hooks (useFimConfig, useProviders, useLocale, useStorageContext, ...)
    ├── settings/         # Settings UI building blocks (AccordionSection, MasterBar, SettingRow, Toggle, ...)
    ├── styles/           # Webview stylesheets
    └── assets/locales/   # i18next JSON files (en, zh-CN)
```

### Core Data Flows

**FIM Completion**: `CompletionProvider.provideInlineCompletionItems()` → extract prefix/suffix → optional tree-sitter AST parse → gather file-interaction context → build FIM prompt (DeepSeek family template) → stream via `llm()` → validate bracket balance/AST → return `InlineCompletionItem`

**RAG Chat** *(deprecated — chat/RAG retired in the `feat/deepseek-only-unification` effort; only completion remains active)*: `Chat` class → embed query via provider → LanceDB vector search → ONNX reranker → read top file contents → inject as context → stream to LLM

**Extension ↔ Webview**: All communication via `postMessage`/`onDidReceiveMessage` with typed `ClientMessage<T>` and `ServerMessage<T>`. Event names centralized in `src/common/constants/events.ts`. `BaseProvider` dispatches events by type string to handler methods.

### Provider System

The provider surface is collapsed to a single active provider: **DeepSeek**, used for completion. (The Chat and Embeddings slots are deprecated — see the `feat/deepseek-only-unification` branch; only completion ships.) The gateway is retained: a `FimProvider` abstraction (defined in `src/common/deepseek.ts`) plus a provider-config entry point (the DeepSeek form in `src/webview/providers.tsx` + `provider-form.ts`) sit in front of the generic `llm()` streaming call (`src/extension/llm.ts`); provider state is read via `src/extension/base.ts` (`getFimProvider`), so additional providers can be added through one extension point later. The active FIM template is the DeepSeek family template (split-only), configured in `src/extension/fim-templates.ts`.

### User Data

No filesystem user data. Provider config and the DeepSeek API key live in VS Code storage (globalState / secret storage); completions are cached in-memory (LRU). The legacy `~/.fim/templates/` (Handlebars), `~/.fim/embeddings/` (LanceDB), and `~/.config/symmetry/` paths are obsolete — those features were removed.

## Code Style

- Double quotes, no semicolons, no trailing commas, 2-space indent, LF line endings
- Import order: React → external packages → internal modules → relative imports → CSS (`simple-import-sort`)
- Format: Prettier (`.prettierrc`), Lint: ESLint (`.eslintrc.cjs`)
- TypeScript strict mode, ES2020 target, commonjs modules, react-jsx

## Key Dependencies

- `fluency.js` (TokenJS) — DeepSeek client (OpenAI-compatible transport); the completion client
- `web-tree-sitter` + `tree-sitter-wasms` — AST parsing for completion validation
- React 18 + `@vscode/webview-ui-toolkit` — webview UI
- `async-lock` (completion serialization), `ignore` (.gitignore-aware filtering), `fastest-levenshtein` / `string_score` (fuzzy matching)
