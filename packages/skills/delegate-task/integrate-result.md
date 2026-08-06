# Integrate Result

## Trigger

A dispatched worker has returned artifacts and evidence.

## Exact reads

Read immutable `A`, `run.md`, the originating Slice, the validated handoff, produced artifacts, direct representative evidence, and the latest Run position. Do not accept the worker's framing as the parent model.

## Authority

Persistent `B` re-anchors and judges the result. Worker returns, tests, and reviews are evidence, not authority over the Run or user decisions.

## Produced result

1. Re-read the Slice's intended consumer result before reading conclusions in the handoff.
2. Compare actual artifacts and observable state with that result and its representative proof.
3. Accept only supported behavior. Choose accept, correct, defer, separate, reopen, or reject from connected evidence.
4. If the Slice remains valid, return bounded correction to the same worker. If evidence invalidates the parent plan or requires a user-owned decision, stop dependent mutation and return upward.
5. Record the integration decision and direct evidence references without yet selecting a new result.

## Mutation class

Integration decision and evidence references only; checkpoint progression is owned by `start-run/checkpoint-run.md`.

## Next consumer

`start-run/checkpoint-run.md`.
