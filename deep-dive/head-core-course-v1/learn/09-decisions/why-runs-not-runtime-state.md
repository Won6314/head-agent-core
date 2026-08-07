# Why Runs, Not Runtime State?

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Decisions](README.md) / Why Runs, Not Runtime State?

## Problem

Durable work can be interrupted, compacted, or resumed in a different context. A system needs to preserve the original agreement without allowing a generated handoff or runtime pointer to redefine it.

## Attempted Alternative

Treat current task markers, snapshots, generated summaries, and live worker state as the authoritative account of what should happen next. Add discovery and fallback mechanisms to recover when one record is absent.

## Observed Failure

**Historical record.** Earlier designs accumulated state files, task packages, and recovery mechanisms. The current recovery contract deliberately replaced fallback selection with a small fixed canon.

**Operational observation.** Generated progress records are useful for retrieval but may omit constraints, compress unresolved work into completion, or preserve an old interpretation. A fallback can make recovery appear robust while selecting the wrong work agreement.

**Generalized failure.** After an interruption, a summary says a task is nearly done but omits a user constraint. Recovery treats the summary as authority, verifies the reduced target, and continues confidently in the wrong direction.

## Current Decision

For durable work, preserve a stable run as the user-HEAD agreement: purpose, scope, success conditions, decisions, structure, current situation, next result, evidence locations, and checklist. Keep session identity separate. Treat generated progress and history as fragile retrieval aids. Recovery starts from the fixed canonical records and explicitly retrieves supporting slices or evidence only when needed.

```text
User-HEAD agreement -> durable run -> recovery and continuation
Verified updates -> durable run
Fragile runtime records -> retrieval only, never authority
```

## Related Theory

**Related theory.** Source-of-truth design, event-sourcing boundaries, and immutable-agreement thinking explain why durable intent should not be overwritten by derived state. This is a conceptual mapping, not a claim that the system implements any one formal persistence model.

## Current Limitation

A run can still be poorly written, stale, or misunderstood. Fixed records do not recover missing external evidence, and a large run still requires judgment to resume. The user remains the authority for changing agreed direction.

## Takeaway

Keep the work agreement canonical outside model-managed state. Use runtime records to find context, never to silently rewrite the target.

Previous: [Why References, Not Context Dumps?](why-references-not-context-dumps.md) | Next: [Why General Rules, Not Deny Lists?](why-general-rules-not-deny-lists.md)

Source class: historical record from recovery evolution; operational observation; current run-canon contract; retrospective theory.
