# Index, Not Payload

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Context](README.md) / Index, Not Payload

## Learning Objective

Use an index to locate authority without copying the authority into every prompt.

## An Index Is A Map, Not A Substitute

A project index identifies where kinds of facts, policies, and capabilities are owned. It gives HEAD a retrieval route. It does not become the full policy, evidence record, or source of truth merely because it names one.

```mermaid
flowchart LR
    I[Project index\nwhere authority lives] --> H[HEAD]
    H --> S[Canonical source]
    S --> J[Judgment for current outcome]
```

This distinction prevents copied summaries from quietly becoming more trusted than the source they summarize. It also lets the index remain compact while canonical documents change under their own owners.

## Design Response

Keep a maintained map of authority and retrieve the source that answers the present question. The rejected alternative is embedding document bodies in the index or duplicating them across prompts. Duplication creates drift: a reader may see two versions without knowing which one governs.

## Retrospective Related Theory

**Related theory, retrospective:** this is analogous to indirection and source-of-truth design. The mapping is explanatory rather than a claim about the design's original vocabulary.

## Common Misunderstanding

An index is not a guarantee that a source is current, complete, or applicable. HEAD still judges whether to retrieve it and verifies mutable facts before action.

## Takeaway

Put routes to authority in the working set; keep the authority itself in its owned canonical location.

Previous: [Always Loaded Vs. Retrieved](always-loaded-vs-retrieved.md) | Next: [Shared Vs. Project Context](shared-vs-project-context.md)

Source class: current shared Core principles and context-management architecture.
