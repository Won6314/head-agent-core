# How Far to Go

[한국어](ko/09-maturity-and-adoption.md) · [Index](README.md)

## Levels Are Defined by Questions, Not by Tools

The preceding pages describe a complete shape. Building all of it at once is almost never the right move, and building none of it leaves a graph that quietly misleads.

The useful way to stage the work is by what becomes answerable. Tooling changes constantly and differs by language and scale; the questions do not.

```text
0   commitments exist, nothing connects them to the implementation
    answerable: what did we say we would do

1   implementation attaches to upper-layer names
    answerable: where in the product does this code live

2   structural relationships are recorded
    answerable: what does this depend on, what breaks if it changes

3   identity is finer than the container
    answerable: which part carries this, and what actually changed

4   judgment runs only on the residue
    answerable: can we rebuild this graph and get the same answer

5   execution evidence joins the comparison
    answerable: is this path real, or only reachable in principle
```

Each level answers something the level below cannot, and the ordering is not arbitrary — later levels depend on earlier ones. Structural relationships need attachment to be meaningful. Fine identity is wasted without structure to traverse. Restricting judgment to the residue requires a structural backbone to produce the residue in the first place.

## What Each Level Costs

The cost is rarely the initial build. It is what must keep working afterwards.

```text
0 → 1   a way to decide what belongs where, and the discipline to
        record non-placement rather than bury it
1 → 2   extraction that survives refactoring, run every revision
2 → 3   identity that is stable across renaming and restructuring
3 → 4   a candidate ranking good enough that the residue is small,
        plus a baseline to compare regenerations against
4 → 5   scenarios that exercise the product, maintained as it changes
```

The last step is the one most often attempted and abandoned, because its cost is not in the graph at all. Execution evidence requires a body of scenarios that stays current, and a project that does not already maintain those will not begin maintaining them for the graph's benefit.

## Precision Beyond the Subject Is Waste

There is no level that is correct in general. The right level is the one whose answerable questions are the questions actually being asked.

A graph whose consumers only ever ask which area of the product a change touches is complete at level 1. Adding structural relationships gives them nothing, and adding fine identity costs every cycle forever while answering questions nobody poses.

The inverse error is more common and more expensive. A graph is built at level 1, consumers begin asking level 3 questions, and the graph answers them — coarsely, confidently, and wrongly. Nothing announces the mismatch, because a coarse answer to a fine question is still an answer.

> The failure is not being at a low level. It is being at a low level while answering as though you were at a high one.

## Honesty Is Required at Every Level

One property is not optional at any level: the graph must be accurate about what it does not cover and what it cannot resolve.

A level-1 graph that records non-placement, marks its unresolved items, and states its resolution is useful. Its consumers know which questions to bring to it and which to answer elsewhere. It can be extended later, because its gaps are visible and countable.

A level-4 graph that buries its residuals is not useful at any level. Its precision makes its silences more convincing, and a confident silence is worse than an admitted gap. Sophistication amplifies whichever property it is built on — including dishonesty.

This is why [recording what is not known](06-unresolved-as-first-class.md) is not an advanced topic. It is a precondition for the first level being worth anything.

## When to Move Up

The signal to advance is not capability or ambition. It is a question that keeps being asked and cannot be answered.

```text
good reason    "we keep needing to know which part, and the graph
               can only tell us which container"

bad reason     "the tooling now supports it"
               "the graph should be more complete"
               "other systems do this"
```

Completeness is not a goal a graph can reach. There is always more that could be modeled, and a graph extended toward completeness rather than toward specific unanswered questions grows in maintenance cost without growing in usefulness — and its unused regions decay quietly, because nothing queries them and therefore nothing notices when they go stale.

The corollary is worth stating plainly: a region of the graph nobody queries is not neutral. It carries maintenance cost and it degrades trust when someone finally does query it. Removing it is a legitimate improvement.

## Stopping Is a Result

A graph deliberately held at level 2, with its resolution documented and its gaps countable, is a finished thing. It does not need a plan to advance.

The condition is that its limits are recorded where consumers see them, not held as tacit knowledge by whoever built it. A limit that lives only in someone's head is not a limit; it is a trap with a delay.

## What This Establishes

Levels are staged by answerable questions. Cost accrues to maintenance, not construction. The right level is set by demand, not by capability, and honesty about coverage is required at every level rather than earned at the top.

That completes the shape. [References](references.md) collects the prior art and tooling comparisons behind these pages; the consuming side is in [LLM Context Management](../context-management/README.md).

[Back to the index](README.md).
