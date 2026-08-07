# Security And Publication Boundaries

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Adoption](README.md) / Security And Publication Boundaries

## Learning Objective

Treat authorization, sensitive context, production mutation, and external communication as project-controlled boundaries rather than capabilities implied by an agent architecture.

## Core Claim

HEAD coordination does not authorize action. Projects and human owners define credentials, access, mutation policy, external communication approval, and what may be published.

| Boundary | Required control |
| --- | --- |
| Credentials and authenticated access | Keep them in project-controlled systems; do not place them in shared Core, public examples, or worker briefs unless strictly necessary and authorized. |
| Private project context | Retrieve only the relevant canonical source under its project rules; do not copy it into public documentation or a broad worker context. |
| Production or destructive mutation | Require explicit project authorization and an appropriate approval boundary; an available tool does not confer permission. |
| External messages and publication | Treat sending or publishing as a separate approval boundary, with human direction for material content and audience impact. |
| Public documentation | Remove private product details, service or repository identities, schemas, internal paths, metrics, prompt bodies, operational data, and current task state. |

## Design Response

Put shared safety principles in the portable layer and enforce project-specific authorization through project policy and integration contracts. Use callable interfaces where runtime controls genuinely strengthen a safety boundary, not merely because a system can expose a tool.

## What This Does Not Guarantee

An agent can misread a policy, a project can configure an inadequate boundary, and a human can approve an unsafe action. Controls reduce particular risks; they do not remove accountability or the need for review.

## Common Misunderstanding

"Read-only" or "internal" automatically makes information safe to share. Sensitivity depends on the data, aggregation, audience, and project policy, not only on whether a single call mutates something.

## Takeaway

Keep access, mutation, publication, and material communication under project and human control. Architecture describes responsibility; it does not grant authority.

Previous: [Common Antipatterns](common-antipatterns.md) | Next: [Limitations](limitations.md)

Source classes: current public reference contracts; current shared principles.
