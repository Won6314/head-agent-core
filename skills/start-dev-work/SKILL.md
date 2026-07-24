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

## Divide The Implementation

Divide the selected architecture into coherent results, not arbitrary file lists or frontend/backend/testing buckets.

- A slice has one consumable behavior, artifact, or state that one capable developer can own end to end, including direct evidence.
- Separate slices at real behavior, architectural, dependency, interface, deployment, or mutation-ownership boundaries.
- Keep work together when splitting it would add handoff and integration cost without creating clearer independent ownership.
- Use an early vertical proof when a schema, interface, or write path must become real before construction can safely expand.
- Sequence a slice when it consumes another slice's output or shares a mutation surface requiring one owner.
- Treat slices as parallel-ready when their inputs exist, interface and output contracts are clear, mutation ownership does not conflict, and one slice is unlikely to revise another's architecture.
- Map later outcomes, but detail them only as their dependencies become concrete.

Define the representative user or operator behavior that will show the implementation works. Give current attention to exceptions connected to normal-use blockage, data or money loss, authorization or security, irreversible effects, or propagated harm. Broader defensive handling and QA belong to a distinct hardening or release stage when they are not necessary for the current result.

## Shape The Run

Create `sessions/{session}/run.md` through the project's run entry point. Its structure is free-form. Preserve the user-HEAD outcome and material boundaries, the selected architecture and why it earned its cost, the coherent outcome map and dependency order, the current position, and the evidence by which HEAD can integrate completion.

Every run contains a work checklist. Once the user and HEAD agree on the run, do not rewrite its requirements, scope, success conditions, or overall model unless the user changes them. Update only checklists and current-situation fields as implementation advances.

Define the current slice as one coherent result that a capable developer can own end to end. When slices are used, `run.md` contains a separate checklist for every slice and each slice brief under `sessions/{session}/slices/` contains its own checklist. HEAD authors the slice's upper meaning. The brief and referenced sources make the starting inputs, intended behavior, locked decisions, ownership and mutation boundaries, architectural role, consumable output, direct evidence, and material return conditions clear without prescribing an unverified implementation.

Independent slices may proceed together once their shared contracts exist. A slice whose input is another slice's output begins after that output is concrete. Detail later slices only when their dependencies are ready.

## Move Into Implementation

Implementation starts from the current slice. HEAD may execute it directly or delegate the brief to one developer. Observed code and runtime behavior update the system model when they reveal a different structure from the initial understanding.
