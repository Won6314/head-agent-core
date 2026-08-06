# Checkpoint Run

## Trigger

`B` has completed `delegate-task/integrate-result.md` for the current result and must set the next meaningful Run position.

## Exact reads

Read immutable `A`, `run.md`, the originating Slice, the accepted integration decision, direct evidence references, and the latest valid ledger. Do not reload worker narrative or earlier ledgers by default.

## Authority

`B` owns the parent Run model and next position. The integration decision is evidence, not permission to silently change `A` or a user-owned decision.

## Produced result

1. Compare the accepted result with the whole outcome and the parent consumer named in the Slice.
2. Record expected state, observed state, direct evidence, `B`'s decision, and next position in one new ledger record.
3. Update only the compact route/current-position material in `run.md`; leave evidence bodies and chronology in referenced artifacts.
4. Preserve the route while evidence supports it. If field evidence disproves a material assumption, stop dependent mutation and return the decision rather than improving `A` locally.
5. Select the next coherent result and read `delegate-task/prepare-slice.md`, or read `finish-run.md` when the observable success conditions hold.

## Mutation class

Run canon and ledger update.

## Next consumer

`delegate-task/prepare-slice.md` for the next current result, or `finish-run.md`.
