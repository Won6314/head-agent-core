# Anchor Operations

## Trigger

An immutable anchor must be saved, clean materialized, loaded for a task, or used as the source of the mainline HEAD migration.

## Exact reads

Read only the active phase, the named source anchor, and the exact artifact named by that phase. Use `save_head` for immutable investigation anchor `a`, `load_head` for disposable task children or clean materialization, and `migrate_head` only for the final `P → B` ownership transfer. Do not recover an anchor or plan from transcript history.

## Authority

The current complete-context HEAD decides whether material is accepted. A candidate, reviewer, worker, or loaded child cannot promote itself or change the parent plan.

## Produced result

Apply these operations exactly:

1. `save_head` captures the current investigated HEAD as immutable `a`; it does not replace the caller.
2. `load_head` without `save_as` creates a disposable outline, part, whole-plan review, or final-package child. Its handoff or returned root is the child's result; no result schema or validator is added.
3. Load `a` with the exact Plan Contract and `save_as` to materialize each proposed `a′`. Load that exact saved proposal without `save_as` to produce the outline the user reviews. Approval selects the original accepted `a′`; a rejected proposal remains immutable and unused.
4. After `P` accepts a reviewer-generated whole plan, load the current generation anchor with that exact plan and `save_as` the next generation. The lineage is `a′ → a1 → a2 → …`; part and review children remain disposable.
5. After the user approves the final package produced by original `a′`, load that same original `a′` with the exact approved package and `save_as` to materialize `A`. Never source final `A` from an intermediate generation.
6. Do not use `save_as` for exploration, part decomposition, whole-plan review, final-package candidacy, or an unaccepted generation result. Proposed `a′` is the sole pre-review materialization because the user must judge an outline produced by that exact saved context.
7. Names are unique and immutable. The phase gives each saved name its conceptual meaning; the saved-HEAD runtime does not classify `a`, `a′`, generations, or `A` as role types. A rejected proposed name is not reused.
8. `load_head` never replaces its caller and has no persistent mode.
9. `migrate_head(A)` forks `A` once, then atomically replaces planning `P` in the same logical Session, Herdr tab, pane, terminal, and mainline control slot with execution successor `B`. It creates no second tab, does not consume `A`, and does not return until the migration is armed with an exact rollback target.
10. Canonical A-review checkpoints update Run canon and ledger; `B` only executes their selected horizons. Checkpoints do not create saved HEAD anchors.

## Mutation class

Saved-HEAD metadata, immutable anchor creation, disposable task forks, or one same-pane mainline HEAD migration. No product, code, production, or external mutation.

## Next consumer

The active phase receives the task handoff or saved identity. Migrated `B` next reads `../run/activate-run.md`.
