# What Compaction Loses

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Canon](README.md) / What Compaction Loses

## Learning Objective

Recognize the kinds of work-critical meaning a compact summary can change or omit.

## A Summary Is A New Representation

Compaction reduces a long interaction to a shorter representation. It can be useful for a handoff, but reduction changes what is available for later judgment. A summary may omit a constraint, merge separate decisions, describe a partial result as completion, or silently move the verification target from the whole outcome to the work it happened to mention.

```text
Full agreement: problem + goal + scope + success conditions + decisions
                              |
                              v
                       compact summary
                              |
                    may omit or reinterpret
                              v
                 different effective work target
```

The risk is not that every summary is wrong. The risk is that an apparently plausible summary cannot prove it retained every boundary that makes the original agreement meaningful.

## Design Response

Keep the complete user-HEAD agreement in a durable run record outside the compact output. Use the compact output to update retrieval records, then resume from the fixed agreement and explicitly retrieve detailed evidence when necessary.

The rejected alternative is to treat a well-written summary as a replacement for the agreement. Its apparent completeness is not a verification of scope preservation.

## Common Misunderstanding

More detailed compaction does not turn a summary into canon. Detail can improve retrieval, but authority comes from the source that records the user-approved work, not from the length of a later restatement.

## Takeaway

A compact summary can describe progress; it cannot establish the original target that progress must serve.

Previous: [Canon](README.md) | Next: [Fixing The Problem And Goal](fixing-the-problem-and-goal.md)

Source class: operational observation; current shared recovery contract.
