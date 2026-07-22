# Shared MCP

[HEAD Agent Core](../README.md) / Shared MCP

| Property | Value |
| --- | --- |
| Scope | Shared |
| Delivery | Interface available at runtime; calls are on demand |

## Why It Exists

MCP is the callable interface layer. A shared MCP belongs here when the operation is useful across projects and its contract does not depend on one project's domain model, credentials, or source layout.

MCP exposes capabilities. Skills define when and how those capabilities should be used, while Agents own bounded outcomes that may use them.

## Shared MCPs

- [`agent-task`](agent-task/README.md)

Project-owned integrations belong in [Project MCP](../projects/mcp/README.md).
