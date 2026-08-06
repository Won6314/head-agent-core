# Recover Run

## Trigger

An active Run needs compact recovery.

## Exact reads

Read in this order:

1. shared Core and project additions;
2. Session `context.md`;
3. active `run.md`;
4. latest valid ledger record;
5. only the explicit current Slice named by that ledger.

Read an exact plan section or direct artifact only when it can change the current judgment. Do not load all planning generations, all Slices, or narrative history.

## Authority

`B` recovers identity and position from canon. The latest valid Run ledger governs current position; immutable `A` governs the agreed plan.

## Produced result

Identify the exact current result, its owner, observed state, unresolved blocker, and next phase file. If canon is inconsistent, stop and report the conflict instead of reconstructing a plausible state from memory.

## Mutation class

No mutation.

## Next consumer

The exact `start-run` or `delegate-task` phase named by recovered current position.
