---
name: delegate-once
description: >
  One-shot delegation of one decided kind of work. Investigation, design, implementation, and review are separate assignments; HEAD receives the result and decides the next task. The worker gets the necessary context and returns only the assigned result.
---

# Delegate Once

Use this workflow only after HEAD has directly established and retained the whole-outcome context and selected one decided kind of work. Choose a fresh agent or fork using [start-job](../start-job/SKILL.md); a bounded result alone is not a reason to fork.

## One Kind of Work per Delegation

- Never bundle investigation, design, implementation, and review into a sequence for one worker.
- Instructions such as "investigate, then fix it" or "find the problem and resolve it yourself" are prohibited.
- If investigation is needed, delegate only investigation and have the findings returned.
- HEAD reviews the findings, decides what to change and how, then delegates implementation separately.
- If the assigned work requires a new decision, the worker returns the findings and decision needed to HEAD instead of proceeding to the next stage.

The worker performs one decided task. It does not choose and execute the next task.

## Entry Contract

Before delegation, HEAD knows:

1. why the result is needed and its exact real consumer;
2. the required observable output or state and acceptance boundary;
3. the authoritative inputs and locked decisions;
4. the mutation and preservation boundaries;
5. the representative proof that will demonstrate the consumed result.

Local source inspection begins only inside this bounded result. Parent understanding, product or policy judgment, and integration decisions remain with HEAD.

## Slice And Dispatch

1. Select an owner for the single assigned kind of work, and distinguish its starting context:
   - **Context fork:** It is yourself with the source context. State only a clear goal; do not restate the background it already holds. `context_run` adds the `[forked]` marker automatically. This is a task to perform, not text to comment on. Do not fork `current` to review work you just produced. The Entry Contract is what HEAD must know, not a checklist to repeat in the prompt.
   - **Fresh worker:** Supply the context it lacks: required output, authoritative inputs, locked decisions, consumer, acceptance, mutation and preservation boundaries, and representative proof. Exact readable authority references may carry source content; HEAD's private context is not inherited.
2. For a fresh specialist worker, load only its selected branch. For `developer`, read [developer.md](../../procedures/delegate-once/workers/developer.md). For `coder`, read [coder.md](../../procedures/plan-run/workers/coder.md) and supply its task-specific `context.md` specification.
3. Express any boundaries that need communicating as behavior and state to preserve. Name a prohibited alternative only when it is a plausible material action; pair it with the behavior to perform instead.
4. Dispatch only the decided task and require its result to be returned. Do not give the worker authority to choose and proceed to another kind of work.

## Return And Reintegration

The worker returns the assigned result, direct evidence, and any decision needed or contract conflict. HEAD reintegrates it into the whole-outcome context, judges completion, and decides any next task before a separate delegation.
