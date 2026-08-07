# restore-session

[HEAD Agent Core](../../README.md) / [Shared Skills](../README.md) / restore-session

| Property | Value |
| --- | --- |
| Scope | Shared |
| Delivery | On demand |
| Canonical source | [`SKILL.md`](SKILL.md) |

## Why It Exists

Conversation restoration is an operational action with collision, identity, and stale-state risks. This skill provides a shared validation boundary so projects do not invent incompatible or unsafe restore flows.

## Boundary

The skill defines selection and validation behavior. The shared runtime provides the restore mechanism, while each project owns its session directories and stored restore identifiers.
