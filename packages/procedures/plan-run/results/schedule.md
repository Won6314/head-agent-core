# Schedule

## Trigger

Multiple plan results are ready and need one dependency-safe plan horizon.

## Exact reads

Read only the ready plan results being considered together and their exact inputs, interfaces, outputs, owner classes, dependencies, and mutation surfaces.

## Authority

The final planning HEAD or canonical A review decides readiness and owns the plan horizon. `B` cannot schedule work. Parallelism cannot create independence; connected decisions, shared mutable state, or output dependencies remain sequenced.

## Produced result

1. Exclude any result whose Plan-level input, contract, owner class, consumer, or representative primary-path result is not complete.
2. Defer results that consume a predecessor artifact that does not yet exist.
3. Sequence results that consume one another, may revise a shared decision, or touch the same mutation surface.
4. Put every remaining independent ready result into one plan horizon, including a one-result horizon for checkpoint-governed execution.
5. Return the exact plan horizon. During execution, `B` materializes and freezes one execution contract per result before `frozen_wave`; only its validated aggregate advances to A review.

## Mutation class

Run scheduling state update.

## Next consumer

Before final `A`, the accepted plan horizon returns to `../lineage/finalize-A.md`. During execution, canonical A review sends the selected horizon to `prepare-slice.md`.
