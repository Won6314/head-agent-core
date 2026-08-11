# Prepare Run

## Trigger

The `plan-run` generation is ready to produce the final Run route and initial executable horizon before immutable `A` is materialized.

## Exact reads

Read the current Session identity, Plan Contract, cumulative accepted plan, and exact authoritative sources that determine the route. Read `../results/schedule.md` for plan-level horizon membership. There is no `A` or `B` yet.

## Authority

The current planning HEAD owns the Plan and whole Run route. It selects coherent results, dependencies, readiness bases, owner class, and horizon membership, but does not turn worker-facing execution detail or proof checklists into Plan authority. `../results/schedule.md` owns dependency and parallel-horizon scheduling. None may dispatch work.

## Produced result

1. Carry forward the accepted whole outcome, locked decisions, unresolved matters, preservation boundaries, and success and stop conditions.
2. Map the coherent outcomes, their dependency order, and the consumable result each next owner needs.
3. Create `sessions/{session}/runs/{runId}/run.md` as a thin agreement and route: outcome, boundaries, route, current position, next result, and observable success conditions.
4. Put detailed architecture or rationale in an exact referenced plan artifact; do not copy it into `run.md`.
5. Create the initial START ledger with expected state, observed canon preparation, direct references, decision, and initial horizon position.
6. For each ready result, preserve only its plan-level outcome, predecessor, owner class, locked interfaces/state meaning, mutation and preservation boundary, consumer, representative primary-path result, and material return conditions. Do not create the worker execution contract yet.
7. Read `../results/schedule.md` and combine every independently executable ready result into the initial plan horizon. Keep Run and horizon positions aligned.
8. Stop before execution-contract materialization, `head_session(start_run)`, or worker dispatch. The Plan and plan horizon become inputs to final `A`.

## Mutation class

Planning canon, initial ledger, plan-level result readiness, and initial-horizon scheduling only. No execution-contract creation, Run-mode transition, or production mutation.

## Next consumer

`../lineage/finalize-A.md`, which materializes immutable Plan `A` from the accepted plan and route.
