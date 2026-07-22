# Why Not One Agent?

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Decisions](README.md) / Why Not One Agent?

## Problem

A single conversation can be enough for small, local work. It becomes harder to trust when it must hold user direction, broad evidence, specialist execution, and its own review across a long, changing outcome.

## Attempted Alternative

Keep all planning, execution, and review in one long-lived agent context. This appears simple: one owner has all prior discussion and can move from question to result without handoff.

## Observed Failure

**Historical record.** Early design material described context growth, role confusion, and sequential bottlenecks as reasons to separate specialized work. It also recorded the expectation that agents could receive focused inputs and produce defined outputs.

**Operational observation.** When the same context both produces a result and decides whether it is adequate, stale assumptions can persist into review. Longer work also makes unrelated history compete with the evidence needed for the next decision.

**Generalized failure.** A generalist agent plans a small release, implements one part, then reviews it using the same incomplete interpretation. A later request changes a constraint, but the old interpretation remains more prominent in context. The review confirms internal consistency rather than checking the changed target.

## Current Decision

Keep one resident HEAD responsible for the whole outcome, but permit bounded workers to own coherent execution results. HEAD retains user direction, evidence selection, integration, and final judgment. A worker receives only the subset needed to produce and check its result; independent review is used when separate judgment can materially change a consequential outcome.

This is not a rule to delegate every task. HEAD may work directly when delegation adds more coordination cost than value.

```text
User direction -> HEAD holds whole outcome -> bounded worker produces one result
                         ^                         |
                         +---- verifies and integrates
```

## Related Theory

**Related theory.** Separation of duties and control-plane versus execution-plane design help explain this split. They are retrospective lenses: the historical record establishes the observed coordination problem, not that these theories were the original design vocabulary.

## Current Limitation

HEAD remains a concentration point for judgment and can still misunderstand the user or select weak evidence. The split also adds handoff cost. It is justified only when focused ownership or independent challenge improves the result.

## Takeaway

Do not mistake a single context for a complete control system. Keep whole-outcome judgment with one accountable owner, and separate bounded execution or review when that improves confidence.

Previous: [Operation](../08-operation/README.md) | Next: [Why Not An Autonomous Swarm?](why-not-an-autonomous-swarm.md)

Source class: historical record from archived system design; operational observation; current shared principles; retrospective theory.
