# Project Agents

[HEAD Agent Core](../../README.md) / [Project Layer](../README.md) / Project Agents

| Property | Value |
| --- | --- |
| Scope | Project-owned |
| Delivery | Registered by the project; invoked on demand |

## Why They Exist

Projects need two kinds of local Agent definition: overlays that adapt a shared role to local repositories and policy, and specialists whose outcome only makes sense in the project's domain.

## Boundary

An overlay must preserve the meaning and authority boundary of its [Shared Agent](../../agents/README.md). A specialist should own one coherent, reusable result and receive only the context needed for that result.

Project routing, model selection, tools, credentials, and specialist evidence sources remain project-owned even when dispatch uses the shared [`agent-task`](../../mcp/agent-task/README.md) interface.
