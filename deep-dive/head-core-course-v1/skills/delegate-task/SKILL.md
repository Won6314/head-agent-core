---
name: delegate-task
description: Delegate one or more coherent outcomes to worker agents with the smallest complete context needed for independent, composable execution.
---

# Delegate Task

Delegation transfers ownership of one result, not a list of disconnected actions.

## Shape The Outcome

A worker brief and its referenced sources make these meanings clear:

- the result to produce and why it matters
- authoritative starting inputs and locked decisions
- the worker's ownership boundary and role in the larger structure
- the behavior, artifact, or state the parent work will consume

Give the worker the smallest complete context that supports those decisions. Keep broad project history, unrelated failures, and generic process outside the brief. Preserve technical autonomy inside the defined outcome.

For complex work, pass a single slice file and reference the parent run rather than duplicating it in the command. A short command is sufficient when the outcome is already clear without a durable brief.

## Schedule By Composition

Start outcomes together when they have independent ownership, ready inputs, and compatible output contracts. Sequence an outcome when it consumes another outcome's result or shares a mutation surface that requires one owner.

Prefer one worker for diagnosis, implementation, and direct outcome evidence within the slice. Use an independent reviewer only when separate judgment can materially change a consequential result.

## Integrate

When a worker completes, read its result and compose it into the parent run. Reopen the slice when the returned evidence is missing, contradictory, or changes the parent structure; otherwise continue from the produced outcome rather than repeating the worker's work.
