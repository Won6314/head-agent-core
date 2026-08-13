# Initialize Run

## Trigger

The Planner is preparing the final Plan package before the Accepted Plan Baseline is materialized.

## Authority

The Planner owns the Plan and Run route. This procedure does not create Execution Contracts or dispatch work.

## Produced result

Create `run.md` as a thin current-position index: accepted outcome, boundaries, route, current position, next Result, and observable success conditions. Alongside it, atomically create pointer-only `run.json` with exact format/identity and relative pointers to `run.md`, the initial Checkpoint, and the current Execution Contracts. Keep detailed rationale in referenced Plan artifacts. `run.json` contains no decision reason, accepted-result summary, Evidence body, artifact state, diff, or history. Create the initial Checkpoint and preserve each ready Result's outcome, predecessor, owner class, locked interfaces or state meaning, mutation boundary, consumer, representative path, and return conditions. Select the initial horizon with [select-horizon.md](../results/select-horizon.md).

## Next consumer

[accept-plan-baseline.md](../planning/accept-plan-baseline.md).
