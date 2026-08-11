# Stop Run

## Trigger

The user explicitly stops an active nonterminal Run and requires Session mode without declaring the Run successful or failed.

## Exact reads

Read the active immutable Plan authority, `run.md`, the latest valid ledger, the exact user stop decision, and the current result/horizon references needed for a bounded resumable handoff.

## Authority

Only the user may stop a nonterminal Run. This is not `DONE`, `FAILED`, cancellation of preserved evidence, or permission to infer a new result. `finish_run` remains terminal-only.

## Produced result

1. Record one latest ledger decision with `decision.type = "USER_DECISION"`, `decision.status = "STOPPED"`, and `next.slice = null`.
2. Update only compact `run.md` current-position material: stopped before completion, no executable horizon, preserved accepted results, exact unresolved current result, and explicit re-entry condition.
3. Prepare a bounded Session handoff that preserves the Plan identity, latest checkpoint, accepted results, unresolved result, constraints, and exact resume gate without claiming completion.
4. Call `head_session(action = "stop_run", run_id = "{runId}", session_handoff = "{handoff}")`.
5. Return to Session only after the guarded transition succeeds. A failed transition leaves Run mode authoritative.

## Mutation class

User-authorized stopped ledger/canon update and runtime Session-mode transition. No production mutation or terminal success/failure judgment.

## Next consumer

Session after the transition succeeds. Resuming the stopped Run requires an explicit Session decision and exact canon re-entry.
