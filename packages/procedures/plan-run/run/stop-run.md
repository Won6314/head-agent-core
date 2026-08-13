# Stop Run

## Trigger

The user explicitly stops a nonterminal Run.

## Authority

Only the user may stop a nonterminal Run; this is neither terminal judgment nor permission to infer a new Result.

## Produced result

Record `USER_DECISION` with `STOPPED`, set no executable horizon, atomically update the semantic pointer when present and the thin Run index with the unresolved Result and re-entry condition, and transition to Session mode after the guarded runtime operation succeeds. The legacy adapter leaves legacy artifacts unmigrated.

## Next consumer

Session.
