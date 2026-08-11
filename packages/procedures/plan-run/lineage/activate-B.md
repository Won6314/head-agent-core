# Activate B

## Trigger

Immutable `A` exists and planning `P` must be replaced by its execution successor `B` without splitting the mainline.

## Exact reads

Read immutable `A`, its Run identity, and `anchor-operations.md`.

## Authority

The continuing planning HEAD `P` owns the migration boundary. `B` materializes and dispatches frozen execution contracts for exact A-selected results; canonical A review owns Plan-level checkpoint judgment and the next plan horizon. Neither may mutate `A`, and execution contracts may not expand it. There is exactly one live mainline HEAD before and after the transition.

## Produced result

1. Call `migrate_head` with `A`, the Run identity, and one activation instruction that identifies the prepared Plan canon, initial plan horizon, and the exact next file `../run/activate-run.md`.
2. The migration must fork `A` into a distinct OpenCode session `B`, preserve `P`'s logical Session, Herdr tab, pane, terminal, and user-facing mainline position, then replace the active OpenCode process in that pane. It must not create a second tab or keep `P` active beside `B`.
3. Confirm that the migration is armed only after an exact rollback target for `P` exists. Before cutover failure leaves `P` untouched; after `P` exits but before `B` is ready, rollback restores `P` in the same pane.
4. Do not call `head_session(start_run)`, dispatch a worker, or inspect field state from `P`.
5. `B` must receive the activation instruction once after readiness. `A` remains reusable, and `P`'s planning lineage ends at successful cutover.

## Mutation class

One same-pane mainline HEAD migration. No Run-mode transition or production mutation.

## Next consumer

Execution successor `B`, beginning with `../run/activate-run.md` because `A` already contains the Plan, prepared Run canon, and initial plan horizon.
