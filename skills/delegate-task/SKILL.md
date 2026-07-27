---
name: delegate-task
description: Delegate one or more coherent outcomes to worker agents with the smallest complete context needed for independent, composable execution.
---

# Delegate Task

Delegation transfers subordinate ownership of one result, not the parent work model or a list of disconnected actions.

## Shape The Outcome

A worker brief and its referenced sources make these meanings clear:

- the result to produce and why it matters
- authoritative starting inputs and locked decisions
- the worker's ownership boundary and role in the larger structure
- the behavior, artifact, or state the parent work will consume
- the direct evidence that makes the result integrable and the material conflicts that return to HEAD

Give the worker the smallest complete context that supports those decisions: its current Slice, relevant `plan.md` section(s), and exact sources or evidence required by that Slice. Do not provide the full plan, transcript, ledger history, or prior worker narrative by default. Keep broad project history, unrelated failures, and generic process outside the brief. Preserve technical autonomy inside the defined outcome.

Delegate the owned result, not a general instruction to improve, harden, test, or make the area robust. The worker may implement the contract-owned primary result, make ordinary local choices inside the selected architecture, run existing or explicitly owned checks, and produce direct evidence. It may not create unowned tests or hardening, expand the mutation surface, invent another authority or recovery path, or turn an observed contradiction into a local repair plan.

For complex work, pass one HEAD-authored slice brief and its exact sources rather than copying the whole parent run into the command. The slice is the HEAD-worker contract: HEAD owns its upper outcome and boundaries; the worker owns local execution judgment. A short command is sufficient when the outcome is already clear without a durable brief.

## Schedule By Composition

Start outcomes together when they have independent ownership, ready inputs, clear shared contracts, compatible outputs, and non-conflicting mutation surfaces. Sequence an outcome when it consumes another outcome's result, may revise the other's architecture, or shares a mutation surface that requires one owner.

Prefer one worker for diagnosis, implementation, and direct outcome evidence within the slice. Use an independent reviewer only when separate judgment can materially change a consequential result.

## Integrate

When a worker completes, re-anchor on the parent outcome and slice before reading its result. Treat the return as claims and candidate evidence, not as authority over the next plan. Accept, defer, separate as follow-up, legitimately reopen, or reject each material claim against the parent outcome. Reopen when connected evidence shows a failed intended behavior, material contradiction, changed user requirement, or disproved assumption; otherwise continue from the produced outcome rather than repeating the worker's work or automatically adding validation.

## Checkpoint-Governed Runs

When the parent run is marked checkpoint-governed, do not dispatch its slices as unrelated quick tasks. Compile the current horizon into the project's aggregate/frozen execution manifest, including a one-node horizon when that slice must return through the parent checkpoint.

The delegated owner performs local diagnosis and correction only inside the owned primary result, runs existing or explicitly contracted checks, and produces direct evidence. A directly encountered fact that makes an owned output impossible or unsafe to claim returns as terminal `contract_conflict` with only the blocked output, decisive fact, and evidence references. The worker does not contact HEAD during a checkpoint-governed node, propose additions, request a same-node resume, or create retries, remediation nodes, or parent-plan changes.

HEAD integrates only the aggregate checkpoint and directly observed artifacts, then decides the next horizon from the whole run.

At that checkpoint, add the aggregate reference and necessary direct artifacts to the default recovery context, record observation, decision, and next in the ledger, and replace only the run checklist/current pointer. Do not create a checkpoint summary document by default.
