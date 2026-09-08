# Where a Person Stands

[한국어](ko/03-human-gates.md) · [Index](README.md)

## Approval Is Not an Axis

It is natural to think of human judgment as a third dimension of the graph — decisions on one side, code on the other, and the person somewhere between them. That picture is wrong in a way that produces real structural damage.

Approval is not a place in the graph. It is two other things.

```text
a class      an approved decision is one of the record classes,
             a property carried by nodes
a gate       a specific moment where the flow stops and waits
             for a person
```

Modeling approval as an axis creates a dimension with no coordinates: nothing to traverse, nothing to index, no edges that mean anything. Worse, it invites every record to acquire an approval status, which sounds rigorous and in practice means a large permanent queue of things nobody will ever look at.

The useful question is not *what is approved* — the class already answers that. It is **where must the flow actually stop.**

## Three Gates, and Only Two Block

The answer is smaller than expected. There are three places, and they are not symmetric.

```text
"should we do this?"      entrance to the operation axis        blocking
"should we ship this?"    late in the loop                      blocking
"which one is right?"     the adjudication queue            non-blocking
```

**Should we do this** is the only door through which new work enters. Nothing appears on the operation axis without passing it, and creating or changing a commitment on the product axis is part of this same decision rather than a separate one. This is where approved decisions are born.

**Should we ship this** is a decision about the outside world, which is why it blocks even though everything around it is mechanical. Note what is *not* behind this gate: once the answer is yes, recording the release is pure observation. The deployment is read from what actually happened, not written from what was intended. No one authors a deployment record.

**Which one is right** is filled automatically whenever descent and ascent disagree. A person eventually empties it, but the flow does not wait.

## Why the Third Gate Must Not Block

Making disagreement blocking is the intuitive choice and it is the one that destroys the graph.

A blocking adjudication queue means every newly discovered inconsistency halts unrelated work. The predictable human response is not faster adjudication — it is to stop producing findings. Detection gets tuned down, marginal cases get recorded as agreement, and within a few cycles the graph reports a clean state that is clean only because nothing is looking.

Non-blocking inverts the incentive. A finding costs nothing to record, so findings are recorded. The queue grows, which is uncomfortable and honest, and the discomfort is information: a queue that grows faster than it drains is telling you something true about the gap between intent and implementation.

> An honest backlog of unresolved questions is worth more than a clean state produced by not asking.

The queue does need a floor — an unresolved item that no one ever revisits has decayed into noise. But the floor belongs to review cadence, not to the write path.

## Why Only Three

Three is not a preference. It follows from what a person is uniquely required for.

```text
a new approved decision enters      no source exists to read it from
an outward, hard-to-reverse act     consequences leave the system
descent and ascent disagree         by construction, only a person
                                    can settle this
```

Everything else in both axes is observation, and observation does not need permission. Recording that a symbol exists at a revision, that a branch advanced, that a measurement window closed — none of these are decisions, and putting a gate in front of them adds ceremony while adding nothing.

The temptation to add gates usually comes from wanting review, not authorization. Those are different needs. Review is better served by making state visible and queryable than by making every write wait.

## The One Non-Negotiable Timing Rule

Of everything in this material, one rule cannot be relaxed.

> A decision must be recorded at the moment it is made.

The reason was established in [what a graph is the authority for](01-authority-and-epistemic-class.md): for observed facts the graph is an index and the source decides, but for approved decisions the graph *is* the source. There is nothing else holding them.

Every other layer tolerates delay. Code can be re-read next week and the record reconstructed exactly. A release can be reconstructed from what the repository shows. A projection can be recomputed from scratch. A decision reconstructed later is not a reconstruction — it is a new decision wearing the old one's date, made by people who now know how it turned out.

The practical form is that the approval conversation is itself the record. Not a task to write it up afterwards; the text of the decision, captured where it happened, promoted as it stands.

## What Gates Do Not Decide

A gate authorizes; it does not compose. The person at "should we do this" is deciding whether the work happens, not writing the graph records that result. The person at "which one is right" is declaring which side stands, not editing the nodes by hand.

Keeping this line clear matters because the alternative is subtle. When gate-holders start hand-editing records to express their decision, the class system quietly breaks — a projection gets touched, an observation gets corrected to match intent, and afterwards nothing distinguishes what was observed from what someone wished were observed.

The gate produces a decision. The pipeline produces records from it.

## What This Establishes

Three gates, two of them blocking, and one rule about timing that no scale or urgency relaxes. Approval lives in the classes and in these three moments — not as a dimension of the graph.

With the shape and the human boundary in place, the remaining questions are about what the graph is made of. The first is how finely it can speak at all.

Next: [identity decides resolution](04-identity-and-resolution.md).
