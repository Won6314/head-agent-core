# Anchor Operations

## Trigger

An immutable anchor must be saved, clean materialized, loaded for a task, or used as the source of the mainline HEAD migration.

## Exact reads

Read only the active phase, the named source anchor, and the exact accepted artifact named by that phase. Use `save_head` for immutable anchors, `load_head` for disposable task children or clean materialization, and `migrate_head` only for the final `P → B` ownership transfer. Do not recover an anchor from transcript history.

## Authority

The current complete-context HEAD decides whether material is accepted. A candidate, reviewer, worker, or loaded child cannot promote itself or change the parent plan.

## Produced result

Apply these operations exactly:

1. `save_head` captures the current investigated HEAD as immutable `a`; it does not replace the caller.
2. `load_head(mode = "task")` without `save_as` creates a disposable candidate or review child. Inspect its returned handoff before any acceptance.
3. After the parent has accepted an exact cumulative artifact, load the clean root with `mode = "task"` and `save_as` to materialize `a′`, an accepted generation, or `A`.
4. Never use `save_as` for exploration, comparison, review, or a child that still owns an unresolved judgment.
5. Names are unique and immutable. The phase gives each saved name its conceptual meaning; the saved-HEAD runtime does not classify `a`, `a′`, generations, or `A` as role types.
6. `load_head` never replaces its caller and has no persistent mode.
7. `migrate_head(A)` forks `A` once, then atomically replaces planning `P` in the same logical Session, Herdr tab, pane, terminal, and mainline control slot with execution successor `B`. It creates no second tab, does not consume `A`, and does not return until the migration is armed with an exact rollback target.
8. Normal `B` checkpoints update Run canon and ledger. They do not create saved HEAD anchors.

## Mutation class

Saved-HEAD metadata, immutable anchor creation, disposable task forks, or one same-pane mainline HEAD migration. No product, code, production, or external mutation.

## Next consumer

The active phase receives the task handoff or saved identity. Migrated `B` next reads `start-run/activate-run.md`.
