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
| `session-lifecycle.mjs` | Session identity, the start payload derived from `history.md` (`projectSessionRecovery`), and `parseHistoryEntries` — the single parser for checkpoint headings (`## <ISO>` with an optional `work:<slug>`; a pre-2026-09-17 `run:<id>` still reads as that entry's label) |
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
| Core first in the system prompt | project renders `HEAD_CORE.md` into `--system-prompt-file` | `head-core-first.mjs` moves the Core block first |
| Restore identity | `upsert-restore-id.py` | `save-session-id.js` |

The project owns the registration: which hook event runs which adapter, which plugin file is listed. Core owns what the adapter does.

## Session canon

Durable authority lives in the agent's session directory; conversation state is transient.

```text
<agent dir>/sessions/<session>/
├── context.md                 identity and agreement; never edited without user consent
├── history.md                 checkpoints, "## <ISO>[ work:<slug>]", each ending in its "다음:" cursor
├── session-state.json         record only (the Run mode it named was removed 2026-09-17)
├── jobs/<id>/job.md           record only (record_job removed 2026-09-17)
└── runs/<id>/                 record only (record_run, head_session, layered_run removed 2026-09-17)
```

A start (session start or post-compaction) loads context.md plus memory derived from history.md alone: the chain of entries sharing the last entry's work label (first entry + last 10) united with the last 5 entries, in time order, cut by count and never summarised. There is no mode and no state file is read — a pointer that HEAD must remember to close is exactly what compaction makes it forget. Recovery fails closed on conflicting identity, path escape, or malformed canon.

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
