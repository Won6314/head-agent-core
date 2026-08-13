# Coder Run Branch

Use from `plan-run` planning or [prepare-execution-contract.md](../results/prepare-execution-contract.md) after selecting `coder` for a fully decided Run implementation result.

## Contract Readiness

Before writing the coder Slice, HEAD fixes each applicable decision that could change externally observable behavior:

- primary logic and execution order
- inputs, outputs, and interfaces
- persistent data meaning and schema
- state and state transitions
- validation, exception, and failure behavior
- security, permission, cost, and operational policy
- intended mutations and preservation boundaries
- representative acceptance result

Coder chooses only local implementation details that preserve the contract and acceptance result. If materially divergent observable behavior remains possible, do not dispatch; return the decision to HEAD planning before implementation or test mutation.

## Worker preflight

Every coder Execution Contract and dispatch must require this check before mutation:

1. Read the owned result, state transitions, validation/failure rules, boundaries, and representative proof.
2. Identify any remaining choice that could change accepted input, output/interface behavior, persistent meaning, transition result, failure/rollback behavior, permissions/cost, preservation, or the consumer-visible result.
3. If such a choice remains, make no implementation or test mutation. Return `contract_conflict` with the exact missing decision, one concrete pair of divergent valid-looking behaviors, and the source lines that leave it open.
4. Begin production only when the contract determines those observable behaviors. Local names, code organization, and equivalent internal mechanics remain coder-owned.
