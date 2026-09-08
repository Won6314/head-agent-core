# Two Axes and Where They Cross

[한국어](ko/02-two-axes.md) · [Index](README.md)

## Why Not One Axis

Product knowledge is tempting to model as a single hierarchy. Everything is about the product, everything eventually touches the code, and one tree is simpler than two.

The attempt fails on a detail that looks minor and is not: the two kinds of knowledge cannot be written at the same time.

```text
                        product axis            operation axis
update is triggered by  a new revision          an event occurring
written                 in batch, afterwards    at the moment
reconstructable later   yes — the source remains no — the event is gone
```

An implementation can be re-read at any time. If the product axis drifts, it can be discarded and rebuilt from the code as it stands. Nothing is lost by deferring the work.

A decision leaves no artifact of itself. The moment it is made is the only moment it can be recorded, because afterwards there is nothing to read. Deferring is not delay; it is loss.

Fold these into one structure and you must choose one discipline for both. Choose batch reconstruction and the decision layer evaporates. Choose moment-of-event capture and the code layer becomes a hand-maintained transcription that immediately falls behind. Neither is recoverable by working harder.

> Two axes exist because two clocks exist.

## The Product Axis: Authority Downward

The product axis is a spine. Something at the top governs what is below it, and the relationship is not symmetric.

```text
     Core            what the product is for
      │ governs
     Policy          commitments that were approved
      │ governs
     Feature         names for what exists
      │ governs
     Code            what is actually there
```

The governing direction carries one hard rule: **what is below cannot change what is above.** An observation in the code, however clear, never becomes a commitment on its own. It can only be raised as something for a person to settle.

This looks bureaucratic until the alternative is examined. If observations could promote themselves, then the graph's record of what was promised would be continuously rewritten by whatever happened to be implemented — and the single question the spine exists to answer, *does the implementation keep the promise*, would become unanswerable. The answer would always be yes, by construction.

## The Operation Axis: Time Forward

The operation axis is a loop, not a hierarchy. Nothing governs anything; each stage produces the conditions for the next.

```text
     intent  →  work  →  release  →  measurement
        ↑                                 │
        └─────────────────────────────────┘
```

Its records are written as events occur and are never revised afterwards. A release happened at a time, at a revision. A measurement was read over a window. These are not judgments to be refined; they are occurrences to be captured.

The loop closes when measurement becomes grounds for the next intent. Until that edge exists, the axis is a line rather than a loop, and the product accumulates work without accumulating learning.

## Crossing Is Not Meeting

Both axes touch the same nodes, and it is easy to describe every contact with the same word. Two different things are happening.

```text
crossing     the operation axis passes through the product axis
             at the feature and at the revision

meeting      on the product axis, descent and ascent both terminate
             at the policy
```

Crossing is addressing. Work is *about* some feature; a release is *at* some revision. The operation axis borrows those coordinates to say where in the product its events landed.

Meeting is judgment. A commitment came down and evidence came up, and now they either agree or they do not. That comparison happens at the layer that holds commitments, and nowhere else.

Confusing the two produces a graph that can say what was worked on but not whether the work was right — the exact failure described in [the index](README.md).

## References Across an Axis Are Copies

When one axis needs to name something owned by the other, the temptation is to point directly at it. Doing so quietly merges the two update disciplines, because now a record on the batch-rebuilt axis is load-bearing for a record on the never-revised axis.

The safe form is a verified copy, stamped with where it came from.

```text
original record        lives on its owning axis, follows that axis's rules
anchor copy            lives on the other axis, marked as a copy,
                       carries the identity of the original
```

The rule that follows is short: **the owning axis is authoritative; the copy is never edited in place.** When the original changes, the copy is rebuilt from it. When they disagree, the copy is stale — that is a fact about the copy, not a conflict to adjudicate.

## Shared Context Belongs to Neither

Some knowledge sits outside both axes. What the product fundamentally is, and the domain vocabulary the whole team reasons in, are not governed by the spine and are not produced by the loop. Both axes reference them; neither owns them.

Trying to assign this material to an axis forces a false choice. Put it on the product axis and the operation loop cannot cite it without an anchor for something that was never a decision. Put it on the operation axis and it acquires a timestamp it does not have.

Leaving it explicitly outside both is the honest placement, and it costs nothing: shared context is referenced by identity from both sides, exactly like an anchor, minus the ownership question.

## What This Establishes

Two axes, two clocks, two disciplines. Authority moves down one and never up. Time moves forward along the other and never back. They cross where work needs an address, and on the spine alone, descent and ascent meet at the layer of commitments.

The three places a person must stand fall out of this shape, and that is the next page.

Next: [where a person stands](03-human-gates.md).
