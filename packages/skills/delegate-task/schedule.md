# Schedule

## Trigger

Multiple branches are independently ready after their Slices are prepared.

## Exact reads

Read only the prepared Slices being considered together and their exact inputs, interfaces, outputs, owners, dependencies, and mutation surfaces.

## Authority

The current complete-context HEAD decides readiness. Parallelism cannot create independence; connected decisions, shared mutable state, or output dependencies remain sequenced.

## Produced result

1. Exclude any branch whose input, contract, owner, consumer, or proof is not complete.
2. Sequence branches that consume one another, may revise a shared decision, or touch the same mutation surface.
3. Start branches together only when each can finish and be judged independently.
4. Use aggregate checkpoint execution only when one aggregate judgment materially improves the parent decision.
5. Return either the bounded ready set or one sequential current result.

## Mutation class

Run scheduling state update.

## Next consumer

Before final `A`, the accepted schedule returns to `plan-run/finalize-A.md`. In active `B`, each ready Slice proceeds to `dispatch.md`.
