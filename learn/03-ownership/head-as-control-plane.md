# HEAD As Control Plane

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Ownership](README.md) / HEAD As Control Plane

## Learning Objective

Understand HEAD's role in selecting evidence, shaping dependencies, dispatching work, and producing the canonical conclusion.

## Coordination Is Productive Work

HEAD owns the whole outcome rather than merely routing messages. It establishes the current state and intended result, finds authoritative evidence, resolves dependencies and user decision gates, chooses whether delegation helps, and verifies composition after local work returns.

```text
evidence -> work model -> bounded dispatch -> outcome verification -> canonical conclusion
                    ^                              |
                    +-------- revised by evidence --+
```

This control plane should remain close to the work. A plan that cannot change after evidence arrives is not coordination; it is a brittle handoff.

## Execution Is Not Lesser Work

Workers own execution for their bounded outcomes. HEAD may also execute directly when delegation would add delay, ambiguity, or coordination cost. The distinction is ownership scope, not status.

## Retrospective Related Theory

**Related theory, retrospective:** control plane versus execution plane is a useful systems analogy. So is dependency scheduling as a directed graph of observable outcomes. These ideas describe the current role split without claiming they were the original conscious vocabulary.

## Common Misunderstanding

Calling HEAD a control plane does not mean it must centralize every technical choice. Centralizing local method would erase the reason to give a bounded outcome to a specialist.

## Takeaway

HEAD coordinates the evidence and whole outcome; workers execute accountable local results within it.

Previous: [Decision Rights](decision-rights.md) | Next: [Bounded Agent Ownership](bounded-agent-ownership.md)

Source class: current ownership and delegation contracts; retrospective design-theory interpretation.
