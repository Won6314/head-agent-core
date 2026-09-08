# Where a Feature Starts and Where It Stops

[한국어](ko/08-tracing-the-reachable-surface.md) · [Index](README.md)

## A Feature Is a Path, Not a Set

The natural way to model a feature is as the code that implements it — a set, owned exclusively, each piece of code belonging to one feature. It is the model most graphs start with, and it fails on the first shared function.

Shared code belongs to every path that runs through it. Exclusive ownership cannot express that, so a graph built on ownership has to repair itself: shared code is detected as a violation, split out, and given a synthetic feature invented to own it. The graph now contains features that name nothing a person would ever ask for, existing only to satisfy a modeling choice.

The alternative is to model a feature as a path.

```text
as a set     a feature owns code; shared code violates ownership
as a path    a feature runs through code; shared code is on many paths
```

Nothing owns the interior. A path begins at a point a person can touch, runs through whatever it runs through, and ends where it ends. The pieces it passes through are not its definition — they are its route.

> A feature is a path, not a set of code it owns.

The repair machinery disappears entirely, because there is no longer a violation to repair.

## Construction Starts Where the Product Is Observable

A path needs a starting point, and only one place in a system is simultaneously a product fact and a code fact: the place where a person touches it. A button, a link, a submitted form, a called endpoint. Above that point the product exists in language; below it, only in symbols. There alone, the two are the same object.

This decides the direction of construction. Not upward from the code, which produces an address for everything and a name for nothing a user recognizes. Not downward from the documentation, which produces names with nothing under them. From the surface, the only layer where naming is not a guess.

It also decides what completeness means. A graph is complete when every point a person can touch lies on a path — not when every file is mentioned somewhere. Those are different claims, and the second is both easier and worth far less.

## The Path Closes Itself

The obvious objection is that following references from a starting point will drag in the entire system, because everything eventually reaches the shared utilities.

It does not, and the reason is structural. Shared code sits at the bottom of the reference direction. A path descends into it and stops, because a utility refers onward to almost nothing. Utilities have high fan-in and low fan-out: they are absorbing points, not hubs that redistribute in every direction.

**Operational observation.** In a system whose index held on the order of thousands of symbols, closures traced from individual user-reachable anchors held tens of symbols across roughly a dozen files at the median, and the largest closure covered a low single-digit percentage of the index. No cutoff rule was needed; no closure approached the size of the system.

This matters because the alternative is to invent a bound — a fan-in threshold, an owning directory, a depth limit — and every such bound is a judgment inserted into a step that was supposed to be deterministic. When the closure is naturally small, the deterministic layer stays deterministic.

## A Boundary the Indexer Cannot See

A path is whole only if it crosses every boundary the running system crosses, and a symbol indexer cannot see the most important one. When a request leaves one process and arrives at another, nothing in the source refers to anything in the target. The reference is a string in one place and a declaration in another.

If nothing is done about it, the consequence is not an error.

> A graph split at a process boundary does not look broken. It looks like twice as many features.

Each side is internally coherent. Each side names its own half plausibly. Nothing reports a failure. The only symptom is that no feature ever holds both halves — and that symptom is invisible unless someone thinks to count for it.

The repair is deterministic and cheap wherever calls funnel through a shared client: enumerate the call sites, read the address each one names, and match it against the table of addresses the other side declares. That is a found edge, not an assigned one. It belongs in the structural frame of [what machines produce](05-deterministic-backbone.md), not in judgment.

Where calls do not funnel, the same principle holds with more extraction work. What must not happen is leaving the crossing to judgment. Judgment asked to guess which endpoint a control calls will answer plausibly and unverifiably.

## Slice by Path, Not by Volume

Judgment has a working limit, so material must be divided before it is judged. How it is divided is not an operational detail.

The dividing line becomes the feature boundary. A judge shown one side of a path can only produce a feature describing that side; it cannot name a connection it was never shown. Divide by volume — token budget, file count, directory, layer — and the resulting features are shaped by the budget rather than by the product.

> Whatever the chunker separates, the namer cannot join.

Paths are therefore the unit of division. A slice is a set of whole paths and never cuts one. Slices may overlap in their interiors, because interiors are not owned; that overlap costs repeated context and nothing else.

## Judgment Sees the Whole Path and Assigns Only Its Ends

Two rules together keep judgment bounded.

```text
shown      the whole path, end to end, as context
assigned   the anchor only — exactly once, nothing left over
```

Anchors are the checklist: every anchor in the slice is accounted for exactly once, and the accounting is verifiable by counting. Interiors are context and nothing more. Asking judgment to assign interiors reintroduces ownership through the back door, and with it every problem the path model just removed.

## Grouping Is Judged from Outside

Features group. The question is what evidence grouping may use.

Interior overlap is the tempting answer and the wrong one. That two paths share a helper is a fact about how the code was organized. It is not a fact about the product, and grouping on it produces groups that track the codebase's internal structure — coherent to whoever wrote it, unrecognizable to whoever uses it.

Grouping is judged from the anchors alone: what a person understands themselves to be doing at that point. Several distinct paths can be one activity, and two paths sharing most of their interior can be entirely different activities. Only the outside view separates them correctly.

## What the Path Never Reaches

Code that no path reaches is a result, not a deficiency, and must not be attached to a feature to improve a coverage number.

It is classified by why it is unreachable: entered from outside rather than by a person, infrastructure serving the system rather than the product, shared code that exists only in interiors, or genuinely dead. Those are four different findings, and the first two are correct states that will never change.

Recorded this way, unreached code is an answer. Absorbed into features, it becomes noise that also destroys the completeness claim — because once anything may be attached to anything, "every anchor lies on a path" stops meaning what it said.

## What This Establishes

A feature is a path from an observable point through whatever it runs through. Paths close themselves without an invented bound, cross process boundaries only over a deterministic bridge, and divide judgment's work without cutting anything. Judgment names the path and groups by its ends. What no path reaches is classified rather than absorbed.

That leaves the question of how much of this a given project should build.

Next: [how far to go](09-maturity-and-adoption.md).
