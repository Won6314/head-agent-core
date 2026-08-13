# Finish Run

## Trigger

The saved-Planner Checkpoint is `DONE` or `FAILED` with no next horizon.

## Authority

The Checkpoint owns terminal judgment. The Runner records and applies it without repeating judgment.

## Produced result

Record the exact terminal decision and evidence references, set `next.horizon = null`, atomically update the semantic pointer when present, prepare the bounded Session handoff, and finish Run mode after the guarded runtime operation succeeds. The legacy adapter leaves legacy artifacts unmigrated.

## Next consumer

Session.
