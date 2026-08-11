# Planning Generation Loop

## Trigger

The user accepted the first whole-plan outline from original `a′`, or an accepted generation still contains leaves that can be decomposed with current information.

## Exact reads

Read the original accepted `a′`, the current immutable planning anchor (`a′`, `a1`, …), the current accepted whole-plan artifact, the leaves currently classified as decomposable or ready, `../results/prepare-slice.md`, the selected worker readiness branch for each ready candidate, the exact existing method and authoritative sources needed by those leaves, and `anchor-operations.md`.

## Authority

The current complete-context planning HEAD `P` selects the decomposable frontier and accepts or rejects each generated whole plan. Existing Skills own their methods. Part children own only their assigned leaves. The one whole-plan reviewer generates the next complete plan but cannot alter locked user decisions, resolve a user-owned decision, or promote itself.

## Produced result

Repeat one complete generation at a time:

1. Read the current whole plan and apply the leaf decomposition gate below to every leaf, including leaves already labelled ready. A prior readiness label is not evidence. Select every leaf that can still be decomposed with current information. Exclude a ready leaf only after the gate passes, and exclude a planning-deferred leaf only when its next shape genuinely waits for a named prerequisite. If no decomposable leaf remains, continue to `finalize-A.md`.
2. Load the same current anchor once per decomposable leaf, without `save_as`. Give each child the current whole plan, its exact owned leaf, `../results/prepare-slice.md`, the selected worker readiness branch, only the other methods and sources that can change that leaf, and the instruction to decompose it as far as current information permits. It must preserve the surrounding plan and return either a proposed subtree with material dependency effects or a readiness basis proving why the leaf is one coherent result. Do not require a result schema or validation sidecar.
3. Let the part calls run independently. A missing or failed handoff is an actual operation failure, not an empty planning result; do not infer its content or advance the generation from an incomplete set.
4. After every part handoff exists, load the same current anchor once more without `save_as` as the single whole-plan reviewer. Give it the prior whole plan and the exact part handoff locations. It directly generates the next complete whole plan: integrate the subtrees, repair overlap and omission, preserve locked meaning, make dependencies explicit, retain a delegation-ready or execution-deferred leaf only with its accepted readiness basis, retain planning-deferred leaves with their prerequisite and reopening trigger, and identify the next decomposable frontier. The reviewer may not preserve a readiness label that lacks the gate evidence below.
5. The reviewer packages the complete plan as one result when coherent. If one result would obscure meaningful part boundaries, it may produce an indexed set and return its root. No separate packager, aggregate, score, schema, or validator is used.
6. `P` inspects the generated whole plan as an authority judgment. If it changes a locked decision, rejected interpretation, authority boundary, user-visible result, material architecture, cost, risk, success condition, or stop condition, return only the exact blocking decision to the user before acceptance; this is not another whole-plan review gate. If it is merely incomplete or inconsistent, request one corrected whole-plan result from the same anchor; do not patch reviewer meaning in `P`.
7. After `P` accepts the exact whole-plan result, load the current anchor with that result and `save_as` the next unique generation name: original `a′` produces `a1`, `a1` produces `a2`, and so on. The materialization child adopts the accepted whole plan without further elaboration. Do not save a part child, reviewer candidate, rejected result, or trivial wording revision as the next conceptual generation.
8. Repeat from step 1 using the new generation anchor and its accepted whole plan.

### Leaf decomposition gate

Before a leaf can be classified as delegation-ready or execution-deferred, describe its owned result, persistent or state domains, state transitions, transaction and rollback boundaries, mutation surfaces, downstream consumers, and representative proof domains. Apply `../results/prepare-slice.md` and the selected worker readiness branch to that model.

Keep decomposing when the model contains two or more independently consumable state machines, rollback boundaries, mutation surfaces, downstream results, or proof domains that can return useful evidence separately. One module, database, snapshot, service, or final artifact does not by itself make the work one coherent leaf. A readiness basis must show one independently executable consumer result, its fixed observable behavior, its state and rollback boundary where applicable, and why no identified internal boundary is a separate consumable result.

Generation is complete only when every delegation-ready or execution-deferred leaf has an accepted readiness basis from this gate and every other leaf is planning-deferred with an explicit re-entry trigger. Classification labels alone do not close decomposition.

- A delegation-ready implementation leaf satisfies the selected worker readiness method, not only this planning summary. It fixes every applicable observable decision about primary logic and order, inputs/outputs/interfaces, persistent meaning and schema, state transitions, validation and failure, permission/cost/operational policy, mutation and preservation, and representative proof. Naming those topics without deciding them is not readiness.
- An execution-deferred leaf has the same fixed contract but waits for a named predecessor artifact or interface. Satisfying the dependency makes Slice preparation possible; it does not waive the worker-readiness check.
- A planning-deferred leaf is one whose decomposition, owned result, interface, state meaning, or other observable behavior cannot yet be fixed. It states the prerequisite, the undecidable matter, the planning re-entry trigger, and the decision owner. Satisfying that prerequisite requires additional planning before Slice preparation or dispatch.

If field evidence after immutable `A` shows that a leaf called delegation-ready or execution-deferred was actually under-decomposed or left an implementation-changing decision open, that is a plan defect. Execution successor `B` must stop dependent production and return it for additional planning; `B` may not repair `A` by silently splitting, elaborating, or reclassifying the leaf.

## Mutation class

Parallel disposable part tasks, one disposable whole-plan reviewer per attempt, accepted plan artifacts, and immutable generation creation. No production mutation.

## Next consumer

This file while any decomposable leaf remains, or `finalize-A.md` when every delegation-ready or execution-deferred leaf has passed the gate and every remaining leaf is planning-deferred with an explicit re-entry trigger.
