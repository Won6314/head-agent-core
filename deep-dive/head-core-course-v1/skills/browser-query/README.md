# browser-query

[HEAD Agent Core](../../README.md) / [Shared Skills](../README.md) / browser-query

| Property | Value |
| --- | --- |
| Scope | Shared |
| Delivery | On demand |
| Canonical source | [`SKILL.md`](SKILL.md) |

## Why It Exists

Browser evidence is broadly useful, but shared browser state can cause one task to interfere with another or with a user's tabs. This skill establishes a portable isolation and evidence model for browser work.

## Boundary

The skill defines safe browser observation and task-owned tab behavior. A project still owns browser launch policy, authenticated profiles, allowed destinations, and authorization for external mutation.
