# HEAD Agent Core User Guide

## What Core gives a project

- a HEAD role whose principles (`HEAD_CORE.md`) load before anything project-specific;
- advertised work skills and the procedures they select;
- worker role cores for `coder`, `developer`, and `reviewer`;
- runtime meaning that Claude Code and OpenCode share — session recovery, semantic Runs, compaction policy — with one thin adapter per runtime;
- no product definition, credentials, model choice, integrations, or history.

You keep material direction. HEAD plans and executes within it. Workers receive bounded results, never the whole project.

## What a project must provide

Core is attached, not installed. The project supplies:

| Item | Where (reference layout) | Purpose |
|---|---|---|
| Agent manifest | `<agent dir>/agent.json` | One source for runtime, MCP, skills, plugins, and Claude-only hooks. A project generator renders it into `opencode.json`, `.mcp.json`, `settings.local.json`, and skill symlinks |
| Project binding | `<agent dir>/CLAUDE.md` | Project facts and constraints only. Does not restate Core principles |
| Authority index | `<agent dir>/HEAD_CONTEXT.md` | One line per canonical source HEAD may need |
| Skill links | `<agent dir>/.claude/skills/<name>` → `packages/skills/<name>` | Both runtimes discover skills from this directory |
| Runtime registration | Claude: hook commands that execute `packages/head-runtime/claude/*`. OpenCode: `plugin[]` entries for `packages/head-runtime/opencode/*` | The adapters are Core's; the registration is the project's |
| System prompt | Claude: render `HEAD_CORE.md` (+ any project common block) into `--system-prompt-file`. OpenCode: list `HEAD_CORE.md` first in `instructions` and load the `head-core-first` plugin | Core principles precede project instructions |
| Session directory | `<agent dir>/sessions/<session>/` with `context.md`, `history.md` (labeled checkpoint entries, each ending in its `다음:` cursor), `jobs/`, `runs/` | The canon the shared runtime recovers from: context plus memory derived from history by work label and recency; no state file |
| State directory | `<agent dir>/state/` | Session records, compact spans, rotated logs. Code and state never share a directory |

The reference project's generator is `scripts/sync_claude_from_opencode.py`: edit `agent.json`, run it with `--write <agent>`, run it again with no arguments to confirm every agent is in sync.

## Normal use

Talk to HEAD in terms of outcomes. HEAD runs `start-job` before proposing or making a solution and selects the smallest execution shape that preserves the result:

- **direct work** when the result stays connected to HEAD's context;
- **one bounded worker** (`delegate-once`) when one independent result can return once;
- **a durable Run** (`plan-run`) when production has dependent outcomes, checkpoints, or recovery needs.

Material product, policy, architecture, cost, publication, or workflow choices come back to you. Ordinary implementation choices stay with the owner of the bounded result.

## Sessions and work

A **Session** preserves the identity and agreement of one line of work. Inside it, a multi-turn piece of work is held by nothing but a **work label**: each checkpoint carries the slug `start-job` named for it, and the work is the chain of entries sharing that slug. There is no job file, no open or closed state, and no tool of its own — the job and Run mechanisms were removed on 2026-09-17 because open state survives only as long as HEAD remembers to close it, which is what compaction erases. A label is never inherited: an omitted `work` leaves the entry unlabeled and ends the chain, and the tool answers with the previous label so HEAD can decide whether to continue it.

On session start and after compaction both runtimes re-read that canon rather than trusting a summary. Compaction keeps your own words from the compacted span and at most a short factual note of what happened since the last checkpoint.

## Worker roles

- **Developer** owns local diagnosis and method inside a bounded input/output/consumer contract, applies the shared development standard, and proves its representative path.
- **Coder** translates a task-specific `context.md` specification into code. It refuses before implementation when behavior, state, or processing rules are missing or conflicting; general development criteria belong to its specification author.
- **Reviewer** evaluates a consequential decision before implementation and does not own the direction.

HEAD writes each brief from the worker's starting context — every fact the result needs, the boundary, the consumer, and the proof. A worker's return is evidence for HEAD's integration judgment, not authority over the parent work.

### Development criteria

The canonical [Development Standard](../../agents/DEVELOPMENT_STANDARD.md) is shared by HEAD during software planning, direct implementation, and review, and by developer during implementation. Link it from the project's authority index for those tasks and include it in developer's instruction sources. Do not add its full text to HEAD's always-loaded principles or to coder's instructions. Coder's task-specific `context.md` is a decided specification, not HEAD's session-memory file.

## What Core does not provide

- a product definition or roadmap;
- repository build and deployment policy;
- credentials or provider configuration;
- worker task execution, role messaging, graphs, databases, browser, design, or publication integrations;
- prior session history;
- authorization to publish, deploy, pay, or make other material external changes.

Projects add those through their own instructions, authority index, skills, MCP servers, and adapters.

## Where to go next

- [Technical Architecture](TECHNICAL_ARCHITECTURE.md) — packages, the shared runtime, and source ownership.
- [Foundations](FOUNDATIONS.md) — why the system is designed this way.
