# Constructing a Knowledge Graph

[한국어](ko/README.md)

## A Graph That Is Used Must First Be Built

[Bring only the knowledge and relationships that are needed](../context-management/02-graph-research-context.md) explains why a graph produces a smaller research context than documents or similarity search. That argument assumes a graph already exists and is roughly correct.

That assumption is where most of the difficulty actually lives.

A graph can be wrong, it can be stale, and — the hardest case — it can be silently missing an entire part of the domain that nobody ever mapped. None of these announce themselves. A query against an incomplete graph does not fail. It returns a small, clean, confident answer.

> A graph never reports what it does not contain.

So construction is not preparation for the theory of use. It is a separate subject with its own invariants, and those invariants are what keep the graph worth querying at all.

## Two Axes

Product knowledge does not accumulate along one dimension. It accumulates along two, and they behave differently enough that treating them as one produces a graph that cannot answer either well.

```text
product axis (vertical)              operation axis (horizontal)
authority flows down only            time flows forward only

     Core                                 intent
      │ governs                             ↓
     Policy                               work
      │ governs                             ↓
     Feature ═════════════╪═════════════  release
      │ governs                             ↓
     Code ════════════════╪═════════════  measurement
                                            ↓
                                        next intent
```

The operation axis crosses the product axis at two heights: the feature, where work becomes something a person can name, and the revision, where a release becomes something a machine can verify.

They also differ in clock and in writing discipline.

```text
                        product axis            operation axis
update is triggered by  a new revision          an event occurring
written                 in batch, afterwards    at the moment
reconstructable later   yes — the source remains no — the event is gone
```

The last row is the reason the two cannot share one discipline. Code can be re-read at any time, so the product axis may be rebuilt from scratch whenever it drifts. A decision leaves no trace of itself, so the moment of deciding is the only moment it can be recorded.

## Two Directions on One Axis

The product axis is written from both ends. Decisions descend from the top. Observations of the implementation ascend from the bottom. Where they meet is not where the code attaches.

```text
        Core
          │ expressed by
        Policy  ←──── decisions stop here, and so does evidence
          │ applies to                              ↑
        Feature ←──── code attaches here            │ evidence ascends
          │                                         │
        Code  ──────────────────────────────────────┘
```

Attachment and judgment happen at different heights, and confusing them is the most common way a graph ends up unable to answer the question it was built for.

Which feature a piece of code belongs to is an address. It says where the code lives in product terms, and nothing more. Whether the implementation is correct cannot be asked of an address — it can only be asked against a promise. A feature is the name of something that exists; a policy is a commitment that was approved. Only a commitment can be broken.

> A graph that connects code to features is an index. Judgment needs a layer that can be violated.

Agreement is the ordinary outcome. Disagreement is not an update path — it is the signal that an invariant has been broken, and only a person can settle it. Almost every construction rule in this material follows from that one sentence.

It also means initial construction and later propagation are the same operation. Building the graph for the first time is the two directions meeting across the whole scope. Propagating a release is the two directions meeting across the changed scope. Only the scope differs.

## The Material

1. [What a graph is the authority for](01-authority-and-epistemic-class.md) — a graph earns authority only by keeping observation, decision, interpretation, hypothesis, and projection distinct.
2. [Two axes and where they cross](02-two-axes.md) — authority downward, time forward, and why one discipline cannot serve both.
3. [Where a person stands](03-human-gates.md) — there are only three gates, and only two of them block.
4. [Identity decides resolution](04-identity-and-resolution.md) — a graph cannot speak about anything smaller than its own identifiers.
5. [What machines produce and what judgment produces](05-deterministic-backbone.md) — verifying a citation and reproducing a verdict are different claims.
6. [Recording what is not known](06-unresolved-as-first-class.md) — a graph that buckets its failures conceals its own gaps.
7. [What descends and what ascends](07-descent-and-ascent.md) — preservation rules are consequences, not a checklist.
8. [Where a feature starts and where it stops](08-tracing-the-reachable-surface.md) — a feature is a path from an observable point, not a set of code it owns.
9. [How far to go](09-maturity-and-adoption.md) — precision beyond the scale of the subject leaves only cost.

Supporting material is kept out of the argument itself. [References](references.md) collects the prior art and tooling comparisons that these pages rely on, so the pages can stay about principles.

## What This Material Does Not Decide

It does not prescribe a storage schema, a node vocabulary, a query language, or a directory layout. Those follow from a project's subject and scale, and two projects can conform to everything here while sharing no labels.

It also does not cover the consuming side. How a question becomes a traversal, and how a traversal becomes prose an LLM can act on, belongs to [LLM Context Management](../context-management/README.md).

## Evidence Boundaries

These pages distinguish **operational observation** (behavior seen while running such systems, not a universal law), **generalized failure** (a public-safe reconstruction of a real breakage), and **related theory** (published work that explains a pattern after the fact). The labels limit what a claim establishes.

No private project context, credentials, production data, internal metrics, or instruction bodies appear here. Capability is not authorization: material direction, mutation, and publication decisions remain with human and project owners.

Start with [what a graph is the authority for](01-authority-and-epistemic-class.md).
