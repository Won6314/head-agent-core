---
name: start-work
description: Start non-trivial general work by creating a durable run canon, composing relevant context, and detailing the current coherent outcome before execution.
---

# Start Work

Start from the outcome, not from a document template.

## Build The Work Model

1. State the user-visible or operational result, the current state that matters, and the working assets worth preserving.
2. Identify the parts, relationships, dependencies, and consumable outcomes that make the result coherent.
3. Use the representation natural to the work: investigation coverage, decision structure, production flow, operating state, construction map, or another form that fits the outcome.
4. Resolve facts that can change the work model from the canonical sources indexed by the project.

## Make Decisions Before Execution Detail

When a material choice exists, compare genuinely different paths at the depth needed for a decision. Include the smallest viable path when one exists: preserving the current state, operational handling, configuration, boundary adaptation, or a limited change may be a real contender.

HEAD creates the option set. The user confirms that the options and decision framing represent the choice before an optional reviewer evaluates them. Reviewer evaluation is useful when separate judgment can materially change a consequential decision; it does not replace HEAD's option generation or the user-HEAD decision.

Keep options comparable but intentionally incomplete. Select one direction before elaborating its execution model.

## Divide The Work

Map the whole result at a useful level, then divide it into coherent outcomes that increase the target artifact or unlock another outcome's consumption.

- Keep together work that one owner can carry end to end and prove through one connected result.
- Separate outcomes when they have a real dependency, distinct ownership or mutation boundary, or an uncertainty that must become concrete before later work can be shaped.
- Establish the overall order first. Detail the current outcome to execution depth and refine later outcomes as their inputs become real.
- Start outcomes together only when their inputs, ownership, shared boundaries, and output contracts are concrete enough to compose without one outcome redesigning another.

Define the primary route and representative result before adding confidence work. Direct artifacts and representative operation are the default evidence. Tests, review stages, fallback procedures, defensive branches, and other hardening are not implicit outputs. An addition enters the run only when HEAD explicitly owns that exact output; worker or validator suggestions never create run scope.

## Compose Context

After the task is clear, search `agent-task_list_tips` once with a semantic query derived from the current goal. If the project exposes a past-run query, search for directly related runs as well. Carry forward only information that changes the current interpretation, decision, or result; reference the source instead of copying its full history.

## Create The Run

Use the project's run entry point to create the current working canon at:

```text
sessions/{session}/run.md
```

The run is a thin user-HEAD agreement and navigation map for the whole outcome. Choose a structure natural to the work rather than following a fixed template. Retain the user outcome, material locked boundaries and decisions, compact whole-route checklist, pointer-sized current position and next result, and success conditions.

When detailed authoritative problem models, rationale, architecture, policy or execution guidance would bloat `run.md`, keep it in an optional session `plan.md`. HEAD reads `plan.md` on demand when route or design judgment needs that detail; it is not automatically injected merely for recovery. `plan.md` is not a chronology sink: current position remains in the latest ledger and its current Slice, checkpoint observation and HEAD decision remain in the ledger, and direct proof remains in referenced evidence or runtime artifacts.

Every run contains a work checklist. After the user and HEAD agree on the run, do not rewrite its requirements, scope, success conditions, or overall work model unless the user changes them. At checkpoint completion, update checklist state and replace the current pointer; do not append chronology, worker summaries, test or commit inventories, or repeated evidence narration. Keep the ledger and direct evidence or runtime-artifact references available on demand; legacy checkpoints and notes are retrieval records, not new default outputs.

One coherent outcome uses `run.md` alone unless its detailed planning guidance belongs in the optional `plan.md`. When work is divided into slices, keep a separate checklist for every slice in `run.md` and give each slice brief under `sessions/{session}/slices/` its own checklist. A slice is the HEAD-worker contract: HEAD authors its upper outcome, boundaries, starting evidence, and consumable result; the owner holds subordinate execution judgment. A slice may detail execution but cannot narrow or replace the parent run.

Express confidence in terms natural to the work and the representative behavior or artifact that supports completion. Do not turn possible risks into an inventory or implicit work. Treat broader hardening as separate work only when HEAD explicitly owns it as part of the user outcome.

## Execute

Begin from the current coherent outcome. Mark checklist progress and keep the current pointer exact. Do not declare the run complete until its required checklist and success conditions are satisfied.

Before dispatch, decide whether this is a checkpoint-governed run. Use checkpoint-governed execution when multiple agent outcomes must compose, execution will continue autonomously or for a long duration, or HEAD must reassess the whole route from aggregate evidence. Record the decision in `run.md`.

For a checkpoint-governed run, compile only the current checkpoint horizon into the project's aggregate/frozen execution entrypoint. Predeclare node ownership, dependencies, outputs, evidence and terminal meaning; keep worker lifecycle out of HEAD's planning context; and return once with aggregate actual state. At that checkpoint HEAD restores the whole outcome and route, updates canon, and dispatches the next prepared horizon unless a user decision is required or the run is complete.

Use a direct quick task only for an independent result that does not participate in a parent checkpoint.
