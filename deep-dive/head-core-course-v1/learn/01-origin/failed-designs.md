# Failed Designs

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Origin](README.md) / Failed Designs

## Learning Objective

Understand why several reasonable mechanisms were later reduced or removed, and why a failed design can still contain a useful local insight.

## Core Claim

Most discarded mechanisms were not foolish. They solved the failure directly in front of them. They became harmful when their local fix was treated as a permanent universal layer.

## Resident Workers

### Why I Tried Them

A resident worker could preserve role-specific context, remain visible in a terminal, and continue a sequence of related tasks without startup cost.

### What Worked

The worker had a stable identity and could be addressed repeatedly. Long task sequences felt easier to monitor.

### What Failed

Resident contexts became stale, accumulated unrelated work, and diverged from the current HEAD understanding. Keeping many workers alive also increased process, routing, recovery, and configuration overhead.

### Current Decision

HEAD is resident because it owns continuity. Workers are one-shot because their context should last only as long as one bounded outcome.

## Large Task Packages

### Why I Tried Them

Context files, instruction files, plans, state JSON, and numbered step files made work explicit and recoverable. They were especially helpful when a task involved repetitive production across many artifacts.

### What Worked

Inputs and outputs were inspectable. Progress could be recorded outside the conversation. A failed phase could be repeated.

### What Failed

The package structure became a goal in itself. HEAD spent effort satisfying schemas, tracking phases, and updating pointers even when the work needed a simpler representation. Workers could optimize for step completion instead of the real outcome.

### Current Decision

Durable work uses one free-form run with an observable checklist. Optional slices add detail only where a coherent result benefits from separate ownership or recovery.

## Strict Command Schemas

### Why I Tried Them

Short, ambiguous commands produced unpredictable exploration. Validation rules enforced longer instructions, explicit edit patterns, and standardized summaries.

### What Worked

Obviously incomplete commands were rejected before reaching a worker. Transport and formatting became more consistent.

### What Failed

Syntactic completeness did not guarantee semantic correctness. A detailed command could still encode HEAD's wrong diagnosis. The stricter the schema became, the more it could suppress a worker's ability to discover the actual local solution.

### Current Decision

Define purpose, authority, boundaries, and observable result. Prescribe a protocol only when following that protocol is itself part of the result.

## Generated Recovery Commands

### Why I Tried Them

Early compact recovery often failed to reread the right files or reconstruct the current step. A self-contained injected command seemed safer than asking the model to rediscover its state.

### What Worked

Recovery became immediate and deterministic when the generated command was accurate.

### What Failed

The generated command was still a derivative summary. If it omitted the original scope or misclassified partial completion, the next session inherited the error as an instruction.

### Current Decision

Recovery loads the fixed session identity and full user-HEAD run agreement. Generated progress remains useful for search and handoff, but it cannot override the canon.

## Active Pointers And Fallback Selection

### Why I Tried Them

When multiple runs, slices, snapshots, and recovery records existed, automatic discovery promised to select the most relevant one.

### What Worked

The runtime could often resume without asking the user to identify a file.

### What Failed

Selection logic created hidden authority. A stale pointer, recent file, or plausible snapshot could silently displace the actual agreement. More fallback paths increased the number of ways to recover the wrong task.

### Current Decision

Use fixed paths for the canonical session files. If a fixed file is missing, omit it rather than infer a substitute.

## Many Specialized Agents

### Why I Tried Them

Role specialization promised better prompts, clearer expertise, and parallel execution.

### What Worked

Some outcomes genuinely benefited from a dedicated role and restricted evidence surface.

### What Failed

Agent definitions multiplied faster than stable ownership boundaries. Several roles differed mainly by accumulated instructions, and choosing among them became coordination work.

### Current Decision

Keep a small set of reusable outcome owners. Add a specialist only when its authority, evidence surface, and consumable result are meaningfully distinct.

## The Simplification Pattern

```text
observed failure
    -> local mechanism
    -> mechanism accumulates policy and state
    -> coordination cost becomes visible
    -> extract the durable principle
    -> remove the mechanism that no longer earns its cost
```

## Common Misunderstanding

Simplification does not mean returning to an unstructured single-agent chat. The current system is smaller because ownership and canon became clearer, not because the original problems disappeared.

## Takeaway

Mechanisms should remain only while they enforce a boundary that cannot be expressed more simply. The history of HEAD is as much a history of deletion as addition.

Next: [Evolution Timeline](evolution-timeline.md)

Source class: historical architecture documents, repository evolution, and current runtime contracts.
