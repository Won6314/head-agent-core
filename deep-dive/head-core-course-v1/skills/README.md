# Shared Skills

[HEAD Agent Core](../README.md) / Shared Skills

| Property | Value |
| --- | --- |
| Scope | Shared |
| Delivery | Discovered by the runtime; loaded on demand |

## Why They Exist

Core principles should stay small and always applicable. A skill holds a detailed workflow that is useful only for a matching task. This keeps the default context compact while preserving a reusable procedure at the moment it is needed.

A skill is shared only when its trigger, authority boundary, and expected result remain meaningful without project-specific facts.

## Skills

- [`agent-reply`](agent-reply/README.md)
- [`browser-query`](browser-query/README.md)
- [`delegate-task`](delegate-task/README.md)
- [`restore-session`](restore-session/README.md)
- [`start-dev-work`](start-dev-work/README.md)
- [`start-work`](start-work/README.md)

Domain workflows belong in [Project Skills](../projects/skills/README.md).
