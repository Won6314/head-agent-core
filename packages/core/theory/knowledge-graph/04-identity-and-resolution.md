# Identity Decides Resolution

[한국어](ko/04-identity-and-resolution.md) · [Index](README.md)

## A Graph Cannot Speak Below Its Own Identifiers

Whatever the graph names is the smallest thing it can say anything about. Not the smallest thing it can *store* — a node body can hold arbitrary detail — but the smallest thing it can attach a relationship to, judge, count, or notice a change in.

This sounds obvious and is routinely violated, because detail inside a node feels like resolution. It is not. Text describing five distinct behaviors inside one node is one node. Nothing can point at the third behavior.

> The graph's resolution is the granularity of its identifiers, not the richness of its contents.

Resolution has two dimensions, and both are chosen rather than discovered.

```text
height    which layer a thing attaches to
size      how large one node is
```

## Height Decides What Can Be Judged

[The index](README.md) established that attachment and judgment happen at different heights: code attaches at the feature, but descent and ascent meet at the layer of commitments. That is a statement about height.

The consequence is direct. If the lowest thing the upper layers can name is a feature, then no question finer than a feature can be asked, no matter how detailed the code layer is. "Which part of the implementation carries this commitment" has no answer, because the commitment attaches to a name, and the name has no parts.

Choosing a height is therefore choosing a question set. Attaching at a coarse layer is not a partial version of attaching at a fine one; it is a different set of answerable questions, and adding depth below does not extend it.

## Size Decides What Can Be Distinguished

The second dimension is how much reality one node covers.

A unit of implementation rarely serves exactly one purpose. Shared plumbing serves many; an entry point often assembles several concerns; a container of related things holds each of them. When the node is the container, every purpose it serves becomes an edge from the same node, and the graph records that this container relates to five things — but not which part relates to which.

```text
coarse node    container → five relationships
               "these five are all in here somewhere"

fine node      five parts → one relationship each
               "this part serves this purpose"
```

Both are true. Only the second can be acted on.

The loss is asymmetric in an unhelpful way: coarse nodes make recall easy and precision impossible. Everything relevant is included, and everything included looks equally relevant. Queries return the container, and a person re-derives by hand the distinction the graph declined to record.

There is a second, quieter loss. When one node holds several purposes, a purpose that is scattered across many containers is indistinguishable from a purpose that is concentrated in one — the count of edges says nothing about how dispersed the thing actually is. Concentration and dispersion are exactly what you want to know before changing something.

## Identity Must Be Stable, and Location Is Not Identity

An identifier that changes when the thing does not is worse than a coarse identifier, because it converts every incidental edit into an apparent deletion and creation. Everything attached to the old identity is orphaned, and everything attached to the new one starts empty.

So identity must be derived from what the thing *is* — its position in a namespace, its role, its name within that structure — and must exclude what merely describes where it currently sits.

```text
identity      namespace, containing structure, role, name
properties    file location, line span, size, content hash
```

Line numbers are the clearest case. They change constantly and mean nothing about the thing itself. As properties they are useful for navigation. As identity they guarantee that ordinary reformatting destroys the graph's accumulated attachments.

Matching by display name is the other common failure. Names collide across namespaces, and a rename that preserves meaning looks identical to a deletion plus an unrelated creation. Identity has to be computed structurally so that it survives renaming and so that two same-named things in different places stay two things.

## Change Detection Is the Other Half of Identity

Identity alone says what exists. To know what *changed*, identity must be paired with a content signature.

```text
same identity, same content hash        unchanged — do nothing
same identity, different content hash   changed — update in place
identity present only in the source     new — create
identity present only in the graph      gone — remove
```

These four cases are the entire vocabulary of updating a graph from a source, and they are only computable if identity is stable. When identity drifts, every case collapses into the last two: everything looks deleted and recreated, nothing looks merely changed, and no accumulated judgment survives.

This is also where the invariant that governs the whole pipeline appears.

> Incremental resolution can never exceed identity resolution.

If the smallest identified thing is a container, then a change anywhere inside it marks the whole container changed. Everything attached to that container must be re-examined, including the parts that did not move. Fine identity is not primarily about better queries; it is about being able to leave untouched things untouched.

## Resolution Is Not Free

Finer identity costs more to produce, more to store, and more to keep stable across restructuring. It also multiplies the number of things that can be individually wrong.

The honest position is that resolution is a choice matched to the questions actually being asked, not a target to maximize. A graph whose consumers only ever ask which area of the product a change touches gains nothing from symbol-level identity, and pays for it every cycle.

What is not optional is knowing which resolution you chose and what it therefore cannot answer. A graph that is coarse and says so is usable. A graph that is coarse while its consumers assume it is fine produces confident answers to questions it never had the resolution to address.

Next: [what machines produce and what judgment produces](05-deterministic-backbone.md).
