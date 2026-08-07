# agent-reply

[HEAD Agent Core](../../README.md) / [Shared Skills](../README.md) / agent-reply

| Property | Value |
| --- | --- |
| Scope | Shared |
| Delivery | On demand |
| Canonical source | [`SKILL.md`](SKILL.md) |

## Why It Exists

A worker may discover a missing authority decision while owning a bounded outcome. This skill gives HEAD a consistent way to answer that request without widening the worker's authority or losing the parent outcome.

## Boundary

The skill transports a decision and the minimum context needed to continue. It does not replace the parent run, redesign the worker's result, or turn ordinary technical choices into HEAD decisions.
