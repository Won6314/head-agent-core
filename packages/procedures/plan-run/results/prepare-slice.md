# Prepare Slice

## Trigger

Active execution `B` has one exact A-selected Run result, or one exact Plan-preserving local correction, that needs a worker-facing execution contract.

## Exact reads

Read immutable Plan authority `A`, `run.md`, current position, only the relevant Plan result and predecessor artifacts, any exact local-correction decision, plus the selected worker readiness branch. Do not pass parent transcript, full ledger history, unrelated source files, or review speculation.

## Authority

Plan `A` or canonical A review selects the result, owner class, and plan horizon. `B` may materialize the worker-facing execution contract for that exact selection but cannot change result meaning, worker class, dependencies, accepted interfaces/state, boundaries, consumer, or completion meaning. The worker owns local judgment only inside the frozen execution contract.

## Readiness gate

Before writing a dispatchable execution contract, treat this as a secondary execution-time check. The primary decomposition and all material behavior decisions must already exist in immutable Plan `A`.

1. Apply the selected worker readiness branch to the current result and current predecessor artifacts. A plan label is not proof of readiness.
2. Confirm that the result contains one independently executable behavior, artifact, or state. If it contains independently consumable state machines, rollback boundaries, mutation surfaces, or downstream consumers, split it in planning before delegation.
3. Carry only the state model, transitions, validation, rollback, and representative use that the Plan or accepted predecessor actually determines. Do not add bounds, rejection matrices, defensive branches, or proof obligations merely to make the contract appear complete.
4. Label contract material by source: `PLAN_BOUND`, `PREDECESSOR_BOUND`, `LOCAL_IMPLEMENTATION`, or `PROOF_AID`. Only the first two express accepted behavior; the latter two guide production and cannot expand checkpoint acceptance.
5. If materialization would split or reclassify a result, change its dependency graph, or decide accepted input/output, durable meaning, authority, state transition, failure result, preservation, downstream behavior, or completion meaning absent from immutable `A`, produce no execution contract and return `PLAN_CHANGE_REQUIRED`. `B` must not repair the Plan locally.

## Produced result

1. Re-anchor on the whole Run, its readiness class, and why the A-selected result exists in that whole.
2. Define one behavior, artifact, or state that its next consumer can use without reconstructing worker reasoning.
3. Name the exact authoritative inputs and source paths and trace every binding clause to Plan or accepted predecessor authority.
4. Preserve locked decisions, mutation and preservation boundaries, interfaces, and parent-owned authority.
5. Add only the local mechanics and representative primary-path proof needed for this owner to execute. Keep connected diagnosis, production, correction, and proof with the same owner.
6. Write one owner-specific execution contract. For a local correction, preserve the immutable initial contract and write an explicit correction delta rather than rewriting history.
7. Return the contract to `dispatch.md`, which freezes its exact bytes before worker launch.

## Mutation class

Execution-contract or local-correction-delta creation. No Plan mutation.

## Next consumer

`dispatch.md` for the exact A-selected result. `PLAN_CHANGE_REQUIRED` returns to Plan replacement instead of dispatch.
