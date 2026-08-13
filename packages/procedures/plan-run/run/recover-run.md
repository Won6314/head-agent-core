# Recover Run

## Trigger

An active Run needs its exact current position.

## Authority

The Accepted Plan Baseline and latest saved-Planner Checkpoint govern recovery. The Runner may not reconstruct or choose a horizon.

## Produced result

For a semantic Run, validate `run.json` and read only its thin `run.md` index, exact latest Checkpoint, and named current Execution Contracts; do not construct a Run State snapshot. An unmaterialized selected Result goes to [prepare-execution-contract.md](../results/prepare-execution-contract.md); an unfinished materialized horizon goes to [dispatch-horizon.md](../results/dispatch-horizon.md); a terminal horizon without review goes to [review-checkpoint.md](review-checkpoint.md); a terminal decision goes to [finish-run.md](finish-run.md). Stop on inconsistent canon. When `run.json` is absent, use the grandfathered legacy `run.md` plus ledger/Slice adapter; interpret legacy `REVISE` as `LOCAL_CORRECTION` only in recovery instructions. Recovery never creates `run.json`, rewrites a ledger, renames artifacts, or infers opt-in migration.

## Next consumer

The exact recovered procedure.
