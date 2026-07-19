# FIM Overall Design ⭐ 当前 MVP 权威设计文档

> **本文档是当前 MVP 阶段的权威设计文档。** 所有架构决策、交互模型、MVP 范围以本文档为准。
>
> 另见：
> - [`PD.md`](./PD.md) — 未来跨编辑器架构参考（Client-Server、多 provider）
> - [`PD-supplement.md`](./PD-supplement.md) — 技术难点清单与补充
> - [`providers.md`](./providers.md) — Provider 配置说明
> - [`config-ux-design.md`](./config-ux-design.md) — Settings UI 设计

## 1. Product Positioning

FIM is a manual-first, planner-driven code completion environment.

It is not a Copilot-style always-on autocomplete tool, and it is not a Chat IDE
or Agent IDE. Its core purpose is to preserve the developer as the author:
the user explicitly summons AI, FIM understands the current intent, gathers the
right project context, and then offers reviewable inline completion inside the
currently focused file.

The desired experience is closer to a patient teacher than a fast interrupter.
FIM should stay quiet while the user is thinking, and only appear when the user
asks for help.

## 2. Core Principles

- Human authority: AI must not take over the project or silently make decisions
  that change code.
- Quiet by default: manual triggering is the default. Automatic completion is an
  optional mode, not the product's center.
- Understand before completing: a manual completion request first goes through
  intent understanding and context selection.
- Current-file write boundary: FIM may read and reason across files, but it may
  only write to the active editor file.
- Reviewable output: generated code must be small enough to inspect. MVP accepts
  or rejects the whole inline suggestion; line-by-line acceptance is a future
  target.
- Local and privacy first: project memory requires workspace-level user consent.
  Remote embedding or reranking requires explicit confirmation that code
  snippets may be sent.

## 3. Interaction Model

The primary interaction is inline completion:

```text
User writes code, comments, or a function skeleton
  -> user manually triggers FIM
  -> FIM plans the completion and builds a contextual request
  -> FIM shows inline ghost text in the current file
  -> user accepts or ignores the suggestion
```

The code-side conversation panel is a secondary interaction. It is opened only
when the user wants to ask why a suggestion was made, discuss design choices, or
get guidance around the current code. This panel plays the role of a teacher:
it can explain, compare options, surface risks, and point to related files.

The conversation panel does not directly modify code and does not produce
applyable multi-file diffs. Code writing remains the job of inline completion,
with the user deciding whether to accept the suggestion.

## 4. Architecture Model

FIM is organized into four conceptual layers.

### 4.1 Interaction Layer

The interaction layer owns editor-facing behavior:

- Manual trigger commands and keybindings.
- Inline ghost text rendering.
- Optional automatic completion mode.
- Code-side teacher conversation panel.
- Settings and model profile UI.

This layer is thin. It should not contain heavy project understanding,
retrieval, or model-specific prompt logic.

### 4.2 Planning Layer

The planning layer handles manual completion requests. It receives the current
editor state plus available project context, then determines:

- What the user is likely trying to do.
- What completion scope is appropriate for the current cursor position.
- Which context sources are useful for this request.
- What constraints the completion writer must follow.

The planner may use a chat-capable model role because the product is not
optimized for millisecond-level automatic suggestions. In the default manual
flow, spending more effort to understand intent is acceptable.

The planner does not write code into the editor.

### 4.3 Context Layer

The context layer is plugin-based. FIM should not equate project understanding
with embedding alone. Context can come from multiple sources:

- Current file prefix and suffix.
- Current file path, language, and repo identity.
- AST or tree-sitter structure.
- LSP symbols, definitions, references, and diagnostics.
- Open files.
- Recently edited files.
- Import and dependency signals.
- Project memory.
- Embedding-based retrieval.
- Reranking over candidate context chunks.

Each context plugin is optional. If a plugin fails or is unavailable, completion
continues with the remaining context, and FIM gives a light status indication
instead of interrupting the user.

### 4.4 Model Layer

The model layer is role-based. A model profile can provide multiple roles:

- Completion role: writes code through FIM completion.
- Chat role: supports planning, explanation, and teacher-style conversation.
- Embedding role: supports project memory retrieval when enabled.
- Rerank role: improves ordering of retrieved context when enabled.

These roles are not separate products in the UI. They are capabilities of a
single model profile.

## 5. Model Profile

The MVP default is a DeepSeek-compatible model profile.

The user configures one profile with:

- Base URL.
- API key.
- Role-specific model choices.
- Optional role-specific path overrides in advanced settings.

FIM fetches the upstream model list and lets the user choose models for the
completion, chat, embedding, and rerank roles. FIM does not require the upstream
service to declare exact role capabilities. The user remains responsible for
choosing working models, and FIM should provide test actions and clear failure
messages to reduce configuration mistakes.

The default paths follow DeepSeek conventions. Advanced settings can override
paths per role to route through proxies, company gateways, and self-hosted
OpenAI-compatible services; these are reserved gateway extension points rather
than current MVP capabilities — the MVP ships DeepSeek only.

The important distinction is:

- Completion writes code and uses FIM-style prefix/suffix completion.
- Chat understands intent and explains code, but does not directly write code.
- Embedding and rerank support project memory, but are optional.

## 6. Context And Project Memory

FIM's baseline context should work without project memory. Current file,
open files, recent edits, AST, and LSP information are all valid context sources.

Project memory is an enhancement:

- On first use in a workspace, FIM asks whether to enable project memory.
- If disabled, FIM still completes using lightweight context plugins.
- If enabled, FIM builds a local project index.
- If remote embedding or reranking is configured, FIM must explicitly confirm
  that code snippets may be sent to that remote service.
- The user can disable, clear, or rebuild project memory from settings.

Embedding and reranking are useful for deeper manual completions, but they are
not hard dependencies for code completion.

## 7. Write Boundaries

FIM may read, analyze, and reason over multiple files. It may also tell the user
that another file appears relevant or may need a matching change.

FIM may only write to the current active editor file. If another file needs to
be changed, the user must switch focus to that file and trigger FIM there.

FIM does not perform automatic multi-file diffs, command execution, test-fix
loops, commits, or agentic project edits as part of the core product.

## 8. MVP Scope

The MVP includes:

- Manual completion as the default interaction.
- Planner-driven completion for every manual trigger.
- DeepSeek-compatible model profile.
- Inline ghost text output.
- Current-file-only writes.
- Context plugins for current file, open files, recent edits, AST/tree-sitter,
  and LSP where available.
- Workspace consent flow for project memory.
- Optional embedding and rerank role configuration.
- Light degradation status when a context plugin is unavailable.

The MVP does not include:

- Automatic completion as the default behavior.
- Multi-file automatic modification.
- Agent command execution.
- Automatic testing or repair loops.
- Unconsented project indexing.
- Required embedding or reranking.
- Required code-side conversation panel implementation if it delays the core
  manual completion flow.

## 9. Future Direction

Future versions can add:

- Line-by-line acceptance.
- A code-side teacher panel for explanation and design discussion.
- A context transparency panel showing which files, symbols, and memory chunks
  influenced a completion.
- Stronger project memory.
- Better planning quality and role-specific prompt construction.
- Additional model profile presets without returning to fragmented provider
  management.
- A standalone FIM Engine Server for reuse by Zed, Neovim, JetBrains, and other
  editors.

## 10. Summary

FIM should be designed around manual, intentional code assistance. Its core loop
is not "AI predicts faster than the user can type." Its core loop is:

```text
User asks
  -> FIM understands intent
  -> FIM gathers relevant context
  -> FIM writes only in the current file
  -> user reviews and accepts
```

This keeps AI useful without outsourcing authorship.
