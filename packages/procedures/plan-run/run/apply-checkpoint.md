# Apply Checkpoint

## Trigger

A saved-Planner Checkpoint decision exists for the terminal horizon.

## Authority

The Checkpoint owns Plan-level acceptance, correction classification, escalation, terminal judgment, and next horizon. The Runner applies that decision without re-judging it.

## Produced result

Persist the Checkpoint, then atomically update pointer-only `run.json` and compact current-position material in `run.md`; the pointer names only `run.md`, that latest Checkpoint, and current Execution Contracts. `CONTINUE` prepares the exact selected next Result. `LOCAL_CORRECTION` keeps the same Result current and prepares a correction delta against its original frozen Execution Contract. `PLAN_CHANGE_REQUIRED` returns to `plan-run` for an accepted replacement Plan Baseline. `USER_DECISION` returns to the user. `DONE` and `FAILED` route to [finish-run.md](finish-run.md).

## Next consumer

[prepare-execution-contract.md](../results/prepare-execution-contract.md), `plan-run`, the user, or [finish-run.md](finish-run.md), as named by the Checkpoint.
