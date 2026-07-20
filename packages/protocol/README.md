# @fim/protocol

JSON-serializable protocol types for the FIM completion engine. Zero runtime dependencies.

## Purpose

This package defines every type that crosses the boundary between the VS Code adapter and the engine core. It is the single source of truth for:

- Completion requests, responses, and streaming events
- Graph provider contracts (CodeGraph and future code-intelligence backends)
- Intent planner protocol types
- Feedback event types
- Canonical error codes

## Constraints

- **Pure types and interfaces only** — no runtime implementations, no `vscode` import, no Node.js APIs
- **Zero runtime dependencies** — the `package.json` lists only `typescript` as a devDependency
- **JSON-serialisable** — every type can be serialised across process / RPC boundaries

## Build

```bash
npm run build   # tsc → dist/
```

## Consumers

- `@fim/engine-ts` — the TypeScript engine core
- `apps/vscode-extension` — the VS Code adapter (future)
- `services/code-intelligence` — CodeGraph adapter (future)
- `eval` — evaluation harness
