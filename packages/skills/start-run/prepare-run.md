# Prepare Run

## Trigger

The `plan-run` generation is ready to produce the final Run route and first executable result before immutable `A` is materialized.

## Exact reads

Read the current Session identity, Plan Contract, cumulative accepted plan, exact authoritative sources that determine the route, and `delegate-task/prepare-slice.md`. There is no `A` or `B` yet.

## Authority

The current planning HEAD owns the whole Run route. `delegate-task/prepare-slice.md` owns the method for compiling the first owner-specific result. Neither may dispatch work.

## Produced result

1. Carry forward the accepted whole outcome, locked decisions, unresolved matters, preservation boundaries, and success and stop conditions.
2. Map only the major coherent outcomes, their dependency order, and the consumable result each next owner needs.
3. Create `sessions/{session}/runs/{runId}/run.md` as a thin agreement and route: outcome, boundaries, route, current position, next result, and observable success conditions.
4. Put detailed architecture or rationale in an exact referenced plan artifact; do not copy it into `run.md`.
5. Create the initial START ledger with expected state, observed canon preparation, direct references, decision, and first position.
6. Read `delegate-task/prepare-slice.md` and prepare the first executable result. Keep Run and Slice positions aligned.
7. Stop before `head_session(start_run)` or worker dispatch. These prepared artifacts become inputs to final `A`.

## Mutation class

Planning canon, initial ledger, and first Slice creation only. No Run-mode transition or production mutation.

## Next consumer

`plan-run/finalize-A.md`, which materializes immutable `A` from the accepted plan and these prepared artifacts.
