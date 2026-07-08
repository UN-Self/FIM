<p align="center">
  <img src="assets/icon.png" width="120" alt="FIM" />
</p>

<h1 align="center">FIM</h1>

<p align="center"><strong>Stop guessing. Start conducting.</strong></p>

<p align="center">A locally-hosted, telemetry-free inline completion engine.<br>You stay the author — it hands you the next brick.</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## The bet

Every AI coding tool today ships with the same bet baked in: that you're on the way out. They race to flash a suggestion before you finish typing. They dump whole files in your lap and call it productivity. They nudge, autocomplete, and auto-merge their way toward a future where you're not really needed.

FIM makes the opposite bet — that you're not going anywhere.

Its job isn't to think for you. It's to hand you the next brick the instant you've decided where the wall goes.

## What FIM is not

Not a chat. Not an agent. Not a sidebar that colonizes your editor. Not a one-shot deal that scaffolds an entire app and walks away.

FIM is, and only is, the middle — the code that fills in *after* you've written the comment, *after* you've drawn the skeleton of the function. You define both ends. It fills what's between. Hence the name: **Fill-in-the-Middle**.

## Three commitments

### Silence, until summoned

In flow, FIM is invisible. No popups, no nudges, no ghost text hijacking your next thought before it's fully formed. Tools that fire on every keystroke aren't helping you think — they're racing you for the next word.

Press `Alt+\` when you want FIM, and only then. It surfaces one suggestion, quietly, and waits. A tool respects you by knowing when to shut up.

### Your intent, its implementation

Comments are the honest contract between you and the machine. When you write `// binary search; return the index, or -1`, the design is already done. The rest is translation.

FIM honors that. You write the comment, or the signature, or the first branch — then FIM fills the body. One function at a time. Never the whole file. The middle gets filled in; you stay the author of both ends.

Retrieval knowledge — the library call you can almost remember, the parameter order you'd otherwise look up — is FIM's job, not yours. You state the intent (`deduplicate_and_sort(items)`); FIM resolves it to the right call in your project. Your brain stays on *what*, not on *which overload*.

### Your machine, your model

No telemetry. No cloud analytics. No usage data quietly phoning home. Nothing leaves your laptop unless you point FIM at a provider yourself.

Bring your own model. Run a local one through [Ollama](https://ollama.com), or drop in any OpenAI-compatible API — OpenAI, Anthropic, Mistral, Groq, Gemini, your own vLLM. The key, the endpoint, and the off switch are all yours. FIM is a host, not a tenant.

## Completion, not chat

Chat hands you a whole codebase at once. You can't review it. You don't dare touch it. So you ask it to change things — and it grows, and it rots, and three weeks later you're debugging code nobody understands, least of all you.

Completion forces a different rhythm. One function. One decision. One brick at a time. That's how you actually think — break the big thing into small things, solve each one, and own every choice along the way.

FIM bets on completion because completion keeps you in the loop *by design*. There is no autopilot to fall asleep on.

## The conductor

You don't want a robot that builds the house for you. You want someone who hands you bricks while you lay the wall.

FIM is the musician. You're the conductor.

> Stop guessing. Start conducting.

## Try it

FIM is a VS Code extension. Three steps.

1. Install the `.vsix` from [releases](https://github.com/UN-Self/FIM/releases): `code --install-extension fim-*.vsix`
2. Point it at a model — local Ollama, or any OpenAI-compatible endpoint.
3. Write a comment. Draw a skeleton. Press `Alt+\`.

Why it works this way — the orchestration, the FIM templates, the local-first architecture — lives in [`docs/`](./docs):

- [`docs/PD.md`](./docs/PD.md) — product & technical design (the long version of the bet)
- [`docs/providers.md`](./docs/providers.md) — supported providers

## License

[MIT](./LICENSE). Self-hosted, self-owned. The way it should be.
