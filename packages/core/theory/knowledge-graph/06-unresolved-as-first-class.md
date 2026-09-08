# Recording What Is Not Known

[한국어](ko/06-unresolved-as-first-class.md) · [Index](README.md)

## A Bucket Is Not a Record

Every construction pass produces things it could not place. The natural move is to sort them into a few residual categories — shared, operational, infrastructure, incidental — and move on with the part that worked.

The categories are usually correct. The problem is where they live. A label applied inside the pipeline, on the way to the graph, does not enter the graph. So the graph ends up holding what was placed, and holding nothing at all about what was not.

Query it afterwards and the unplaced material does not appear as unresolved. It appears as **absent**. There is no difference, from inside the graph, between something judged not to belong and something nobody ever looked at.

> A graph that buckets its failures outside itself reports full coverage of whatever it happened to cover.

This is the mechanism by which a graph conceals its own gaps while every individual record in it is true.

## Three Different Things Get Buried Together

Residual buckets flatten distinctions that carry very different consequences.

```text
supporting ground      genuinely serves everything, belongs to nothing
                       → a conclusion, not a failure

missing name           the implementation exists and is real, but no
                       upper-layer name covers it
                       → a hole in the upper layer, not in the code

pending promotion      a verdict was reached but has not entered canon
                       → a pipeline state, not a knowledge state
```

The first is a legitimate outcome and should be stated as one. Framework wiring, entry points, shared utilities — these serve the whole and attach to no single purpose. Recording that explicitly is more informative than silence, because it distinguishes *deliberately unattached* from *unexamined*.

The second is the one that matters most and hides the best. When the reason for non-placement is that nothing above has a name for this, the finding is about the upper layer. Filed as a property of the code, it reads as "this code is generic." Filed as a property of the graph, it reads as "we are running something we never described." Those prompt entirely different actions, and the bucket produces the first reading by default.

The third is not knowledge at all. It is a pipeline that stopped halfway. Left invisible, verified work sits indefinitely in an intermediate artifact while the graph continues to serve the previous answer, and nothing anywhere indicates the discrepancy.

## Unresolved Must Be a Node

The correction is structural, not procedural. Non-placement becomes a record with the same standing as placement.

```text
queryable    "what does this graph not account for" returns an answer
countable    the size of the unresolved set is a number that moves
attributable each item says why, in which pass, against what evidence
closeable    each item states what would settle it
```

Countability is what converts an embarrassment into an instrument. Once non-placement has a number, its trend is the most honest health signal the graph produces — more honest than node counts, which only ever go up.

Closeability keeps the set from becoming a landfill. An unresolved item that does not state what would settle it cannot be worked, and will therefore accumulate forever. This is the hypothesis rule from [what a graph is the authority for](01-authority-and-epistemic-class.md) applied to coverage: neglect is not a state.

## Absence Never Proves Absence

A related discipline governs reading the graph rather than writing it.

An empty result means the graph has no record. It does not mean the world has no instance. The two are conflated constantly, because an empty result is clean and quiet and looks like an answer.

```text
the graph says nothing here
    → maybe there is nothing
    → maybe this area was never mapped
    → maybe it was mapped at a coarser resolution than the question
    → maybe it was mapped before the source changed
```

An unresolved layer collapses most of this ambiguity, since deliberate non-coverage is now visible. What remains is the honest residue, and the rule for handling it is fixed: an empty result licenses a bounded direct search, never a conclusion of absence.

## Not Knowing Is Not the Same as Being Wrong

There is a reluctance to record uncertainty that comes from treating unresolved items as defects — a backlog of failures, evidence of an incomplete job.

They are not defects. A verdict of *cannot determine from available evidence* is a correct verdict when it is true. The alternative is not a better verdict; it is a guess presented at the same confidence as everything around it, which is the class error from [what machines produce and what judgment produces](05-deterministic-backbone.md) in its most tempting form.

> The cost of recording uncertainty is a visible number. The cost of not recording it is invisible confidence.

Practically this means the construction procedure must permit a null outcome and must make that outcome as easy to emit as a confident one. If declining to decide is more work than deciding, the procedure has selected for false confidence and will produce it.

## Unresolved Must Be Earned

The previous rule invites one specific abuse, and it is the most common way this page gets misapplied: declaring evidence unavailable without having gone to get it. *Cannot determine from available evidence* is only a correct verdict when the available evidence was actually exhausted, and "available" is far wider than whatever happened to be indexed.

A connection the source does not state may still be stated elsewhere.

```text
the source              read it
the running system      run it, or read what it recorded about itself
its configuration       read what selected the behavior
the person who decided  ask
                        ─────────────────────────────────
unresolved              only after those
```

Each step down produces a weaker claim than the one above, and each enters the graph at its own class — an observation of a run is observed fact about that run, a reading of configuration by judgment is inferred meaning owing its inputs. None of them is silence, and none may be skipped on the grounds that the one above it failed.

The distinction that settles it is between two very different situations wearing the same word. Something may be unresolved because nothing determines it — a decision genuinely not yet made, a purpose nobody has assigned. Or it may be unresolved because the system does one specific thing every time it runs and the graph has not gone to find out which.

> When something demonstrably happens, unresolved is not a finding. It is a step not yet taken.

The second case is a defect in the graph, not a property of the subject, and recording it in the same slot as the first is how a construction procedure launders its own incompleteness into apparent rigor. An unresolved record must therefore say which case it is — and for the second, its closing condition is not a question for a person but a source not yet consulted.

## What This Establishes

Non-placement is a result, not a leftover. It belongs in the graph, separated by reason, counted, and closeable — and earned, by exhausting the sources that could have settled it, the running system among them. Absence of a record is never evidence of absence in the world.

With classes, axes, gates, resolution, division of labor, and unresolved state all in place, the remaining question is how the graph changes when the world does.

Next: [what descends and what ascends](07-descent-and-ascent.md).
