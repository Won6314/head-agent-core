---
name: delegate-coder
description: Do not load directly; load only from delegate-task after coder is selected for a fully decided Run implementation result.
---

# Delegate Coder

Use this procedure from `delegate-task` after selecting `coder` for a Run implementation result.

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

Coder chooses only local implementation details that preserve the contract and acceptance result. If an implementation-changing decision remains open, do not dispatch; return it to HEAD planning.
