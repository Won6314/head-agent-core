# Dispatch

## Trigger

Execution `B` has one exact A-selected plan horizon whose worker-facing execution contracts have been materialized without changing Plan meaning.

## Exact reads

Read the exact selected plan horizon, its execution contracts or correction deltas, selected worker readiness branches, active Run identity, active A identity and accepted Plan file, and current position. Do not reload plan generations or broaden any worker packet.

## Authority

Only active execution `B` may dispatch the exact selected horizon. `B` cannot change its membership, Plan result, schedule, review destination, or next position. Each worker owns production, directly encountered local correction, representative proof, and evidence-backed conflict return inside its execution contract; it cannot amend the contract or Plan.

## Produced result

1. Confirm active Run mode and that the selected horizon is the exact current horizon from canonical A review or initial `A`.
2. Compile the fixed horizon into one `frozen_wave` manifest. Independent contracts run in parallel; dependent or conflicting contracts must not be present. Set each node's `executionContract` to its exact source contract path, and set `manifest.checkpointReview = { authority: activeAName, planFile: absoluteAcceptedPlanPath, runFile: absoluteRunCanonPath, sliceFiles: absoluteCurrentExecutionContractPaths }`. The runtime freezes each contract's bytes and digest before worker launch, binds each worker to its mapped frozen copy, and terminal completion automatically forks active A for review.
3. Dispatch each worker with only its execution contract and exact referenced sources. Require its selected readiness preflight before mutation and an evidence-backed `PLAN_CHANGE_REQUIRED` return when observable Plan behavior remains undecided.
4. Set the terminal consumer to `../run/review-checkpoint.md` using the active A identity. Suppress per-worker completion as a Run-advancement signal; only the validated wave aggregate advances the Run.
5. After dispatch, `B` performs no integration, review, correction selection, or next-work selection. The terminal aggregate, actual execution state, produced artifacts, and direct evidence references route directly to A review.

## Mutation class

Frozen-wave horizon dispatch and worker lifecycle state.

## Next consumer

`../run/review-checkpoint.md` after the horizon reaches a terminal aggregate with immutable execution-contract evidence.
