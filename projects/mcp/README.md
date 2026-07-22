# Project MCP

[HEAD Agent Core](../../README.md) / [Project Layer](../README.md) / Project MCP

| Property | Value |
| --- | --- |
| Scope | Project-owned |
| Delivery | Interfaces registered by the project; calls are on demand |

## Why It Exists

Many integrations depend on private endpoints, domain schemas, credentials, local bridges, or project-specific mutation policy. Keeping them in the project layer prevents those assumptions from entering the portable MCP surface.

## Boundary

A project MCP should expose one coherent integration contract. Project Skills define task-specific procedures for using it, and Project Core defines authorization boundaries.

An MCP should move to [Shared MCP](../../mcp/README.md) only when its contract remains useful and safe without project-specific domain assumptions.
