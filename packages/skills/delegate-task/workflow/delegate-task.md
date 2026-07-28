# Delegation Workflow

## Principle

Delegation is an optimization, not a required phase. HEAD owns primary evidence, user decisions, the complete outcome context, integration, and final verification. A worker owns one bounded outcome and must not invent missing project-level decisions.

## Prepare

1. Identify the desired outcome and why delegation is useful.
2. Separate verified facts, user decisions, and unverified hypotheses.
3. Identify real dependencies, write overlap, and authority boundaries.
4. Select an available worker from the current project's agent policy.
5. Use a WorkUnit only when durable coordination, evidence, recovery, or handoff materially benefits.

## Brief

Give the worker enough context to act without redefining the larger outcome:

- objective and reason
- execution mode if the worker supports multiple modes
- verified facts and source references
- unknowns and stop conditions
- exact scope and ownership boundary
- allowed reads/writes and forbidden actions
- intended behavior or input/output contract
- observable acceptance criteria
- required output or report format

Use a short command for small work and a referenced task file for complex work. Do not duplicate generic worker policy in every command. Preserve technical autonomy unless exact protocol execution is itself the outcome.

## Slice And Schedule

- Prefer one owner for diagnosis, implementation, and verification of a coherent outcome.
- Parallelize only outcomes with independent ownership, independent acceptance evidence, and no shared mutable state.
- Serialize work that depends on a shared decision, prior output, interface, file, or side effect.
- Do not split work mechanically by file count, layer, or process phase.

## Execute And Recover

1. Dispatch ready work through `quick_task` using the project-approved runtime/model route.
2. Continue independent HEAD work while the task runs.
3. Return control when no independent work remains; completion notification resumes validation.
4. Read the worker output after completion and verify it against primary evidence and acceptance criteria.
5. Inspect state or logs only for failure diagnosis or an explicit progress request.
6. If the result exposes a missing authority decision, resolve it before further mutation.
7. If repeated correction costs exceed direct completion, HEAD takes over.

Worker completion is evidence, not final acceptance. HEAD reports completion only after integration verification.
