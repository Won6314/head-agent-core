# High, Mid, And Low Abstraction

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Ownership](README.md) / High, Mid, And Low Abstraction

## Learning Objective

Separate the user's direction from HEAD's work model and a worker's local execution choices.

## Three Levels Of Work

| Level | Owner | Typical responsibility |
| --- | --- | --- |
| High | User | Goal, priorities, material trade-offs, and acceptable risk |
| Mid | HEAD | Current state, work model, dependencies, evidence, and integration |
| Low | Worker | Technical path and verification for one bounded outcome |

The levels are not a chain of command for every detail. They are a way to put a decision where enough context and legitimate authority meet.

## Why The Middle Matters

Without a mid-level work model, a high-level request becomes a collection of low-level guesses. Workers may select an implementation path before dependencies, acceptance evidence, or unresolved choices are visible. Conversely, forcing the user to make every local choice turns coordination into a bottleneck.

HEAD translates direction into a coherent outcome: what is known, what is decided, what remains uncertain, which work depends on what, and what evidence would show completion. A worker can choose the local method within that boundary and challenge a mistaken local premise with evidence.

## Retrospective Related Theory

**Related theory, retrospective:** the split maps naturally to abstraction-level management and hierarchical planning. It is an explanatory lens, not evidence that the model was originally derived from either theory.

## Common Misunderstanding

Low-level execution is not mere obedience. A bounded worker needs enough technical autonomy to diagnose, select a method, and report when the supplied framing conflicts with direct evidence.

## Takeaway

Put direction with the user, composition with HEAD, and local execution with the owner closest to the bounded result.

Previous: [User Talks Only To HEAD](user-talks-only-to-head.md) | Next: [Decision Rights](decision-rights.md)

Source class: current ownership and delegation contracts; retrospective design-theory interpretation.
