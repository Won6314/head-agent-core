# Project Layer

[HEAD Agent Core](../README.md) / Project Layer

| Property | Value |
| --- | --- |
| Scope | Project-owned |
| Delivery | Mixed: project Core and index are loaded; detailed sources are retrieved on demand |

## Why It Exists

Portable HEAD behavior is useful only when it can be composed with the rules and evidence of a real project. The project layer provides that adaptation without contaminating the shared layer with domain facts, private paths, credentials, current work state, or specialist routing.

This repository documents the extension points but contains no project's internal context.

## Navigate

- [Project Core](core/README.md)
- [Additional Context](context/README.md)
- [Project MCP](mcp/README.md)
- [Project Skills](skills/README.md)
- [Project Agents](agents/README.md)
