# What Machines Produce and What Judgment Produces

[한국어](ko/05-deterministic-backbone.md) · [Index](README.md)

## Two Kinds of Edge

Some relationships in a graph are read off the source. This thing contains that thing; this one refers to that one; this version replaced that version. Given the same source, anyone re-deriving them arrives at the same set. They are found.

Other relationships are assigned. This implementation serves that purpose; this cluster is really about that concern; these two things belong together. No amount of re-reading produces them mechanically, because they express what the source *means* to someone.

```text
structural edge     found in the source, re-derivable
semantic edge       assigned by a judgment, not re-derivable
```

The distinction is not about difficulty. Some structural edges are hard to extract and some semantic assignments are obvious. It is about whether repeating the procedure reproduces the result.

## The Division That Works

The stable arrangement puts each kind in the hands that can produce it well.

```text
determinism produces    containment, reference, ordering, existence,
                        change — everything the source states
judgment produces       purpose, grouping, significance — everything
                        the source implies
```

Two properties follow, and both matter more than they first appear.

**Structural edges become a fixed frame.** Because they are re-derivable, they can be discarded and rebuilt at any time, at any revision, without consulting anyone. They are the part of the graph that never needs to be preserved — only recomputed.

**Judgment operates on a bounded surface.** Rather than being asked to comprehend everything, judgment is presented with candidates the structure already narrowed, and asked only what the structure cannot state.

Reverse the division and the graph inherits the worst of both. Judgment producing structural edges yields a frame that cannot be rebuilt without redoing the judgment. Determinism producing semantic edges yields confident assignments derived from surface similarity, which is the failure mode that makes people distrust the whole graph after the first few absurd results.

## Verifying a Citation Is Not Reproducing a Verdict

A specific confusion deserves its own name, because it produces false confidence in exactly the place confidence matters.

Suppose every claim in the graph carries a citation, and every citation is checked against the source at a fixed state. Quoted text matches. Locations resolve. Nothing was fabricated. This is a real and worthwhile guarantee.

It guarantees the citation. It says nothing about the verdict.

```text
verified citation    the quoted material genuinely exists there
reproduced verdict   the same procedure would assign it again
```

A judgment can quote impeccably and still be one of several defensible readings. Run the procedure again with a different decomposition, a different order, a different judge, and a different assignment may emerge — with citations equally verified.

> Citation verification establishes honesty. It does not establish reproducibility.

The practical consequence is that a graph built on verified-but-irreproducible verdicts cannot be regenerated. It can only be preserved. And a graph that must be preserved rather than rebuilt is one bad merge away from unrecoverable, which is precisely what [what a graph is the authority for](01-authority-and-epistemic-class.md) warned about.

## Judgment Belongs on the Residue

If judgment is expensive and irreproducible, the question is not whether to use it but where.

The answer is: after the structure has done everything it can, on what remains.

```text
1. build the structural frame          deterministic, complete, cheap
2. propagate from anchored points      deterministic, follows structure
3. rank the remaining candidates       deterministic, ordered by evidence
4. judge what is still ambiguous       judgment, on a small surface
```

Each earlier step shrinks the surface of the next. Judgment applied to a narrowed, ordered, evidence-carrying candidate set is doing something it is genuinely good at — deciding among plausible readings. Judgment applied to the raw whole is doing something it is bad at: exhaustively re-deriving structure that was already available for free.

The cost argument is the obvious one. The reproducibility argument is stronger: a small judged residue can be re-judged and compared. An exhaustively judged graph has no baseline to compare against, because regenerating the baseline is the same expensive irreproducible act.

## One Source of Evidence Is Not Enough

Assignments drawn from a single kind of evidence inherit that evidence's blind spots wholesale.

Structure alone shows what connects to what, and says nothing about why. Text alone — names, comments, documentation — is expressive and routinely stale or aspirational. Execution alone shows what actually ran, and is silent about everything the scenarios never touched.

The reliable arrangement uses them to constrain each other: structure to bound the candidate set, text to rank within it, execution to establish that a path is real. Where two sources agree, confidence is genuinely higher. Where they disagree, that disagreement is itself a finding worth recording rather than a tie to be broken silently.

Execution deserves more than the confirming role it is usually given. There are connections the source is structurally incapable of stating — an implementation selected at startup, a destination assembled at runtime, a handler registered by a framework from configuration. Read the source forever and the answer is not there. Run the system and it is: the choice was made, the call went somewhere, and systems that record their own behavior have already written it down.

```text
the source states it          structural edge, re-derivable from the source
only the run states it        observed edge, re-derivable from the same run
neither states it             a question for judgment, or genuinely open
```

The middle row is a legitimate observation, not a lesser one, and it carries its own honest limit: a run reports the paths it took and stays silent about the rest. That limit bounds the claim; it does not disqualify the source. Treating a connection as unknowable because the source cannot state it, while the running system states it plainly, is not rigor — it is having declined to look.

## Judged Results Are Still Classed

Everything judgment produces enters the graph under a class from [the first page](01-authority-and-epistemic-class.md), and the class is rarely *observed fact*.

An assignment constructed by interpreting inputs is inferred meaning, and it owes a record of every input it used — without which it can never be legitimately reconstructed. An assignment the procedure was not confident about is a hypothesis, and it owes a way to settle it.

Recording a judged assignment as though it were observed is the single most damaging class error available, because it is invisible. Everything downstream treats it as re-derivable from the source, and no one discovers otherwise until someone tries to rebuild.

## What This Establishes

Structure is found and rebuilt; meaning is assigned and preserved. Judgment earns its cost on the residue, not the whole. Citations establish honesty and reproducibility must be established separately.

That leaves the case where judgment reaches no conclusion at all — which is not a gap in the method but a result the graph must be able to hold.

Next: [recording what is not known](06-unresolved-as-first-class.md).
