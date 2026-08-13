# HEAD Agent Core Technical Architecture

## Scope

HEAD Agent Core is a product-neutral distribution, runtime-composition, continuity, and worker-coordination system. It supplies shared behavior while requiring every live operation to bind to one registered project and one validated caller.

The current HEAD system graph identifies the following complete Core-owned operational Features:

| Feature | Result |
|---|---|
| HF-055 | Install and initialize a HEAD Core project |
| HF-002 | Recover the current HEAD execution context |
| HF-003 | Start an accepted non-trivial Run |
| HF-005 | Finish a terminal Run |
| HF-006 | Advance a Run checkpoint |
| HF-007 | Continue through context compaction |
| HF-008 | Restore a prior HEAD OpenCode session |
| HF-009 | Dispatch an independently ownable worker task |
| HF-010 | Integrate a completed worker branch |
| HF-012 | Answer a worker authority question |

The graph is a retrieval index. The source files linked to each Feature remain authority for current behavior.

## System planes

### 1. Distribution plane

`release-manifest.json` defines the selected distributable package paths. A release identity is the SHA-256 digest of the manifest and selected regular files. Tests are excluded from the installed artifact, symlinked release sources are rejected, and installed release files are made read-only.

The installed layout is user-scoped:

```text
$XDG_DATA_HOME/head/
├── releases/<release-id>/
└── current -> releases/<release-id>/

$XDG_CONFIG_HOME/head/host.json
$XDG_STATE_HOME/head/
$XDG_BIN_HOME/head
```

The stable command points through `current` to the installed `packages/project-init/head.mjs`. Updating Core changes the immutable release target rather than editing installed source in place.

### 2. Host plane

The host installation discovers and canonicalizes OpenCode and Herdr executables, validates the Herdr socket, installs the Herdr OpenCode integration, and starts one loopback coordination daemon.

Supported service descriptors are:

- Linux user systemd: `head-coordination.service`;
- macOS LaunchAgent: `dev.head.coordination`.

The daemon exposes two MCP paths:

- `/agent-task` for a bounded one-shot worker operation;
- `/agent-comm` for project-role messaging.

Health requests disclose endpoint identity and schema state but no caller, binding, or secret data.

### 3. Project plane

Project initialization creates only generic composition and absent project-owned seeds. It registers a one-to-one `projectId` and canonical root with the host.

The project owns:

- root and role-specific instructions;
- `HEAD_CONTEXT.md`, which indexes local canonical sources;
- local Skills and expertise;
- Session and Run canon;
- repository, product, policy, and operational decisions.

The initializer owns:

- `.claude/head-runtime.json`;
- `.claude/head-project.json` and its managed-file inventory;
- generated role `opencode.json` files;
- the generated resume wrapper.

### 4. Live runtime plane

The person owns the main OpenCode process and model authority. Herdr supplies the live workspace, tab, pane, terminal, CWD, and OpenCode session evidence.

On each relevant request, Core:

1. validates the exact live Herdr caller;
2. resolves the nearest project runtime manifest;
3. confirms the project registration and authority generation;
4. loads installed Core before project instructions;
5. selects Session or Run context from canonical state;
6. exposes only the project-bound MCP surface.

No runtime request may supply its own project root, state path, caller identity, or authority generation.

## Public initialization flow

`public-entry.mjs init <target>` composes three installed phases:

```text
public init
  ├─ host install/converge
  ├─ project init/register
  └─ onboarding start/resume
```

The phase commands are recovery and transaction boundaries, not alternate public installers.

Host installation preflights paths, executables, socket authority, service support, and release content before committing. If a replacement cannot become healthy, it restores the prior stable command, configuration, service, and release reference.

Project initialization preflights every managed destination before writing, preserves existing project-owned prose, verifies generated references and endpoint health, and rolls back only files and directories created by the failed invocation.

Onboarding creates exactly one `onboarding` Session and one labeled HEAD tab. It uses the user's existing OpenCode authentication and model selection.

## Context composition and semantic Run canon

Core distinguishes durable authority from transient conversation state.

Semantic Runs use a thin, pointer-only index:

```text
.claude/agents/head/sessions/<session>/
├── context.md
├── progress.md                 # optional bounded continuity
├── session-state.json
└── runs/
    └── <run>/
        ├── run.md
        ├── run.md
        ├── run.json                 # pointers only
        ├── checkpoints/<checkpoint>.md
        └── execution-contracts/<result>.md
```

The Planner's Accepted Plan Baseline explains Problem Definition → Goals/Evidence → alternatives and user choice → Selected Solution → Result Graph. The Runner writes an Execution Contract for each selected Result; workers return Produced Results and Worker Report/Evidence; the saved Planner applies a Checkpoint. `run.json` contains no Plan, judgment, evidence body, code snapshot, or change ledger: it points only to `run.md`, latest Checkpoint, and current Contracts. Recovery fails closed on conflicting identity, invalid pointers, path escape, or malformed canon. Legacy Runs remain recoverable through their existing format without automatic migration.

Compaction reloads the canonical payload and permits at most one explicit continuation. A newer real user turn supersedes a queued continuation.

## Work shaping and execution modes

`HEAD_CORE.md` defines the coordinating behavior. The current top-level workflow surface separates:

- `outcome-shaping`: turn a problem into goals/evidence, a selected solution, and a consumer-ready Result Graph;
- `dev-system-shaping`: map software/system behavior before production;
- `delegate-once`: one independently owned Session result;
- `plan-run`: preserve planning lineage and route accepted production through one execution successor.

Worker, Result, and Run-lifecycle procedures are plain Markdown under `packages/procedures/`. A selected top-level Skill links to exactly the procedure required by current state; these branches are not independently Skill-discovered or injected together.

## Worker execution

The base project provides three reusable roles:

```text
HEAD
├── Developer — bounded one-shot implementation
├── Coder     — fully decided Run implementation
└── Reviewer  — consequential pre-implementation evaluation
```

For the released Core one-shot path, `/agent-task` exposes only `quick_task`.

The host service:

1. resolves a direct project-owned worker directory;
2. derives execution policy from host adapters;
3. reserves task state, log, result, and delivery paths under host state;
4. creates one non-focused Herdr tab with one root pane;
5. launches OpenCode in the worker directory;
6. captures exact runtime session evidence;
7. waits asynchronously for terminal state;
8. validates or normalizes the final handoff;
9. delivers completion once to the initiating HEAD;
10. closes only the proven owned task tab.

Host-owned task artifacts are grouped under:

```text
$XDG_STATE_HOME/head/projects/<project-id>/agent-task/quick-tasks/
├── <task-id>.json
├── logs/<task-id>.log
├── results/<task-id>.handoff.md
└── deliveries/<task-id>.json
```

Topology or identity drift fails closed. A cleanup failure is persisted rather than reported as success.

## Agent communication

`/agent-comm` exposes:

- `send_message`;
- `read_inbox`;
- `reply_message`.

Initialization records the exact live pane as the role's generation-fenced target. Messages are project-scoped and durable in host state. Authority rotation invalidates stale MCP sessions and targets.

## Authority and safety invariants

The implementation consistently applies these boundaries:

- project IDs and canonical roots are one-to-one;
- host state must remain outside the project root;
- project overlays may select workers but cannot choose host state paths;
- `head` cannot be selected as a worker role;
- managed paths reject symlink traversal;
- task and MCP sessions are fenced by live caller and authority generation;
- exact pane, tab, terminal, CWD, and runtime-session evidence governs cleanup and continuation;
- public initialization does not copy credentials, history, or product policy;
- capability does not grant authorization for publication, deployment, payment, or other material external action.

## Current base surface and extensions

The base Core includes the public init path, OpenCode recovery, Session/Run lifecycle, compaction continuity, one-shot worker execution, and role messaging.

Project-specific systems may add richer task control, aggregate execution, external services, product graphs, analytics, browser automation, design tools, or publication workflows. Those extensions are not implied by the base release and remain project-owned unless their complete behavior moves into Core.

## Source map

| Concern | Current source |
|---|---|
| Coordinating principles | `packages/core/head/HEAD_CORE.md` |
| Design background | `packages/core/theory/` |
| Public composition | `packages/project-init/public-entry.mjs` |
| Host installation | `packages/project-init/host-installer.mjs` |
| Project initialization | `packages/project-init/project-initializer.mjs` |
| Protected onboarding | `packages/project-init/onboarding-driver.mjs` |
| Session/Run runtime | `packages/opencode-runtime/runtime/opencode/` |
| Worker task lifecycle | `packages/coordination/mcp/agent-task/host-service.mjs` |
| Role communication | `packages/coordination/mcp/agent-comm/host-service.mjs` |
| Host transport and process | `packages/coordination/mcp/host-coordination/` |
| Worker role contracts | `packages/agents/` |
| Advertised top-level workflows | `packages/skills/` |
| Condition-selected branch procedures | `packages/procedures/` |
| Release composition | `release-manifest.json` |
