# @fim/code-intelligence

FIM code-intelligence service — the `GraphProvider` contract and a CodeGraph adapter that wraps `@colbymchenry/codegraph`. Part of the Phase 2 architecture spike.

## What lives here

| File | Role |
|------|------|
| `src/provider.ts` | `GraphProvider` interface and all supporting types (`GraphEvidence`, `ContextChunk`, `GraphSeed`, etc.) |
| `src/codegraph-adapter.ts` | `CodeGraphAdapter` — wraps `@colbymchenry/codegraph` behind the `GraphProvider` boundary |
| `src/indexer.ts` | `Indexer` — tracks per-workspace index state, phases, pending file changes |
| `src/lifecycle.ts` | `CodeIntelligenceLifecycle` — top-level init/sync/status/close manager with error recovery |
| `src/index.ts` | Barrel re-exports |

## Dependencies

- `@colbymchenry/codegraph` is an **optional peer dependency**. The adapter compiles and runs without it; all methods degrade gracefully (see below).

## Graceful degradation

Every public method is safe to call when CodeGraph is not installed:

| Scenario | Behavior |
|----------|----------|
| CodeGraph not installed / `require` fails | `status()` returns `{ state: "disabled" }`; `expand()` and `read()` return `[]` |
| Workspace not yet indexed | `init()` triggers a full index; `expand()` tries with available data |
| Index corruption | `refresh()` discards the bad instance, next access re-creates it |
| Missing workspace (wrong rootUri) | `status()` reports `{ state: "error", error: "..." }` |
| Timeout or vendor crash during `expand`/`read` | Returns `[]` — never throws |
| Service already closed | All methods return safe defaults (disabled / empty results) |

## .codegraph/ directory

CodeGraph stores its index in `<workspace-root>/.codegraph/`. This directory is created and managed entirely by the `@colbymchenry/codegraph` vendor library when `init()` is called.

### Contents

- Index database files (symbols, call graph, file metadata)
- Cached parse trees

### Disk usage

Disk usage varies with project size. Typical ranges observed:
- Small projects (<1k files): 5--20 MB
- Medium projects (1k--10k files): 20--100 MB
- Large projects (10k+ files): 100--500 MB

### .gitignore

Add `.codegraph/` to each workspace's `.gitignore`. The index is a local artifact and should **never** be committed to version control. If the workspace already has a global `.gitignore` that covers it, no per-workspace change is needed.

The FIM extension can optionally auto-append `.codegraph/` to `.gitignore` when first enabling the code intelligence feature, but this must be user-visible and reversible.

### Clean and rebuild

```bash
# Remove the index entirely
rm -rf .codegraph/

# Next expand() / init() call will rebuild automatically from scratch
```

To force a rebuild without deleting the directory:
```ts
// In the VS Code extension or a CLI tool
const lifecycle = getCodeIntelligenceLifecycle()
lifecycle.close()
lifecycle.reopen()
// Next init() will re-index
```

### Privacy

All code intelligence processing happens **locally** on the user's machine:
- `.codegraph/` is a local directory — no data leaves the filesystem
- The CodeGraph index contains symbol names, file paths, and call-graph edges from the workspace — none of this is transmitted over the network by the FIM extension
- FIM never sends `.codegraph/` contents to any LLM provider unless the user explicitly configures code context to be included in completion requests (governed by the provider config)
- No telemetry, no analytics, no usage data collection

## Interface design (GraphProvider)

```
GraphProvider
  ├── status(workspace)        → GraphStatus
  ├── refresh(request)         → GraphRefreshResult
  ├── expand(seed, budget)     → GraphEvidence[]
  └── read(symbolIds, budget)  → ContextChunk[]
```

`expand()` returns structured, traceable evidence (symbols, relations, file paths) — never raw prompt text. `read()` fetches the actual source code. The consumer (context assembler in `engine-ts`) decides how to combine them and respects token budgets.
