# What Descends and What Ascends

[한국어](ko/07-descent-and-ascent.md) · [Index](README.md)

## One Operation, Two Scopes

Building a graph for the first time and updating it after a change feel like different jobs. One is creation, the other maintenance; one is large and deliberate, the other small and routine.

They are the same operation.

In both, decisions descend from the top of the product axis and observations ascend from the implementation, and the two are compared where they meet. Initial construction compares them across the whole product. Propagating a change compares them across what moved. Scope is the only variable.

```text
first construction    descent × ascent, over everything
propagation           descent × ascent, over what changed
```

Treating them as two procedures is how they drift apart, and the drift always runs the same direction: the update path acquires shortcuts the construction path did not have, and the graph slowly becomes something that could no longer be built the way it is now being maintained.

> If the update procedure cannot reproduce the graph from nothing, it is not maintaining the graph — it is amending it.

## The Comparison Happens at the Commitment Layer

Descent terminates where commitments live. Ascent, having climbed from the implementation, terminates there too. The comparison is between what was promised and what the evidence supports, and it has five possible outcomes.

```text
agreed                promise and evidence match
implementation only   evidence supports a rule nobody approved
intent only           a promise with no evidence behind it
inconsistent          both present and they disagree
unresolved            not determinable from available evidence
```

Only the first is quiet. The middle three are findings, and the fifth is the honest null from [recording what is not known](06-unresolved-as-first-class.md).

*Implementation only* deserves particular attention because it is easy to misread as an attribution gap. The system behaves according to a rule that was never decided. Whether the rule is good is a separate question; that it is operating undeclared is the finding.

*Intent only* is its mirror: something was promised and nothing implements it. This is the discovery that a decision was made and then quietly not carried out, which no amount of reading the implementation would ever surface, because the implementation's silence looks exactly like the topic never existing.

## Disagreement Is Not an Update Path

Everything procedural in this page follows from one sentence.

> When descent and ascent disagree, that is a broken invariant, not an instruction.

The axis rule from [two axes and where they cross](02-two-axes.md) says authority moves down and never up. So an observation that contradicts a commitment cannot resolve the contradiction — it can only report it. Resolution requires a person, at the third gate, and until then both sides stand as recorded.

The tempting alternative is to let the newer information win. It is simple, it requires no queue, and it keeps the graph internally consistent at all times. It also silently converts every unimplemented decision into a decision that was never made, and after enough cycles the graph's account of what was promised is just a description of what was built.

Consistency by overwriting is not consistency. It is amnesia with good manners.

## Preservation Rules Are Consequences

Because collision must not resolve itself, the update procedure has to be constructed so that collisions are impossible to produce accidentally. Each of the following is derived from that requirement rather than adopted as a practice.

**Existing assignments are supplied as input and must be returned unchanged.** A procedure that receives only the changed material and produces a fresh result has no way to preserve what it was not shown — the unshown simply vanishes. Supplying the current state and requiring it back verbatim converts silent loss into a detectable mismatch.

**Identities are permanent and never reused.** From [identity decides resolution](04-identity-and-resolution.md): if identity moves, every prior decision attached to it is orphaned. Reassignment is worse than orphaning, because a decision made about one thing silently becomes a decision about another.

**Full rewrite is prohibited.** A rewrite is indistinguishable, in its output, from a correct update that happens to differ everywhere. There is no way to tell a good rewrite from a catastrophic one by inspecting the result, which means the result cannot be checked at all.

**Writes are reconciled, never replaced.** Compare identity by identity — unchanged, changed, new, gone — and act on each. This is the four-way comparison from the identity page, and it is the only write mode where the amount of change is bounded and visible before the write happens.

**Only the changed scope is exposed to judgment.** Not primarily for cost. Judgment shown a stable record may revise it, and a revision with no triggering change is indistinguishable from drift. Withholding the unchanged makes gratuitous revision structurally impossible.

None of these is a rule about care. They are the shape a procedure must have if disagreement is to remain a finding rather than a silent overwrite.

## The Gate Must Be Automatic

A preservation rule that is checked by a person is a preservation rule that holds until the week someone is busy.

The failure this guards against is uniquely bad at being noticed. A cycle that loses assignments outside its intended scope produces a graph that is smaller and internally consistent and gives clean answers to every query anyone happens to run. Nothing looks wrong. The loss is discovered later, by someone asking about a region that quietly emptied, with no way to tell which cycle did it.

So the check belongs in the procedure and it must be able to stop it: compare the assignments outside the changed scope before and after; if anything moved, the cycle does not land. A halted cycle costs a day. An unnoticed one costs the accumulated judgment of every cycle before it.

## Two Sources of Change

Only two things put a graph out of date, and they arrive on different axes.

```text
a new revision      the implementation moved
                    → re-observe, re-ascend, re-compare
a new decision      the commitments moved
                    → the descent itself changed
```

The first is the common case and the mechanical one. The second is rarer and more disruptive, because a changed commitment can turn agreement into disagreement everywhere it applies without a single line of implementation changing. Both run the same comparison; they differ in which side moved.

A graph that only handles the first will, over time, hold a current implementation judged against commitments nobody has revisited.

## What This Establishes

Construction and propagation are one operation at two scopes. The comparison happens where commitments live. Disagreement is a finding that only a person settles, and every preservation rule follows from refusing to let it settle itself.

What remains is how much of this to build.

Next: [how far to go](09-maturity-and-adoption.md).
