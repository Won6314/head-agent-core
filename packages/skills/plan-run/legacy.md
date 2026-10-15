---
name: plan-run
description: >
  Durable Plan and Run work: an Accepted Plan Baseline carried through dependent bounded Results, checkpoint decisions, and Run recovery. Indexes one procedure per condition.
---

# Plan Run

`plan-run` carries an Accepted Plan Baseline through exact Result execution. The Planner owns the Plan and checkpoint judgment; the Runner only materializes and dispatches the selected Result or horizon.

## Authority flow

```text
Accepted Plan Baseline
→ Runner-authored Execution Contract
→ Worker Produced Result and Worker Report/Evidence
→ saved-Planner Checkpoint review
→ Runner applies the decision and prepares the next contract
```

Load one procedure for the current condition:

- Investigation is sufficient to preserve the whole problem as a Problem Baseline for planning: [capture-problem-baseline.md](../../procedures/plan-run/planning/capture-problem-baseline.md).
- The Planner needs a user-reviewable Plan Draft: [compile-plan-draft.md](../../procedures/plan-run/planning/compile-plan-draft.md).
- An accepted Plan Draft has Results that need decomposition or acceptance: [refine-result-graph.md](../../procedures/plan-run/planning/refine-result-graph.md).
- The complete Plan needs its accepted baseline and initial route: [accept-plan-baseline.md](../../procedures/plan-run/planning/accept-plan-baseline.md).
- An Accepted Plan Baseline must activate its Runner: [activate-runner.md](../../procedures/plan-run/planning/activate-runner.md).
- The Planner is preparing the compact Run canon: [initialize-run.md](../../procedures/plan-run/run/initialize-run.md).
- Independently ready Results need one dependency-safe horizon: [select-horizon.md](../../procedures/plan-run/results/select-horizon.md).
- The Runner needs an Execution Contract for one exact selected Result or a correction delta: [prepare-execution-contract.md](../../procedures/plan-run/results/prepare-execution-contract.md).
- Frozen Execution Contracts for the selected horizon are ready for workers: [dispatch-horizon.md](../../procedures/plan-run/results/dispatch-horizon.md).
- Worker Report/Evidence for a terminal horizon needs a saved-Planner Checkpoint Reviewer judgment: [review-checkpoint.md](../../procedures/plan-run/run/review-checkpoint.md).
- A saved-Planner Checkpoint decision needs mechanical application: [apply-checkpoint.md](../../procedures/plan-run/run/apply-checkpoint.md).
- An active Run needs its exact current position: [recover-run.md](../../procedures/plan-run/run/recover-run.md).
- The user stops a nonterminal Run: [stop-run.md](../../procedures/plan-run/run/stop-run.md).
- A Checkpoint is terminal: [finish-run.md](../../procedures/plan-run/run/finish-run.md).

When a selected planning procedure saves, loads, or migrates context, also read [context-anchor-operations.md](../../procedures/plan-run/planning/context-anchor-operations.md). When the Result owner is `coder`, read [coder.md](../../procedures/plan-run/workers/coder.md) with the selected Result procedure only.
