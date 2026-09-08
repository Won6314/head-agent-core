# What a Graph Is the Authority For

[한국어](ko/01-authority-and-epistemic-class.md) · [Index](README.md)

## One Graph Holds Several Kinds of Claim

A knowledge graph looks uniform. Every node has a name, a body, and edges, and a query returns them all in the same shape. That uniformity is convenient and it is also the first thing that goes wrong, because the claims inside are not of one kind.

```text
"this function exists at this revision"     someone read the source
"free usage is ten per cycle"               someone decided it
"this cluster is really about onboarding"   someone interpreted it
"the toggle is probably unused"             someone suspects it
"policy and code disagree here"             something computed it
```

These five sentences cannot be defended the same way. The first can be re-derived by reading the source again. The second is true because a person said so and for no other reason. The third depends on inputs that may change. The fourth is not yet known. The fifth should never be edited at all, because it is a calculation.

Stored side by side without distinction, they are read with equal weight — and the weakest of them sets the trust level for all of them.

## Five Classes

The distinction that survives contact with practice is a small one.

```text
observed fact        re-derivable from a source that still exists
approved decision    true because a person declared it
inferred meaning     constructed by interpreting other records
hypothesis           not yet established, with a way to settle it
derived projection   computed from other records, never authored
```

The classes are not a quality ranking. An approved decision is not better evidence than an observed fact; it is a different kind of thing, defended differently and updated differently. A hypothesis is not a defective fact. It is a legitimate record whose value is precisely that it is marked as unsettled.

## Mixing Classes Contaminates Everything

The practical damage is not that a class label is missing. It is that without labels, nothing tells you what to re-check.

When a hypothesis is cited as though it were a fact, and the hypothesis later turns out to be wrong, every conclusion that leaned on it becomes suspect. Not wrong — suspect, which is worse, because now the whole neighborhood must be re-examined by hand. A graph that requires wholesale re-examination after a single correction is a graph people stop trusting, and then stop querying.

> Class labels exist so that a correction has a bounded blast radius.

The same applies in the other direction. If an interpretation silently overwrites an observation, the source is still there but the graph no longer agrees with it, and nothing in the graph reveals that this happened.

## Each Class Demands a Different Update Rule

This is the operational reason to separate them. The classes are not descriptive metadata; each one implies how its records may legally change.

```text
observed fact        re-observe when the source changes; never hand-edit
approved decision    changes only by a new human decision; observation
                     cannot overwrite it
inferred meaning     re-construct when its inputs change; possible only
                     if the inputs were recorded
hypothesis           promote when settled, discard when refuted;
                     neglect is not a state
derived projection   must be recomputable at any time; hand-editing one
                     makes its class a lie
```

Read together, these rules say something the graph structure alone does not: an observation may never quietly become a decision, and a projection may never quietly become an input. Those two silent promotions are how a graph drifts while continuing to look healthy.

## Provenance Is the Proof of Class

A class claimed without provenance cannot be checked, and an unverifiable class label is worse than none — it converts a guess into an apparent guarantee.

So each class carries a different obligation.

```text
observed fact        what was read, and at which fixed state
approved decision    who approved what, and when
inferred meaning     every input record and external source used
hypothesis           what would settle it
derived projection   the rule and the records it consumed
```

The last one is the most often skipped and the most consequential. A projection whose computation is not recorded cannot be recomputed, and a projection that cannot be recomputed has quietly become an authored record with a false label.

## Authority Is Not Uniform Either

It is tempting to state one simple rule — the graph is only an index, the real source is authoritative — and apply it everywhere. That rule is right for most of the graph and wrong in the place that matters most.

```text
observed fact        the graph indexes; the source decides
approved decision    the graph IS the source; nowhere else holds it
```

An implementation can always be re-read, so a claim about current behavior should be confirmed against the implementation rather than the graph. A decision leaves no artifact of itself. There is no source to return to. If the graph does not hold it, it is gone.

Treating the whole graph as a mere index therefore loses the one layer that cannot be rebuilt. Treating the whole graph as authoritative loses the discipline that keeps the rest current. The asymmetry has to be carried deliberately.

## The Store Is Not the Authority

A queryable database is a convenience. It is fast, it supports traversal, and it is the wrong place to keep the truth.

The authority is the record set — the durable, reviewable, version-controlled statement of what the graph holds. The database is a materialization of that record set, and it should be disposable: deletable and rebuildable from the authority at any time, with no loss.

This is not architectural preference. It follows directly from the class rules above. Derived projections must be recomputable, which means the whole graph must be rebuildable from its inputs. A store that cannot be rebuilt cannot honor the class it claims for its own projections, and the class system quietly stops meaning anything.

> If the graph cannot be thrown away and rebuilt, its classes are decoration.

## What This Establishes

A graph earns authority not by being large or current but by being honest about what kind of claim each record is, where it came from, and how it is permitted to change. Everything that follows in this material assumes the classes are in place, because every construction rule is ultimately a rule about which class may write over which.

Next: [two axes and where they cross](02-two-axes.md).
