---
name: delegate-once
description: Use only when HEAD Core selects the one-shot delegation level; select one worker and prepare one independent quick-task return without Run planning.
---

# Delegate Once

Use this procedure only after HEAD Core selects one independently owned result that can return once without Run planning or checkpoints.

## Route

1. Select the worker before writing the command.
2. If `developer` owns an implementation result, load `delegate-developer`.
3. Compile the smallest complete command for the selected worker.
4. Dispatch only when the worker can own the result and return it once. Otherwise reconsider the execution mode.

## Command Boundary

State the result, authoritative inputs, locked decisions, boundaries, consumer, and representative proof. Leave local execution judgment with the worker inside that contract.
