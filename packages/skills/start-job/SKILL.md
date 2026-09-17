---
name: start-job
description: >
  The start of a work burst. Fixes the final result, decomposes it one layer
  at a time by asking how each item comes out, reduces every layer to what is
  needed, and records the trail in one file until each leaf is an executable
  instruction or waits on a named prior result. Execution follows from the
  leaves: direct work, delegate-once, or plan-run.
---

# Start Job

A single answer, lookup, or one-place fix is direct work with no file. Any other work follows these steps and writes them, layer by layer and before anything is executed or delegated, to `sessions/<session>/work/<work-label>/decomposition.md`, where the label is the one its checkpoints carry.

1. **Final result.** Write what must exist at the end, who uses it, and how. A product or user-facing result is first formed through `product-planning` (problem → user value → user flow).
2. **One layer.** Ask of the current item: how does this come out? Write only its direct children, each with what it is made from, what it produces, and how the parent uses it. How a child's own inputs come out is the next layer.
3. **Reduce.** Check the layer against the final result: every child needed, nothing missing, the smallest set that makes the parent come out. Record what was cut and why.
4. **Show, then descend.** Show the user the final result and its first layer before going deeper. Then take each child in turn through steps 2–3. A choice that belongs to the user waits for the user.
5. **Leaves.** A child stops decomposing when it is either
   - an instruction HEAD or a worker can follow now to a stated output: inputs by path, output and its location, procedure, acceptance check — the `delegate-once` entry contract. Work repeated over many items is first done on one real item, and that output fixes the shape the rest must follow; or
   - waiting on a named prior result: record which result, and what it must show before this child is decomposed.
6. **Execute from the leaves.** A leaf HEAD carries itself is direct work; one leaf another owner returns whole goes through `delegate-once`; dependent leaves carried through checkpoints go through `plan-run`. A returned result is judged against the node it came from, and the file records the judgment.

When work drifts into one item's detail or stalls, go back to the final result and the current layer in the file.

A worker's `[from <agent> msg:<id>]` question → `agent-reply`.
