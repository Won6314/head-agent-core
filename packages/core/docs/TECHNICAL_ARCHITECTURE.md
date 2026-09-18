# HEAD Agent Core Technical Architecture

## Scope

HEAD Agent Core is the product-neutral skeleton of a HEAD-led agent system. It supplies four things and nothing product-specific:

1. the coordinating principles a HEAD role always loads;
2. the advertised work skills and the procedures they select;
3. the worker role cores;
4. the runtime meaning that Claude Code and OpenCode share — session recovery, semantic Runs, compaction policy, context composition — with one thin adapter per runtime.

A project attaches Core by symlinking skills, importing runtime modules, and rendering `HEAD_CORE.md` into its own prompts. Core never reaches into a project by path, and the tree carries no product name, absolute path, or project session path (`packages/core/purity.test.mjs`).

The install-shaped platform (host daemon, project initializer, onboarding) that earlier versions shipped is isolated under `packages/_platform/` and excluded from the release. It is not part of the current architecture.

## Packages and ownership

```text
packages/
  core/
    head/HEAD_CORE.md          always-loaded principles — the only copy
    docs/  theory/             this documentation and its background
  skills/                      start-job · product-planning · delegate-once · plan-run · agent-reply
  procedures/                  condition-selected branches a skill links to
  agents/                      coder · developer · reviewer role cores
  head-runtime/
    shared/                    runtime-neutral meaning, one module each
    claude/                    Claude hook adapters
    opencode/                  OpenCode plugin entrypoints
  opencode-runtime/            re-export shims at the old paths (no implementation)
  _platform/                   isolated, not released
```

Ownership rule: a meaning lives in exactly one place. `shared/` owns what to restore, what to summarize, which decision set a Run uses, and where state lives. Adapters own only the runtime API binding — reading a hook's stdin, registering a plugin event — and call `shared/`. An adapter that carries a policy constant is a defect.

## Shared runtime (`head-runtime/shared/`)

| Module | Meaning |
|---|---|
| `session-lifecycle.mjs` | Session identity, active Job, Run recovery payload (`projectSessionRecovery`), and `parseHistoryEntries` — the single parser for `history.md` checkpoint headings (`## <ISO>` with optional `run:<id>`) |
| `semantic-run.mjs` | Pointer-only Run reader (`run.json` → `run.md`, latest checkpoint, current contracts) and the checkpoint decision set: `START CONTINUE LOCAL_CORRECTION PLAN_CHANGE_REQUIRED USER_DECISION STOPPED DONE FAILED` |
| `session-transitions.mjs` | Session ↔ Run mode transitions used by both the OpenCode `head_session` tool and the Claude `head-session` MCP adapter |
| `checkpoint-ledger.mjs` | Legacy ledger records; reads `REVISE` as `LOCAL_CORRECTION`, writes only the semantic set |
| `compact-policy.mjs` | Compaction summary policy: pointer-only when no real user turn followed the latest checkpoint, a short factual summary of the checkpoint gap otherwise, one sentence of current work when the checkpoint cannot be resolved; plus the user-turn restoration budget. Runtime-neutral inputs, `{ runtime }` selects the wrapping |
| `context-composition.mjs` | Base files, the HEAD prompt (`buildHeadPrompt`), the agent state directory (`<agent dir>/state/`), session records, and size-rotated JSONL logs |
| `work-items.mjs`, `herdr-runtime.cjs` | Durable work items; Herdr caller validation (Herdr is the host adapter, not a product) |

## Runtime adapters

| Concern | Claude (`head-runtime/claude/`) | OpenCode (`head-runtime/opencode/`) |
|---|---|---|
| Recovery after start or compaction | `session-recovery.mjs` — CLI the project's SessionStart hook executes | `compact-recovery.mjs` — plugin, same `projectSessionRecovery` |
| Compaction summary instruction | `compaction-prompt.mjs` — PreCompact hook reading the transcript JSONL | inside `compact-recovery.mjs` |
| Restoring compacted user turns | `compact-user-turns.mjs` — SessionStart(compact) hook | `compact-recovery.mjs` with `state/compact-spans/` |
| Session mode tool | project MCP adapter over `session-transitions` | `head-session.mjs` plugin tool `head_session` |
| Core first in the system prompt | project renders `HEAD_CORE.md` into `--system-prompt-file` | `head-core-first.mjs` moves the Core block first |
| Restore identity | `upsert-restore-id.py` | `save-session-id.js` |

The project owns the registration: which hook event runs which adapter, which plugin file is listed. Core owns what the adapter does.

## Session canon

Durable authority lives in the agent's session directory; conversation state is transient.

```text
<agent dir>/sessions/<session>/
├── context.md                 identity and agreement; edited only on user instruction
├── progress.md                one-line current position
├── history.md                 checkpoints, "## <ISO>" or "## <ISO> run:<id>"
├── session-state.json         mode: session | run
├── jobs/<id>/job.md           problem · goal · direction (user's words, HEAD's agreed direction)
└── runs/<id>/
    ├── run.md                 thin index: outcome, results, boundaries, success, position
    ├── run.json               pointers only
    ├── checkpoints/NNNN-*.md
    └── execution-contracts/NNNN-*.md
```

Recovery fails closed on conflicting identity, invalid pointers, path escape, or malformed canon. Legacy Runs remain recoverable through their existing format.

Compaction keeps: the canon above (re-read, not summarized), the user's own words from the compacted span, and a pointer or a ≤8-line factual gap summary. Model-authored summaries are never resubmitted as user instructions.

## Work shaping

`HEAD_CORE.md` defines the coordinating behavior. The advertised surface: `start-job` (before proposing or making a solution: problem → goal → what already exists → how it gets solved → the smallest set) → direct work, `delegate-once` (one bounded result, one worker), or `plan-run` (dependent results, checkpoints, recovery). Procedures under `packages/procedures/` are linked from exactly the skill that needs them and are not independently discovered.

## What Core does not contain

Worker task execution (dispatch, logs, handoffs), messaging between roles, product graphs, external services, browser or design tools, and the generator that turns an agent manifest into runtime configuration are project-owned. The reference project keeps them under `mcp-servers/` and `scripts/`; Core describes the contract in the [User Guide](USER_GUIDE.md).

## Source map

| Concern | Source |
|---|---|
| Coordinating principles | `packages/core/head/HEAD_CORE.md` |
| Shared runtime meaning | `packages/head-runtime/shared/` |
| Claude adapters · OpenCode plugins | `packages/head-runtime/claude/` · `packages/head-runtime/opencode/` |
| Advertised skills · procedures | `packages/skills/` · `packages/procedures/` |
| Worker role cores | `packages/agents/` |
| Release composition | `release-manifest.json` |
| Purity guard | `packages/core/purity.test.mjs` |
| Isolated platform | `packages/_platform/README.md` |
