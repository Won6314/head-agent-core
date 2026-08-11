# Recover Run

## Trigger

An active Run needs compact recovery.

## Exact reads

Read in this order:

1. shared Core and project additions;
2. Session `context.md`;
3. active `run.md`;
4. latest valid ledger record and its canonical A-review decision when one exists;
5. only the explicit current horizon and Slices named by that ledger;
6. a terminal horizon's aggregate and actual-state references only when A review is pending.

Read an exact plan section or direct artifact only when it can change the current judgment. Do not load all planning generations, all Slices, or narrative history.

## Authority

The active immutable execution authority governs the plan and its latest canonical review governs the accepted checkpoint and next position. `B` may recover an exact executable horizon but may not reconstruct or choose one.

## Produced result

Identify the exact current position and route directly: an A-selected plan result without a materialized frozen execution contract returns to `../results/prepare-slice.md`; an already materialized unfinished horizon returns to `../results/dispatch.md`; a terminal horizon without canonical review returns to `review-checkpoint.md`; an accepted next plan horizon returns to `../results/prepare-slice.md`; a terminal A decision returns to `finish-run.md`. If canon is inconsistent, stop and report the conflict instead of reconstructing a plausible state from memory or `B` context.

## Mutation class

No mutation.

## Next consumer

The exact run or result branch named by recovered current position.
