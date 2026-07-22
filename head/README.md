# Shared Core

[HEAD Agent Core](../README.md) / Shared Core

| Property | Value |
| --- | --- |
| Scope | Shared |
| Delivery | Always loaded |
| Canonical source | [`HEAD_CORE.md`](HEAD_CORE.md) |

## Why It Exists

HEAD needs one stable ownership and reasoning model before any project-specific instruction is applied. Keeping that model independent prevents a single project's terminology, policies, or operating history from becoming universal behavior.

## Boundary

Shared Core defines how HEAD owns and composes an outcome. It does not define what a particular product should do, where a project's repositories live, which services it uses, or which current task is active.

Project-specific authority and constraints are added by the [Project Core](../projects/core/README.md). Broader project knowledge is reached through [Additional Context](../projects/context/README.md).

## Runtime Relationship

The shared Core is loaded before project instructions. Runtime recovery preserves the project's current work contract without moving compact or session mechanics into the principle document.
