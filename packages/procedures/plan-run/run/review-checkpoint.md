# Review Checkpoint

## Trigger

The current `frozen_wave` horizon is terminal and the runtime has automatically forked a fresh review HEAD from immutable Plan `A` with the validated aggregate, frozen initial execution contract, actual execution state, produced artifacts, and direct evidence references. `B` did not integrate or judge the result.

## Exact reads

Read active immutable Plan authority (`A`, or an accepted replacement) first. Then read `run.md`, the frozen dispatch-time execution contract as non-authoritative evidence, the validated worker aggregate, actual execution state and produced artifacts, direct evidence references, and latest canonical checkpoint. Do not read or pass `B`'s interpretation, summary, proposed decision, worker-process narration, retry history, tool-call history, or raw transcript.

## Authority

A fresh review HEAD forked from active Plan `A` owns Plan-level checkpoint acceptance and next-horizon judgment. The frozen execution contract, worker reports, tests, validators, and actual state are evidence, not Plan authority. `B` owns no review or routing judgment. The reviewer may not let execution-contract-only validation, defensive handling, proof checklists, or local mechanics expand Plan acceptance, and may not silently replace immutable Plan authority.

## Produced result

1. Confirm from runtime metadata that this review HEAD is a disposable fork of named Plan `A`, and that the supplied Plan, frozen contract, horizon, and aggregate match the active Run.
2. Judge the minimum primary end-to-end Plan result and whether its next planned consumer can use the actual artifact/state. Stop searching when one representative real path reaches that result.
3. Inspect referenced actual artifacts only as needed. Do not reconstruct `B`'s narrative or search for additional malformed inputs, validators, fallbacks, defensive branches, or speculative tests outside the Plan result.
4. Classify the finding before deciding: Plan result satisfied; Plan-preserving local implementation defect; material Plan change; user-owned decision; terminal success/failure.
5. Return one clear decision: `CONTINUE`, `LOCAL_CORRECTION`, `PLAN_CHANGE_REQUIRED`, `USER_DECISION`, `DONE`, or `FAILED`. Legacy `REVISE` means only `LOCAL_CORRECTION` and may not change Plan meaning.
6. For `CONTINUE`, accept the supported Plan result and select every now-ready independent plan result as the next horizon; `B` materializes their execution contracts afterward.
7. For `LOCAL_CORRECTION`, name only the actual defect that prevents the Plan result or consumer and the required Plan-preserving outcome. Do not prescribe extra validation/proof detail or rewrite the initial frozen contract.
8. For `PLAN_CHANGE_REQUIRED`, identify the exact accepted Plan meaning that must change and select no executable horizon. A replacement `A2`, `A3`, and so on is mandatory before further execution.
9. For `USER_DECISION`, `DONE`, or `FAILED`, set no executable next horizon.
10. Persist the exact review result as the canonical checkpoint decision. Output formatting is not authority; a clear substantive judgment remains reviewable by LLM even when it does not match a preferred textual form.

## Mutation class

Read-only review of product and execution state, plus one canonical checkpoint-decision artifact. No production mutation.

## Next consumer

`checkpoint-run.md` applies the canonical decision without re-judging it.
