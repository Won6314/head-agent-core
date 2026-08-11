# Finish Run

## Trigger

Canonical A review has returned `DONE` or `FAILED` with no next horizon.

## Exact reads

Read the active immutable execution authority, `run.md`, the latest valid ledger, the exact canonical terminal A-review decision, and its referenced artifacts and evidence.

## Authority

Canonical A review owns terminal judgment. This phase records and applies that decision; neither `B` nor worker completion can replace it.

## Produced result

1. Confirm that the canonical A-review decision is terminal and names no next horizon; do not repeat its judgment.
2. Record the exact `DONE` or `FAILED` decision, its evidence references, and `next.horizon = null` in the terminal ledger.
3. Prepare a bounded Session handoff from that canonical decision, preserving its result, constraints, and real remaining follow-up without adding a new interpretation.
4. Call `head_session(action = "finish_run", run_id = "{runId}", session_handoff = "{handoff}")`.
5. Return to Session only after the transition succeeds.

## Mutation class

Run ledger update and runtime Session-mode transition.

## Next consumer

Session after the transition succeeds.
