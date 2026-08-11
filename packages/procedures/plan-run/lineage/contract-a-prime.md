# Contract A Prime

## Trigger

The user says exactly `정리 끝` after rich planning `P` based on `a`, or the user is reviewing the first whole-plan outline produced by a proposed `a′`.

## Exact reads

Read immutable `a`, the rich planning conversation since `a`, the exact accepted and rejected user decisions in that conversation, the proposed `a′` identity and outline when one exists, and `anchor-operations.md`. Do not pass the raw planning conversation to a loaded child.

## Authority

The user owns material decisions and decides whether the outline proves that `a′` understood the intended whole. The current `P` compiles the transfer. A loaded child may expose ambiguity but cannot decide it.

## Produced result

Perform this loop:

1. Compile one Plan Contract containing the accepted whole intent, locked decisions, material rejected interpretations and reasons, unresolved decisions, authority boundaries, success and stop conditions, return-to-user conditions, and material dependencies on `a`.
2. Load `a` with only that Plan Contract and `save_as` a unique proposed `a′`. The materialization command tells the child to adopt the contract without elaborating or resolving it. Keep `P` as the continuing lineage controller.
3. Load that exact saved `a′` without `save_as`. Ask it to produce the first whole-plan outline that shows the intended result, major parts, relationships, boundaries, unresolved matters, and return conditions. The outline is the child's primary result; do not add a separate comprehension report or validator.
4. Present the outline to the user. Approval selects that saved identity as the accepted original `a′` and the outline as the initial accepted plan. Do not begin generation before approval.
5. If the user corrects the outline, update the Plan Contract with the correction, load immutable `a` again under a new unique proposed name, and repeat. A rejected proposed anchor remains immutable and unused; never mutate or silently reuse it.

The result is one user-accepted original `a′` whose own outline demonstrates its understanding. It inherits `a` and the accepted Plan Contract, not `P`'s raw conversation. User review, rather than another model or machine check, is the first mandatory review gate.

## Mutation class

Plan Contract canon, proposed immutable `a′` creation, disposable outline tasks, and user review. No production mutation.

## Next consumer

`generation-loop.md` after the user accepts the first outline.
