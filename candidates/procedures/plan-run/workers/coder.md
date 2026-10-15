# Coder Specification Branch

Use after `delegate-once` or `plan-run` selects coder for a fully decided implementation result. HEAD or developer applies development criteria before preparing the specification; coder receives the resulting specification, not the criteria as design authority.

## Contract Readiness

Write one task-specific `context.md` in the task's artifact directory, separate from HEAD's session context. It is the complete implementation specification and names the exact source inputs. Fix each applicable decision before dispatch:

- primary logic and execution order
- inputs, outputs, and interfaces
- persistent data meaning and schema
- state and state transitions
- validation, exception, and failure behavior
- security, permission, cost, and operational policy
- intended mutations and preservation boundaries
- representative acceptance result

Specify processing rules as well as external behavior. Code-expression details may remain open; choosing another algorithm, processing order, validation policy, or state rule does not belong to coder. A known missing decision returns to the specification author before dispatch.

The dispatch names `context.md` and the runtime handoff, without adding another behavioral brief. For a Run, use it as the coder Execution Contract's specification and identify the exact frozen copy supplied to the worker. Corrections are authored by HEAD, not amendments by coder.

## Worker preflight

The [Coder Core](../../../agents/coder/CODER_CORE.md) governs this check before implementation or test mutation:

1. Read `context.md` and its exact inputs, including the specified processing rules, boundaries, and verification.
2. Determine whether implementation requires a behavior, state, or processing decision not settled there, or whether the actual target conflicts with the specification.
3. If so, make no implementation or test mutation. Return `contract_conflict` with the required decision and source evidence rather than filling the gap.
4. Otherwise translate the specified rules into code and perform the specified verification.
