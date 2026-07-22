# agent-task

[HEAD Agent Core](../../README.md) / [Shared MCP](../README.md) / agent-task

| Property | Value |
| --- | --- |
| Scope | Shared |
| Delivery | Tool schemas available at runtime; operations are on demand |
| Status | Shared architecture target |

## Why It Is Shared

Delegating a coherent outcome, requesting independent review, controlling a worker, and retrieving reusable task guidance are HEAD coordination concerns rather than product-domain concerns. The MCP contract can therefore remain stable while each project registers its own specialist agents and routing policy.

## Boundary

`agent-task` owns the coordination interface. It does not own a project's product decisions, canonical context, specialist definitions, model policy, or approval rules. Those remain project extensions supplied to the shared service.

## Relationship

The [delegate-task skill](../../skills/delegate-task/README.md) defines the reasoning procedure for shaping delegation. `agent-task` provides the callable mechanism that executes it.

The service currently remains outside this repository while its packaging is migrated to the shared layer. This page records the intended ownership boundary without copying the project implementation.
