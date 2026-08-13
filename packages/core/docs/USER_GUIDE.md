# HEAD Agent Core User Guide

## What you get

HEAD Agent Core turns an ordinary project directory into a project-bound HEAD environment. After one public initialization command, the project has:

- a HEAD role that owns the whole outcome and coordinates work;
- durable Session and Run records that survive interruption and compaction;
- Developer, Coder, and Reviewer worker roles;
- a user-scoped coordination host for worker tasks and role messages;
- a protected onboarding conversation for defining project-specific authority;
- no copied product history, credentials, model choice, or product policy.

You continue to own material direction. HEAD plans and executes within that direction. Workers receive bounded results rather than ownership of the whole project.

## Prerequisites

Before initialization, the host must already have:

- Node.js;
- OpenCode, with the user's own authentication and model authority;
- Herdr and a live Herdr socket;
- Linux user systemd or a macOS LaunchAgent environment.

HEAD Core discovers compatible OpenCode and Herdr executables or accepts explicit paths. It does not configure providers, models, credentials, or product integrations.

## Install and initialize

Run the public command from an extracted HEAD Core release:

```bash
node ./packages/project-init/public-entry.mjs init <target>
```

Optional arguments are:

```text
--project-id <id>
--opencode <file>
--herdr <file>
--socket <file>
--port <number>
```

The command performs one composed transaction:

1. validates the release and host prerequisites;
2. installs or converges the immutable user-scoped Core release;
3. starts and verifies the coordination host;
4. creates and registers the project composition;
5. creates or resumes the protected `onboarding` Session;
6. starts and focuses the onboarding HEAD tab;
7. prints one machine-readable result.

A successful result has `status: "ready"` and includes the release, host, project, and onboarding identities.

## Generated project structure

Initialization creates the following base shape when the paths are absent:

```text
<project>/
├── CLAUDE.md
├── scripts/
│   └── resume-session.sh
└── .claude/
    ├── head-runtime.json
    ├── head-project.json
    ├── skills/
    └── agents/
        ├── head/
        │   ├── CLAUDE.md
        │   ├── HEAD_CONTEXT.md
        │   ├── opencode.json
        │   └── sessions/
        │       └── onboarding/
        │           ├── context.md
        │           └── session-state.json
        ├── developer/
        │   ├── CLAUDE.md
        │   ├── EXPERTISE.md
        │   └── opencode.json
        ├── coder/
        │   ├── CLAUDE.md
        │   ├── EXPERTISE.md
        │   └── opencode.json
        └── reviewer/
            ├── CLAUDE.md
            ├── EXPERTISE.md
            └── opencode.json
```

## Restore an existing Session

Session restore is an installed operational command rather than a model-discovered Skill. From the project root, list exact restore candidates first:

```bash
scripts/resume-session.sh --list
```

After selecting one exact Session name, verify the non-destructive plan and then run the same command without `--dry-run`:

```bash
scripts/resume-session.sh "<SESSION_NAME>" --runtime opencode --dry-run
scripts/resume-session.sh "<SESSION_NAME>" --runtime opencode
```

Do not guess a fuzzy Session name or restore identifier, bypass collision warnings, or reconstruct the Herdr operation manually when the command rejects the restore.

Generated runtime configuration is managed by the initializer. Project prose and local expertise are project-owned: initialization creates seeds only when absent and does not overwrite existing content.

Worker task state, logs, messages, and handoffs belong to the host state outside the project tree.

## Complete onboarding

The first conversation establishes the project's local authority. Expect HEAD to ask about:

- project identity and purpose;
- repository and deployment boundaries;
- canonical product, code, policy, and operational sources;
- constraints and user-owned decisions;
- optional tools, Skills, and integrations.

HEAD should summarize proposed project-owned writes and obtain confirmation before changing them. Managed manifests, installed Core files, host state, credentials, and model/provider choice are protected from onboarding edits.

## Normal use

After onboarding, talk to HEAD in terms of outcomes. You do not need to choose an internal Skill or worker for every request.

HEAD selects the smallest execution shape that preserves the result:

- **Direct Session work** for a result that can be completed coherently in one pass.
- **One bounded worker** when one independent result can return once.
- **A durable Run** when production has dependent outcomes, meaningful checkpoints, or recovery requirements.

For material product, policy, architecture, cost, publication, or workflow choices, HEAD returns the decision to you. Ordinary implementation and execution choices remain with the owner of the bounded result.

## Sessions and semantic Runs

A **Session** preserves the identity and ongoing agreement of a line of work.

A **Run** is used when an accepted design needs dependent Results, checkpoints, or recovery. The Planner first turns a Problem Definition into observable Goals/Evidence, considers material alternatives with the user, selects a solution, and forms a consumable Result Graph. Result boundaries select the route: direct work remains connected to HEAD, one independently executable Result uses one-shot delegation, and dependent Results use a durable Run.

For a semantic Run, the Planner owns the Accepted Plan Baseline and checkpoint judgment; the Runner authors the next Execution Contract; a Worker returns a Produced Result and Worker Report/Evidence. `run.json` is only a machine pointer to `run.md`, the latest Checkpoint, and current Contracts. Recovery follows those pointers. A saved Planner reviews through `runPointerFile` without Plan-file delivery. Grandfathered legacy Runs recover through their legacy path and are never automatically migrated.

## Worker roles

- **Developer** owns local diagnosis and solution method inside a bounded authoritative-input/output/consumer contract and proves its representative path.
- **Coder** implements a fully decided Run contract without adding or changing externally observable decisions.
- **Reviewer** evaluates a consequential decision before implementation and does not own the final direction.

HEAD composes each worker's brief from the intended result, authoritative inputs, locked decisions, boundaries, consumer, and proof. A worker return is evidence for HEAD's integration judgment, not automatic authority over the parent work.

## Re-running initialization

The public command is convergent when the installed release and project-generated files already match. Re-running it can restore host readiness and resume the exact onboarding boundary.

Initialization fails before mutation on unsafe path or managed-file collisions. It preserves unrelated project files and rolls back the phase it owns when a committed host change cannot be completed safely.

## What Core does not provide

The base Core does not supply:

- a product definition or roadmap;
- repository-specific build and deployment policy;
- credentials or provider configuration;
- production database, analytics, browser, design, publication, or messaging integrations;
- prior Session history or project memories;
- authorization to publish, deploy, pay, or make other material external changes.

Projects add those capabilities through their own instructions, authority index, Skills, and adapters.

## Where to go next

- To understand state, processes, security boundaries, and source ownership, read the [Technical Architecture](TECHNICAL_ARCHITECTURE.md).
- To understand why the system is designed this way, read [Foundations](FOUNDATIONS.md).
