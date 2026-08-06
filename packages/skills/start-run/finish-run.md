# Finish Run

## Trigger

The Run agreement and success conditions are satisfied by actual artifacts or observable state.

## Exact reads

Read immutable `A`, `run.md`, the latest valid ledger, the terminal result artifacts, and direct representative primary-path evidence.

## Authority

`B` owns terminal judgment. Tests, reviews, and worker completion are supporting evidence rather than completion authority.

## Produced result

1. Confirm the agreed outcome and every observable success condition in actual artifacts or state.
2. Confirm at least one representative primary path reached the intended consumer.
3. Record a terminal ledger with observation, evidence, decision type `DONE`, and `next.slice = null`.
4. Prepare a bounded Session handoff containing completed result, preserved constraints, and any real remaining follow-up.
5. Call `head_session(action = "finish_run", run_id = "{runId}", session_handoff = "{handoff}")`.
6. Return to Session only after the transition succeeds.

## Mutation class

Run ledger update and runtime Session-mode transition.

## Next consumer

Session after the transition succeeds.
