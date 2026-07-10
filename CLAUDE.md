# CLAUDE.md — FIM Project Guide

## TOP RULES
- **Write plans/specs into `docs/plans/`** (not `superpowers/` or root)
- **Requirement/design docs go into `docs/requirements/`**
- Never commit secrets or test cache artifacts

## Project Overview
**FIM** (Fill-in-the-Middle) is a locally-hosted AI code completion VS Code extension, consolidated to **DeepSeek FIM** only. Stripped of chat, RAG, embeddings, and multi-provider support. A lightweight, focused code completion tool.

## Commands
```bash
npm run build            # esbuild dual bundle (extension + webview)
npm run watch            # esbuild watch mode
npm run lint              # eslint src
npm run lint:fix          # eslint src --fix
npm run vscode:package    # vsce package → .vsix
```
Tests have been removed (no `npm test` / `npm run build-tests`).

## Architecture

### Dual-Bundle Build (`scripts/build.mjs`)
- **Extension bundle**: `src/index.ts` → `out/index.js` (Node.js, CJS)
- **Webview bundle**: `src/webview/index.tsx` → `out/sidebar.js` (browser, IIFE)

### Layer Structure
```
src/
├── index.ts                         # Entry: activate() wires completion + sidebar
├── common/                          # Shared types (no VS Code deps)
│   ├── constants/                   # commands, context, events, misc, models, storage, ui
│   ├── deepseek.ts                  # DeepSeek FIM provider config
│   ├── languages.ts                 # Language definitions
│   ├── provider-url.ts             # URL normalization
│   ├── settings-schema.ts          # Settings schema
│   └── types.ts                    # TypeScript interfaces
├── extension/                       # Extension Host side
│   ├── base.ts                     # Config access, provider getters
│   ├── cache.ts                    # Completion caching
│   ├── completion-formatter.ts     # Formats completion output
│   ├── config-messages.ts          # Config validation messages
│   ├── context.ts                  # VS Code context setter
│   ├── file-interaction.ts         # LRU file relevance tracking
│   ├── fim-templates.ts            # FIM prompt templates (DeepSeek)
│   ├── llm.ts                      # SSE streaming fetch
│   ├── parser.ts                   # AST parser helpers
│   ├── tree.ts                     # Tree-sitter wrapper
│   ├── utils.ts                    # Utility functions
│   └── providers/
│       ├── base.ts                 # BaseProvider: webview event hub
│       ├── completion.ts           # InlineCompletionItemProvider (FIM core)
│       └── sidebar.ts              # WebviewViewProvider
└── webview/                         # Browser side (React)
    ├── index.tsx                   # Entry
    ├── main.tsx                    # Tab router (providers, settings)
    ├── settings.tsx                # Settings accordion page
    ├── providers.tsx               # Provider management page
    ├── provider-form.ts            # Provider CRUD form
    ├── model-select.tsx            # Model selector
    ├── icons.tsx                   # Icon components
    ├── hooks.ts / hooks/*          # React hooks
    ├── i18n.ts                     # i18n (en, zh-CN)
    ├── utils.ts
    └── styles/                     # CSS modules
```

### Core Data Flow
**FIM Completion**: `CompletionProvider.provideInlineCompletionItems()` → extract prefix/suffix → tree-sitter AST parse → file-interaction context → build FIM prompt (DeepSeek template) → stream via `llm()` → validate → return `InlineCompletionItem`

**Extension ↔ Webview**: `postMessage`/`onDidReceiveMessage` with typed messages. Events in `src/common/constants/events.ts`.

### Docs Structure
```
docs/
├── requirements/          # Design docs, specs, product requirements
│   ├── fim-overall-design.md
│   ├── PD.md / PD-supplement.md
│   ├── logo-design-brief.md
│   ├── rename-to-fim-design.md
│   ├── settings-first-redesign-spec.md
│   ├── config-ux-design.md
│   └── providers.md / CODE_OF_CONDUCT.md / 灵魂不能外包.md
└── plans/                 # Implementation plans, execution records
    ├── settings-first-redesign-plan.md
    ├── config-ux-implementation-plan.md
    └── codebase-pruning-guide.md
```

## Code Style
- Double quotes, no semicolons, no trailing commas, 2-space indent, LF
- Import order: React → external → internal → relative → CSS
- TypeScript strict, ES2020, commonjs, react-jsx
