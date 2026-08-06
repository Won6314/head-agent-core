# HEAD Agent Core Foundations

## The starting problem

An AI model does not enter each turn with a durable, human-like understanding of the project. It acts from the context assembled for the present interaction. That context can be incomplete, stale, contradictory, or dominated by a recent generated result.

This creates a compounding failure mode:

1. a request contains an important goal or constraint;
2. an intermediate result omits or reinterprets it;
3. the next step treats that result as its premise;
4. later checks judge consistency against the narrowed premise;
5. the work becomes polished and internally coherent while no longer solving the original problem.

The central problem is therefore not simply generation quality. It is how the right authority reaches the right owner at the right time, and how the intended outcome survives transitions between people, models, workers, tools, and context windows.

## HEAD as the whole-outcome owner

HEAD is the coordinating owner of the whole outcome. It is responsible for:

- understanding the requested result;
- locating the authority that governs it;
- identifying decisions and their owners;
- shaping the work before production;
- choosing direct work, bounded delegation, or a durable Run;
- composing context for each owner;
- integrating evidence and subordinate results;
- deciding whether the agreed outcome actually holds.

This does not make HEAD the owner of every decision. The user retains material project direction and material product, policy, architecture, cost, workflow, publication, and external-action choices. HEAD owns ordinary planning and execution decisions inside that direction. A worker owns one bounded result and its local method.

The distinction prevents two opposite failures: silently allowing a local worker to redefine the whole outcome, and sending every ordinary implementation choice back to the user.

## The work model

Between a high-level request and low-level activity, HEAD maintains a work model. The model identifies:

- the user-visible or operational result;
- the major parts and relationships that must remain true together;
- material decisions and their owners;
- the next coherent result;
- evidence appropriate to that result.

The work model is deliberately smaller than a total decomposition. It expands only far enough to preserve the whole and make the next result executable. Real output then updates the model.

This is why HEAD prefers strong general rules and a visible primary path over growing lists of exceptions, speculative risks, and defensive branches. Added machinery is useful only when it carries a real responsibility that simpler ownership and evidence cannot preserve.

## Authority before information volume

More context is not automatically better context. A large prompt can contain obsolete plans, raw research, copied history, unmarked guesses, and several competing sources. The model still has to infer which parts govern the current decision.

HEAD instead composes the smallest complete context for one owner and one result:

- authoritative inputs;
- locked decisions;
- relevant boundaries;
- the result's consumer;
- representative proof.

Broad knowledge stays in indexed canonical sources. Mutable evidence is retrieved near the decision that needs it. A worker brief is not a transcript dump, and a worker's temporary interpretation does not become general project authority.

## Canon across time

Continuity is an authority problem, not merely a memory problem. Summaries, progress notes, chat history, logs, and worker reports are useful representations, but they can lose conditions or merge unresolved decisions.

HEAD therefore uses canon: durable project records that preserve identity, agreement, route, and current position outside the lossy conversation.

- A **Session** preserves the identity and ongoing agreement of a line of work.
- A **Run** preserves the goal, boundaries, route, checkpoint decisions, and current coherent result for durable execution.
- A **ledger** records accepted observations and decisions in sequence.
- A **Slice** describes the current executable result without replacing the parent agreement.

Recovery starts from canon. Summaries and graph records help locate evidence, but they do not silently redefine the agreed scope.

Canon is not truth by itself. It can preserve a mistaken agreement and must change when the user changes direction. Its purpose is to keep authority stable enough that correction remains possible.

## Delegation without authority drift

Delegation is useful when a result can be owned independently. It is harmful when a worker must invent the parent goal, decide a material trade-off, or reconstruct broad project context from fragments.

Before delegation, HEAD compiles one independently executable result. The worker receives the authority needed for that result and keeps local execution judgment. It does not receive ownership of the parent plan.

The return path follows the same rule. A worker result is evidence and a produced artifact, not automatic authority. HEAD re-anchors it on the parent outcome, inspects the actual result, and decides whether to accept, correct, or reopen it.

Different worker roles exist because different results carry different decision latitude:

- a bounded implementation can permit ordinary local design choices;
- a fully decided Run contract must preserve every observable decision;
- a consequential review needs independence from implementation but does not choose the final direction.

## Evidence and completion

Plans, tests, reviews, and reports support execution; they do not replace the working result.

For each owned result, HEAD Core prefers connected proof:

```text
authoritative input
  → intended primary path
  → observable output or state
  → actual next consumer
```

The evidence must match the claim. A unit test can support an algorithmic property but may not prove the installed public path. A screenshot can prove a visible state but not a backend transaction. A worker report can point to evidence but does not substitute for the artifact it describes.

Completion occurs when the agreed outcome and representative primary path actually hold, not when every planned activity has been performed.

## Why the graph is an index

A graph is valuable because the system contains many relationships: Features, source files, roles, Sessions, Runs, history, and project-specific extensions. The graph can select a bounded source set and expose missing or stale mappings.

But the graph is still a representation. It can lag behind current source or encode an old ownership boundary. Therefore HEAD uses it as an index:

1. query the graph for the relevant Feature or File relationship;
2. read the smallest current source set that can change the judgment;
3. let current source or runtime evidence decide behavior;
4. reconcile the graph when the representation is stale.

This preserves the retrieval value of the graph without turning derived metadata into unquestioned authority.

## Project and Core boundaries

HEAD Core is reusable because it owns only shared coordination behavior:

- public installation and project composition;
- HEAD principles and execution shaping;
- Session/Run continuity and recovery;
- bounded worker roles and coordination;
- host-owned task and message state.

A project owns what gives that behavior meaning in its domain:

- product and policy definitions;
- repository and deployment boundaries;
- canonical local sources;
- credentials and external-service configuration;
- project-specific Skills and worker overlays;
- operational history and current work canon.

Core is not copied project history, and a project is not merely configuration for an autonomous Core. Live behavior exists only when shared mechanisms are bound to current project authority.

## Limits

HEAD Core remains fallible.

- The selected authority can be wrong.
- The work model can misunderstand the user's intent.
- Context can be too narrow or too broad.
- Canon can become stale.
- Evidence can test the wrong claim.
- Delegation can add cost and another handoff.
- Tools and runtime identity can fail.

The design does not claim that every task needs a Run, a worker, a graph query, or formal review. Structure should scale with real consequence, coordination, continuity, and evidence needs. When the level is unclear, direct coherent work is the default.

Human direction remains necessary. Capability never grants authorization for material external action.

## Further reading

The focused design-background chapters expand individual parts of this argument:

1. [Present context and controlled expansion](../theory/01-present-context-and-controlled-expansion.md)
2. [Ownership and context boundaries](../theory/02-ownership-and-context-boundaries.md)
3. [Continuity and canon](../theory/03-continuity-and-canon.md)
4. [Evolution, evidence, and limits](../theory/04-evolution-evidence-and-limits.md)
