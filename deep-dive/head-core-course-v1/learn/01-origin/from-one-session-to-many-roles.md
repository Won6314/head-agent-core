# From One Session To Many Roles

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Origin](README.md) / From One Session To Many Roles

## Learning Objective

Understand why I stopped treating one long LLM conversation as the natural container for every kind of work.

## The Starting Point

I began with the simplest possible arrangement: one conversation, one model, and every task in the same context. Research, planning, implementation, review, and documentation all happened in sequence.

That worked while the project and the requests were small. The model could see the relevant material, the user could remember the recent decisions, and a mistake rarely propagated very far.

As the work grew, three different problems became entangled.

### Context Mixing

A conversation used for several purposes accumulated incompatible working sets. Research notes stayed beside implementation details. Failed attempts remained beside accepted decisions. A new request entered a context optimized for the previous request.

The issue was not only context-window capacity. Even before reaching a hard limit, the model had to distinguish current authority from historical residue. More material created more opportunities to follow an old assumption, over-weight an irrelevant detail, or miss the few lines that actually governed the next decision.

### Role Confusion

Different kinds of work require different decision rights. A researcher may identify evidence. A developer may choose a local implementation. A reviewer should challenge a result without silently redesigning it. When all of these roles lived in one undifferentiated session, the same model could propose a decision, implement it, and then approve its own assumptions.

The problem was not that one model was incapable of performing those actions. The problem was that the workflow did not preserve which perspective was active, which claims were authoritative, and who was allowed to change the goal.

### Sequential Bottlenecks

Independent work had to wait behind unrelated work because one session could only advance one conversational thread at a time. In principle, several tasks could run concurrently. In practice, parallelism without explicit ownership risked conflicting edits and divergent interpretations.

## The First Split

The first architecture separated long-lived role agents. Each role received an isolated context, a focused instruction set, defined inputs, and expected outputs. A coordinating HEAD role planned phases and connected their artifacts.

```text
User
  |
  v
HEAD coordinator
  |-- research role
  |-- planning role
  |-- implementation role
  `-- validation role
```

This improved three things immediately:

- unrelated execution details stopped occupying the same conversational context;
- independent roles could proceed in parallel when their dependencies were clear;
- failed work could be repeated at the role or phase boundary instead of restarting the entire process.

It also introduced the next generation of problems. Role agents could drift from one another. Their state had to be transported and recovered. More agents increased routing, monitoring, and synchronization work. The system had gained structure, but structure alone did not guarantee coherent ownership.

## What The First Split Taught Me

The durable insight was not "more agents are better." It was narrower:

> Different decision scopes need explicit owners and different context boundaries.

The early design used roles as the boundary. The current design refines that idea further: HEAD remains the single owner of the whole outcome, while a worker temporarily owns one coherent, bounded result.

## Related Theory: Retrospective Lens

This early split resembles several established ideas:

- single responsibility, because one role should have one reason to change;
- bounded context, because the same terms and facts do not need to mean everything everywhere;
- hierarchical planning, because a high-level goal is elaborated into lower-level executable results;
- directed acyclic scheduling, because independent outcomes can proceed together while real dependencies remain ordered.

These concepts are useful explanations now. The historical record shows an operational response to context mixing, role confusion, and sequential work; it does not show that the architecture began as a formal implementation of those theories.

## Common Misunderstanding

The split was not primarily a way to imitate a human company or assign personalities to models. The important unit was responsibility, not character. A role existed to constrain context and decision authority around a result.

## Takeaway

A single session is sufficient until unrelated context, incompatible decision rights, or independent work begin to interfere. The first multi-agent design addressed those symptoms, but it also revealed that agent count is not the same as coherent ownership.

Next: [What Kept Breaking](what-kept-breaking.md)

Source class: historical repository documents and current ownership contracts.
