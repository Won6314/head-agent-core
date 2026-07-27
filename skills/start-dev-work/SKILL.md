---
name: start-dev-work
description: Start non-trivial software or system work by mapping the existing and intended architecture, then defining one composable implementation slice before code changes.
---

# Start Dev Work

Use the project index and code-discovery workflow to understand the existing system before choosing an implementation shape.

## Build The System Model

Make the intended structure explicit at the level needed to guide implementation:

- responsibilities and boundaries
- data and control flow
- interfaces and sources of truth
- integration with existing behavior
- real dependencies and execution order

Search `agent-task_list_tips` once with the concrete development goal. If the project exposes a past-run query, retrieve directly related runs. Incorporate only context that changes the architecture or current implementation outcome.

## Choose The Implementation Shape

Start from the requested observable result and the current working system. Identify behavior, process state, interfaces, credentials, deployment facts, and proven code that should remain unchanged.

When architecture is a real decision, compare only material contenders at decision depth. Consider preservation, operational or configuration handling, boundary adaptation, and limited code change before larger restructuring or rebuilding. Compare the value each path adds against implementation and operational cost, migration risk, reversibility, and fit with the intended system.

Choose one implementation shape before producing execution-depth slices. Architecture should be explicit enough to fix responsibilities, interfaces, dependencies, and integration behavior, without prescribing local implementation that target evidence has not established.

Before dividing implementation, identify the single authority for each material fact, the primary algorithm in readable order, the existing standard failure boundary, and the final consumer. Do not design exception matrices, alternative success paths, fallback trees, or test inventories before the primary algorithm is concrete.

## Divide The Implementation

Divide the selected architecture into coherent results, not arbitrary file lists or frontend/backend/testing buckets.

- A slice has one consumable behavior, artifact, or state that one capable developer can own end to end, including direct evidence.
- Separate slices at real behavior, architectural, dependency, interface, deployment, or mutation-ownership boundaries.
- Keep work together when splitting it would add handoff and integration cost without creating clearer independent ownership.
- Use an early vertical proof when a schema, interface, or write path must become real before construction can safely expand.
- Sequence a slice when it consumes another slice's output or shares a mutation surface requiring one owner.
- Treat slices as parallel-ready when their inputs exist, interface and output contracts are clear, mutation ownership does not conflict, and one slice is unlikely to revise another's architecture.
- Map later outcomes, but detail them only as their dependencies become concrete.

Define the representative user or operator behavior that will show the implementation works. Representative source shape, an actual artifact, and direct execution are the default evidence. The default test budget is existing tests only; a new or expanded test is not implicit evidence and belongs to a slice only when HEAD explicitly names that exact output. Do not pre-design defensive additions around possible failures.

## Shape The Run

Create `sessions/{session}/run.md` through the project's run entry point. Its structure is free-form. Keep it as a thin user-HEAD agreement and navigation map: retain the user outcome, material locked boundaries, selected architecture, compact whole-route checklist and dependency order, pointer-sized current position and next result, and success conditions.

Default recovery composes the shared core, project instructions and HEAD index with `context.md`, thin `run.md`, the latest valid ledger record, and only that record's explicit current Slice. Read a relevant `plan.md` section only when detailed route, architecture, policy, or rationale can change the judgment; never inject the plan automatically. At a checkpoint, add the aggregate reference and necessary direct artifacts, then record observation, decision, and next in the ledger and replace only the run checklist/current pointer. Do not create a checkpoint summary document by default.

When detailed authoritative problem models, rationale, architecture, policy or execution guidance would bloat `run.md`, keep it in an optional session `plan.md`. HEAD reads `plan.md` on demand when route or design judgment needs that detail; it is not automatically injected merely for recovery. `plan.md` is not a chronology sink: current position remains in the latest ledger and its current Slice, checkpoint observation and HEAD decision remain in the ledger, and direct proof remains in referenced evidence or runtime artifacts.

Every run contains a work checklist. Once the user and HEAD agree on the run, do not rewrite its requirements, scope, success conditions, or overall model unless the user changes them. At checkpoint completion, update checklist state and replace the current pointer; do not append chronology, worker summaries, test or commit inventories, or repeated evidence narration. Keep the ledger and direct evidence or runtime-artifact references available on demand; legacy checkpoints and notes are retrieval records, not new default outputs.

Define the current slice as one coherent result that a capable developer can own end to end. When slices are used, `run.md` contains a separate checklist for every slice and each slice brief under `sessions/{session}/slices/` contains its own checklist. HEAD authors the slice's upper meaning. The brief and referenced sources make the starting inputs, intended behavior, locked decisions, ownership and mutation boundaries, architectural role, consumable output, direct evidence, and material return conditions clear without prescribing an unverified implementation.

Independent slices may proceed together once their shared contracts exist. A slice whose input is another slice's output begins after that output is concrete. Detail later slices only when their dependencies are ready.

## Move Into Implementation

Implementation starts from the current slice. Observed code and runtime behavior update the system model when they reveal a different structure from the initial understanding.

Before dispatch, decide whether this is a checkpoint-governed run. Use checkpoint-governed execution when the outcome spans multiple dependent or parallel slices, is expected to continue autonomously, or requires HEAD to re-evaluate the whole route from aggregate evidence. Record that decision in `run.md`.

For a checkpoint-governed run:

1. Compile only the current checkpoint horizon into an execution manifest. Declare each node's owner, command, dependencies, owned output, evidence and terminal meaning before launch; do not freeze future horizons whose inputs are not concrete.
2. Use the project's aggregate/frozen execution entrypoint even when the current horizon has one delegated node. The worker owns local diagnosis and correction only inside the contract-owned primary result and runs existing or explicitly owned checks. Verification does not grant authority to create tests or expand the brief.
3. Do not inject individual node completion or failure into HEAD planning context and do not create follow-up tasks from worker prose. Return once when all executable nodes are terminal.
4. At the aggregate checkpoint, compare actual artifacts and system state with the intended slice state transition, update the canonical run, then compile and dispatch the next horizon unless user authority is required or the run is complete.

Use a direct quick task only for a genuinely independent result that does not need parent-run checkpoint integration. When the project has no aggregate execution runtime, preserve the same boundary manually rather than falling back to worker-by-worker replanning.

For a delegated slice, provide the current Slice, relevant `plan.md` section(s), and exact sources or evidence required by that Slice. Do not provide the full plan, transcript, ledger history, or prior worker narrative by default.
