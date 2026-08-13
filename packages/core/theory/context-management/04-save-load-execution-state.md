# Semantic Run Recovery and Checkpoint Judgment

[Contents](README.md) · [한국어](ko/04-save-load-execution-state.md)

A semantic Run recovers its exact position without making a canonical execution-state snapshot or complete change ledger.

`run.json` is a machine-only pointer file. It contains only format and identity plus paths to the human-readable `run.md`, latest Checkpoint, and current Execution Contracts. Recovery resolves exactly those regular files and fails closed on an invalid pointer, path escape, or malformed content.

```text
pointer-only run.json
→ run.md + latest Checkpoint + current Contracts
→ exact next Execution Contract
```

The Runner authors each Execution Contract before dispatch. Its frozen content gives the Worker the Result's authoritative inputs, output, consumer, mutation/preservation boundary, and representative proof. The Worker returns a Produced Result with Worker Report/Evidence.

The saved Planner receives `runPointerFile`, frozen Contracts, and Worker Report/Evidence for Checkpoint review. It does not receive a Plan file: the saved Planner already owns the Accepted Plan Baseline. Evidence supports Plan-level judgment; the Planner inspects artifacts, Git, or logs only when needed to resolve insufficient or contradictory evidence or confirm current state.

Checkpoint application advances the pointer to the next Contract, a correction delta, or terminal `DONE`/`FAILED`. Grandfathered legacy Runs continue through legacy recovery and are not automatically migrated. Legacy compatibility is a recovery boundary, not a second semantic model.
