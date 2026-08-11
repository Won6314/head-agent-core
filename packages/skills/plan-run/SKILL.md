---
name: plan-run
description: >
  Use after HEAD has directly established and retained an accepted whole
  design whose production requires multiple dependent bounded results,
  meaningful checkpoints, or durable recovery. HEAD retains Plan context,
  integration judgment, and conclusion throughout the Run.
---

# Plan Run

`plan-run` preserves an accepted whole design as durable Plan lineage and routes its production through bounded execution contexts. It does not obtain parent understanding from workers or replace HEAD's whole-outcome context.

The accepted whole design is the user-accepted system result and material design decisions that justify a Run. Final execution authority `A` is produced later by this workflow.

## Context Ownership

- `a` captures the whole-outcome context HEAD formed through direct investigation.
- `a′` carries the user-agreed design context.
- Planning generations refine that accepted whole without replacing parent authority.
- `A` is the immutable accepted execution authority.
- `B` executes only `A`-selected bounded contexts.
- Checkpoint review reintegrates artifacts and direct evidence into `A`'s whole Plan context before HEAD selects the next horizon or conclusion.

Load exactly one procedure file for the current transition:

- Investigation and its task-relevant method selection are complete: read [capture-a.md](../../procedures/plan-run/lineage/capture-a.md).
- Rich planning has ended with the user's exact `정리 끝`, or a proposed `a′` outline needs the first user review: read [contract-a-prime.md](../../procedures/plan-run/lineage/contract-a-prime.md).
- The user accepted the `a′` outline, or an accepted generation still has decomposable leaves: read [generation-loop.md](../../procedures/plan-run/lineage/generation-loop.md).
- The accepted whole plan needs its Run route, thin canon, and initial plan horizon before final `A`: read [prepare-run.md](../../procedures/plan-run/run/prepare-run.md).
- Multiple independently ready Plan results need one dependency-safe horizon: read [schedule.md](../../procedures/plan-run/results/schedule.md).
- Every ready or execution-deferred final-plan leaf has passed the leaf decomposition gate with an accepted worker-readiness basis, and every planning-deferred leaf has an explicit planning re-entry: read [finalize-A.md](../../procedures/plan-run/lineage/finalize-A.md).
- Immutable `A` is ready to replace planning `P` with execution successor `B`: read [activate-B.md](../../procedures/plan-run/lineage/activate-B.md).
- Migrated `B` has inherited valid canon and is ready to enter Run mode: read [activate-run.md](../../procedures/plan-run/run/activate-run.md).
- Active `B` needs a worker-facing execution contract for one exact A-selected result or local correction: read [prepare-slice.md](../../procedures/plan-run/results/prepare-slice.md).
- Active `B` has frozen-ready execution contracts for the exact A-selected horizon: read [dispatch.md](../../procedures/plan-run/results/dispatch.md).
- A terminal execution horizon must be judged from active Plan authority: read [review-checkpoint.md](../../procedures/plan-run/run/review-checkpoint.md).
- A canonical A-review decision must be applied to Run canon and routing: read [checkpoint-run.md](../../procedures/plan-run/run/checkpoint-run.md).
- An active Run must recover its exact canonical position: read [recover-run.md](../../procedures/plan-run/run/recover-run.md).
- The user explicitly stops a nonterminal Run and requires Session mode: read [stop-run.md](../../procedures/plan-run/run/stop-run.md).
- Canonical A review has returned a terminal decision: read [finish-run.md](../../procedures/plan-run/run/finish-run.md).
- An obsolete caller attempts to route terminal evidence through `B`: read [integrate-result.md](../../procedures/plan-run/results/integrate-result.md) only to redirect it unchanged to A review.

When a planning leaf or Run result assigns `coder`, read [coder.md](../../procedures/plan-run/workers/coder.md) only with the active planning or result procedure.

Whenever the selected procedure saves or loads a HEAD, also read [anchor-operations.md](../../procedures/plan-run/lineage/anchor-operations.md). Do not load the other procedure files.
