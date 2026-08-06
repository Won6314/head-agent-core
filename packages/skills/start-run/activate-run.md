# Activate Run

## Trigger

Execution successor `B` has replaced planning `P` in the same logical Session and Herdr pane after being forked directly from immutable `A`, which already contains valid Run canon, initial ledger, and first Slice.

## Exact reads

Read the runtime header, `A` identity carried by `B`, `run.md`, initial ledger, and first Slice. Do not load planning generations or rich planning history.

## Authority

`B` owns field preflight and the Run-mode transition. It may stop on contradictory field evidence but may not rewrite `A`. `plan-run/activate-B.md` alone owns the `P → B` migration.

## Produced result

1. Confirm this is a distinct OpenCode child of the named `A`, it occupies the same logical Session, Herdr tab, pane, and terminal formerly owned by `P`, `P` is no longer active, and the runtime remains in Session mode.
2. Perform only the bounded read-only checks needed to know that the initial route can safely start.
3. If evidence disproves a material assumption, do not mutate or activate. Return the direct evidence to the user or planning lineage.
4. Confirm `run.md`, initial ledger, and first Slice still agree with `A`.
5. Call `head_session(action = "start_run", run_id = "{runId}")` exactly once.
6. Treat the successful runtime transition as authority for active Run mode.

## Mutation class

Runtime Run-mode transition only.

## Next consumer

`delegate-task/dispatch.md` for the already prepared first Slice.
