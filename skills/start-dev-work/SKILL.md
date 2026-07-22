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

## Shape The Run

Create `sessions/{session}/run.md` through the project's run entry point. Its structure is free-form, but it must preserve the original requirements and agreed decisions, complete intended result and scope, success conditions, system model and implementation order, completed and remaining work, current situation, unverified assumptions, exact next action, and evidence locations.

Every run contains a work checklist. Once the user and HEAD agree on the run, do not rewrite its requirements, scope, success conditions, or overall model unless the user changes them. Update only checklists and current-situation fields as implementation advances.

Define the current slice as one coherent result that a capable developer can own end to end. When slices are used, `run.md` contains a separate checklist for every slice and each slice brief under `sessions/{session}/slices/` contains its own checklist. The brief, together with referenced canonical sources, makes the starting inputs, intended behavior, ownership boundary, architectural role, and consumable output clear without prescribing an unverified implementation.

Independent slices may proceed together once their shared contracts exist. A slice whose input is another slice's output begins after that output is concrete. Detail later slices only when their dependencies are ready.

## Move Into Implementation

Implementation starts from the current slice. HEAD may execute it directly or delegate the brief to one developer. Observed code and runtime behavior update the system model when they reveal a different structure from the initial understanding.
