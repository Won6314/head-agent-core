---
name: delegate-task
description: Do not use for Session one-shots; load only from start-run or an active Run to select the worker and compile the current owner-specific Run contract.
---

# Delegate Task

Use this procedure from `start-run` for the first Run outcome and after each checkpoint for the next one. One-shot delegation uses `delegate-once`.

## Select The Worker

1. Select the worker before writing the owner-specific Slice or execution contract.
2. For implementation, select `coder` and load `delegate-coder`.
3. Otherwise use the selected worker's applicable contract.

## Shape The Subordinate Result

1. Re-anchor on the whole Run outcome and the current result's role in it.
2. Define one behavior, artifact, or state the parent can consume directly.
3. Fix the worker's authority boundary and keep local judgment inside it.
4. State conflicts that must return to HEAD rather than change the contract.

## Compile The Context Packet

Write one owner-specific Slice containing:

- the intended result and why it matters
- authoritative starting inputs and exact sources
- locked decisions and preservation boundaries
- the branch's role and interfaces in the larger structure
- the output or state consumed next
- representative proof through the intended primary path
- the material conflict return

Reference relevant plan sections and direct evidence instead of passing the parent transcript, full Run history, or unrelated context.

## Compose The Schedule

- Start branches together only when their inputs, interfaces, outputs, ownership, and mutation surfaces are independently ready.
- Sequence results that consume one another, may revise shared decisions, or share a mutation surface.
- Keep connected diagnosis, production, correction, and proof with one worker.
- Use aggregate or frozen execution only when one coordinated checkpoint adds material value.

## Worker Ownership

1. The worker owns local execution judgment inside the Slice.
2. The worker carries the result through production, correction, and one representative input-to-output execution.
3. An impossible or unsafe contract returns to HEAD with direct evidence.
4. Correction stays with the same worker while the contract remains valid.

## Integrate The Result

1. Re-anchor on the Run outcome and Slice before accepting the worker's framing.
2. Treat the return as artifacts and evidence, not authority over the Run.
3. Compare the produced result with what the parent consumes.
4. Accept, correct, defer, separate, reopen, or reject from connected evidence.
5. Update the Run model before selecting the next outcome.

## Checkpoint-Governed Execution

For aggregate checkpoint governance, include only independent branches, keep branch lifecycle outside HEAD context, return terminal states with direct artifact references, and let HEAD judge the aggregate before choosing the next horizon.
