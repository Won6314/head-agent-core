# User Talks Only To HEAD

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Ownership](README.md) / User Talks Only To HEAD

## Learning Objective

Understand why the user has one conversational and decision surface even when several workers contribute to the work.

## One Surface, One Accountable Owner

The user communicates direction, trade-offs, and material decisions to HEAD. HEAD carries that direction into the work model, delegates bounded execution when useful, and returns an integrated conclusion. A worker may surface evidence that changes the plan, but it does not independently negotiate the overall outcome with the user.

This avoids a familiar failure: different workers receive different fragments of intent, make locally reasonable interpretations, and produce results that cannot be reconciled without rediscovering the original decision.

```text
user direction -> HEAD's shared work model -> bounded worker result
                       ^                         |
                       +---- evidence and questions
```

## Generalized Failure

Several workers can each answer a question convincingly while relying on incompatible assumptions. The problem is not that a worker is incapable of useful reasoning. It is that no worker owns the full set of dependencies, trade-offs, and user decisions needed to choose among plausible answers.

The design response is not to hide worker evidence. HEAD makes the final composition accountable to one current work model and escalates material choices to the user.

## Retrospective Related Theory

**Related theory, retrospective:** this resembles a single accountable interface in systems design and a single point of coordination in hierarchical planning. Those labels explain the current arrangement; they are not presented as its original documented rationale.

## Common Misunderstanding

One user-facing owner does not mean HEAD must execute every task. It means delegation does not transfer responsibility for the whole outcome.

## Takeaway

Many contributors can improve execution. One accountable conversational owner preserves intent.

Previous: [Ownership](README.md) | Next: [High, Mid, And Low Abstraction](high-mid-low-abstraction.md)

Source class: current ownership and delegation contracts; generalized operational failure.
