---
name: delegate-once
description: >
  Use after HEAD has directly established and retained the whole-outcome
  context, when one production result can be represented as a coherent bounded
  subset and independently implemented, verified, and returned once.
---

# Delegate Once

Use this workflow only after HEAD has directly established and retained the whole-outcome context and selected one independently executable result.

## Entry Contract

Before delegation, HEAD knows:

1. why the result is needed;
2. the exact result and its consumer;
3. the authoritative inputs and locked decisions;
4. the mutation and preservation boundaries;
5. the representative proof that will demonstrate the result.

Local source inspection begins only inside this bounded result. Parent understanding, product or policy judgment, and integration decisions remain with HEAD.

## Slice And Dispatch

1. Select the worker that can own the bounded result end to end.
2. Load only the selected worker branch. For `developer`, read [developer.md](../../procedures/delegate-once/workers/developer.md).
3. Compile the smallest complete execution context for that worker.
4. State the result, authoritative inputs, locked decisions, boundaries, consumer, unchanged behavior, and representative proof.
5. Dispatch only when the worker can implement, correct, verify, and return the result once without Run planning or checkpoints.

## Return And Reintegration

The worker returns artifacts, observed state, direct evidence, and any bounded contract conflict. HEAD inspects the returned result, reintegrates it into the whole-outcome context, and judges completion or the next path.
