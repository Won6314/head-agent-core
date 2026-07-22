# Why Outcomes, Not Step Lists?

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Decisions](README.md) / Why Outcomes, Not Step Lists?

## Problem

Work must be small enough to own and verify, while still leaving room for technical judgment. A list of actions can create activity without guaranteeing a usable result.

## Attempted Alternative

Split work into a fixed sequence of micro-steps and judge progress by whether each instruction was performed. This makes dispatch and monitoring look precise.

## Observed Failure

**Historical record.** Earlier materials described phase and step-oriented coordination, including detailed task packages and progress tracking. Later current guidance explicitly favors independently observable outcomes over a fixed sequence of phases.

**Operational observation.** A step list often freezes an early diagnosis. It can separate investigation, implementation, and verification even when they must inform one another. Completing every listed action can therefore conceal that the intended behavior still fails.

**Generalized failure.** A worker is told to change a configuration, add a test, and report completion. The configuration is no longer the cause of the observed issue, but the worker completes the list. The report is accurate about actions and unhelpful about the outcome.

## Current Decision

Delegate one coherent, independently observable result. State why it matters, its authoritative inputs and locked decisions, its boundary, and the evidence that will show completion. Keep diagnosis, implementation, and direct verification with one owner when they form a tight loop. Split only where outputs, expertise, dependencies, or mutation surfaces genuinely separate.

```text
Step list: action 1 -> action 2 -> action 3 -> claimed completion
Outcome:   evidence -> informed action -> observed result -> verified completion
```

## Related Theory

**Related theory.** Goal-oriented design and single-responsibility thinking clarify the distinction: responsibility is meaningful when it names a result that can be assessed, not merely a sequence of motions. This theory is explanatory, not a required template.

## Current Limitation

Some work must follow a fixed protocol, especially where order itself is part of safety or correctness. Outcome orientation does not remove that requirement; it makes protocol adherence one part of the observable result.

## Takeaway

Ask one owner for a result that can be observed. Use steps only when they serve that result or when the protocol itself is the result.

Previous: [Why Workers Are One-Shot](why-workers-are-one-shot.md) | Next: [Why References, Not Context Dumps?](why-references-not-context-dumps.md)

Source class: historical record from earlier coordination patterns; operational observation; current delegation principles; retrospective theory.
