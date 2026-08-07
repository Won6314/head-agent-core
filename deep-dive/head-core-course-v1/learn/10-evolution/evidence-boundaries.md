# Evidence Boundaries

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Evolution](README.md) / Evidence Boundaries

## Core Claim

An evidence label does not make a claim stronger or weaker. It tells the reader what kind of confidence the claim can bear and prevents later interpretation from being presented as original fact.

## Source Classes

| Source class | What it supports | What it does not support |
| --- | --- | --- |
| Historical record | What an archived design, repository change, or current public contract says was built or decided | A universal performance claim or an unstated motive |
| Operational observation | A bounded pattern seen while the system was used or compared | A general law about all models, tools, or teams |
| Generalized failure | The causal structure of a public-safe reconstructed incident | Private facts, identities, measurements, or exact implementation detail |
| Related theory | A vocabulary for interpreting a design pattern | A claim that the theory caused the historical design |

## How This Chapter Uses Them

### Repository Evidence

**Historical record.** Repository history documents early specialization, structured coordination, context injection, recovery changes, and later reductions in Core and planning guidance. Current public contracts document the present ownership, context, and recovery model.

Use this class for statements such as "an earlier design used a more structured recovery path" or "the current shared guidance uses principles." Do not use it to claim that a change improved every task unless the record directly demonstrates that scope.

### Operational Observations

**Operational observation.** Comparative and day-to-day operating records show that direct search can outperform graph-first retrieval for some code questions, that broad context can create overhead, and that tool reduction does not automatically reduce all cost.

These observations are intentionally conditional. They change the default decision, not the possible value of the rejected mechanism in every setting.

### Generalized Failure Stories

**Generalized failure.** The compaction story in this chapter preserves one causal lesson: a lossy summary and derived progress state can displace the original agreement, allowing validation to check a reduced target. It removes identities, operational systems, records, measurements, and implementation particulars.

The archived incident also contained a proposed repair sequence. This chapter describes that sequence only as an intermediate historical response, because it is not the current recovery contract.

### Retrospective Theory

**Related theory.** Concepts such as control planes, bounded context, least authority, decision rights, and iterative systems design help explain the final shape. They are useful only when the page says that they are retrospective interpretation rather than evidence of original intent.

## Reader Checklist

Before relying on a claim, ask:

1. What source class is this?
2. Does the claimed scope exceed what that class supports?
3. Is a generalized story being mistaken for a private incident report?
4. Is theory being used to explain evidence, or to replace it?
5. Does the current public contract still support the conclusion?

## Public Boundary

This learning chapter deliberately omits project identities, product scenarios, service names, internal locations, schemas, experiment identifiers, private measurements, and instruction bodies. It teaches decision structure rather than reproducing operational material.

## Takeaway

Evidence discipline is part of the architecture: it keeps a useful lesson from turning into an overstated origin story or a copied private implementation.

Previous: [Simplification After Complexity](simplification-after-complexity.md) | Next: [Adoption](../11-adoption/README.md) | Chapter exit: [Adoption](../11-adoption/README.md)

Source classes: historical record; operational observation; generalized failure; related theory.
