# Hypotheses We Rejected

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Evolution](README.md) / Hypotheses We Rejected

## Core Claim

These hypotheses were not rejected because their mechanisms are always useless. They were rejected as default explanations or default architecture because the available evidence did not support their promised general benefit.

| Hypothesis | What changed | Current response |
| --- | --- | --- |
| More agents improve work | More ownership boundaries also create handoffs and coordination cost. | Use one resident coordinator and one bounded worker only when delegation earns its cost. |
| More tools improve capability | A larger callable surface adds choice, schema, and maintenance burden. | Keep interfaces that enforce a real boundary; use on-demand procedures for ordinary retrieval. |
| More context improves judgment | Broad context can be stale, conflicting, or irrelevant. | Give each owner the smallest complete authoritative set. |
| Graph-first retrieval saves tokens | Direct search could be cheaper for some code questions. | Retrieve by evidence need, not by storage shape. |
| Stricter schemas prevent failure | Rigid formats can encode an incorrect workflow and force needless ceremony. | Preserve required information while allowing task-appropriate structure. |
| More recovery fallbacks improve resilience | Selection logic can elevate the wrong record after interruption. | Recover from a small fixed authority set; omit missing records without substitution. |

## More Agents

**Historical record.** Early designs intentionally created many specialist roles to isolate context and support parallel work. That design preserved a coordination role because some results still needed integration.

**Operational observation.** A worker is useful when one owner can carry a coherent result through execution and direct evidence. Splitting a result further can introduce handoffs that cost more than the specialization returns.

**Current decision.** The system does not treat a worker swarm as a default. The coordinator may work directly or delegate one bounded result, then verifies and integrates it.

## More Tools

**Historical record.** Tooling expanded to standardize dispatch, state handling, retrieval, and recovery. Later architecture records narrowed the default callable surface and moved ordinary read-heavy procedures behind on-demand guidance.

**Operational observation.** Tools are most valuable when they enforce a safety boundary, carry necessary session semantics, or provide a capability not otherwise available. A tool that merely exposes ordinary retrieval can add persistent complexity without equivalent control.

**Current decision.** Choose the least complex interface that preserves the required boundary. Tool count is not a capability metric.

## More Context

**Historical record.** Earlier recovery and operating designs injected increasingly broad context and background material to guard against lost state.

**Operational observation.** Additional material can compete with the current outcome, introduce stale assumptions, and obscure which source has authority. A summary can also faithfully preserve the wrong conclusion.

**Current decision.** Keep broad knowledge indexed and retrieve it deliberately. Give workers only the authoritative context needed for their bounded result.

## Graph-First Token Savings

**Operational observation.** Comparative work did not support graph-first retrieval as a general token-saving approach for code investigation. Direct search could be more direct, while a graph-shaped layer carried setup and exploration overhead.

**Current decision.** The question determines the retrieval path. Connected retrieval remains useful where it links a question to evidence unavailable in the immediate code surface; it is not a mandatory first step.

## Stricter Schemas

**Historical record.** Earlier designs used detailed command formats and prescribed task structures to make work more uniform and recoverable.

**Operational observation.** A format can ensure fields are present without ensuring the fields represent the real work. A rigid format can also turn an ordinary task into a protocol exercise.

**Current decision.** Preserve the information required for a durable agreement, but do not force every outcome into one heading layout or process template.

## More Recovery Fallbacks

**Generalized failure.** After a lossy compaction, several plausible records can exist: a summary, a progress note, a pointer, and a snapshot. If recovery selects among them, it may reproduce a narrowed or incorrect interpretation as though it were authority.

**Historical record.** The failure analysis proposed a multi-record repaired contract at the time. That was an intermediate historical response, not the current design. Later evidence and current runtime documentation reduced recovery to fixed canonical records, with no inferred replacement when one is absent.

**Current decision.** Recovery starts from the durable user-coordinator agreement, not the most convenient available runtime state.

## Common Misunderstanding

"Rejected" does not mean "forbidden." Each mechanism can be appropriate inside a concrete, evidenced boundary. The rejected claim is that adding it by default improves the system.

## Takeaway

Reject the universal claim, not necessarily the local capability.

Previous: [Timeline](timeline.md) | Next: [What Survived Testing](what-survived-testing.md) | Chapter exit: [Adoption](../11-adoption/README.md)

Source classes: historical record; operational observation; generalized failure.
