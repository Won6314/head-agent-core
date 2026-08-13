# From Problem Definition to Accepted Plan Baseline

[Contents](README.md) · [한국어](ko/03-save-load-plan-context.md)

Planning starts with a Problem Definition: current state, needed state, real consumer, and authoritative facts. The Planner makes each Goal observable and records the Evidence by which that consumer can accept it.

```text
Problem Definition
→ Goals/Evidence
→ material alternatives and user decision
→ Selected Solution
→ consumable Result Graph
```

Alternatives that materially change product, policy, architecture, cost, workflow, or external action return to the user. Once selected, the solution records locked decisions and preservation boundaries.

The Result Graph splits only where a next consumer can independently use an output. Each Result has authoritative inputs, observable output, consumer, acceptance and representative-evidence boundary, dependencies, and mutation/preservation boundary. Direct work is selected when proof remains connected to HEAD; one-shot delegation when a Result can return independently; a durable Run when dependent Results need checkpoints or recovery.

The Accepted Plan Baseline is the Planner's authority for those relationships and material decisions. It is not a transcript of planning. A material Plan change requires a newly accepted Planner anchor before execution continues.

For a semantic Run, the Runner turns the selected Result into an Execution Contract. The Worker returns a Produced Result and Worker Report/Evidence. The saved Planner judges the Result at a Checkpoint. A Developer owns local solution method inside the contract; a Coder materializes a fully decided observable contract.
