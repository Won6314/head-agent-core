# Separating Shared And Project

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Adoption](README.md) / Separating Shared And Project

## Learning Objective

Keep reusable behavior portable while retaining project facts, authority, and risk decisions with the people who own them.

## Core Claim

Shared guidance states how HEAD reasons and composes work. The project layer states what is true, allowed, and authoritative in one setting. Mixing them makes both less trustworthy.

| Layer | Owns | Does not own |
| --- | --- | --- |
| Shared Core | Portable ownership, context, work-model, canon, and verification principles | Domain policy, repository details, current work, or credentials |
| Shared skills, MCPs, and Agents | Reusable procedure, callable contract, or role boundary | Project routing, local approvals, specialist facts, or private integrations |
| Project Core and index | Local authority, constraints, canonical sources, and retrieval routes | A rewritten universal Core |
| Project extensions | Domain workflows, integrations, overlays, and specialists | Unrelated shared behavior |
| User | Material direction and final choices about product, policy, architecture, cost, risk, and workflow | Routine execution detail that has been safely delegated |

## Publication Boundary

Publish a shared artifact only if its trigger, authority boundary, procedure or contract, and expected result still make sense after removing project facts. Otherwise, it stays project-owned. A public reference should explain the boundary without reproducing private instructions, prompt bodies, schemas, paths, credentials, operational data, or current task state.

## Design Response

An index is often better than a context dump: it directs HEAD to the current canonical source when a question matters. This keeps private knowledge governed by its project owner and reduces stale duplication.

## Related Theory

This is a retrospective application of separation of concerns and bounded context. Those ideas clarify the division; they do not prove that any particular division is complete or correct.

## Common Misunderstanding

"Shared" does not mean "safe to publish." Reusability and publication safety are separate tests. A generic-looking instruction can still reveal a private operating model or capability.

## Takeaway

Put portable behavior in the shared layer and keep local facts, authority, and publication decisions with the project and its human owners.

Previous: [Minimal Adoption](minimal-adoption.md) | Next: [Maturity Levels](maturity-levels.md)

Source classes: current public reference contracts; related theory.
