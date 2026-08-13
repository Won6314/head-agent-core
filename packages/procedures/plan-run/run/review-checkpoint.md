# Review Checkpoint

## Trigger

A terminal horizon has Produced Results and Worker Report/Evidence, and runtime has forked a saved-Planner reviewer from the Accepted Plan Baseline.

## Authority

The saved Planner owns checkpoint acceptance and next-horizon judgment. Execution Contracts, Worker Reports, Evidence, and Produced Results are execution evidence, not Plan authority.

## Produced result

Read the active Plan first, then the thin Run index, frozen contracts, Worker Reports/Evidence, and current checkpoint. Judge the minimum representative path and next consumer. Inspect actual artifacts, Git, or worker logs only when the report/evidence is insufficient, contradictory, or current state needs confirmation. Persist one Checkpoint: `CONTINUE`, `LOCAL_CORRECTION`, `PLAN_CHANGE_REQUIRED`, `USER_DECISION`, `DONE`, or `FAILED`. A local correction names only the Plan-preserving defect and does not rewrite the frozen contract.

## Next consumer

[apply-checkpoint.md](apply-checkpoint.md).
