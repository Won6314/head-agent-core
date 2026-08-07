# Project Skills

[HEAD Agent Core](../../README.md) / [Project Layer](../README.md) / Project Skills

| Property | Value |
| --- | --- |
| Scope | Project-owned |
| Delivery | Discovered by the runtime; loaded on demand |

## Why They Exist

Domain workflows often combine project policy, canonical sources, specialist tools, and output conventions. They should remain close to the project that owns those meanings rather than making the shared skill library depend on one domain.

## Boundary

A Project Skill may add project preconditions to a shared workflow or define a distinct domain workflow. It should not copy a shared skill under the same name merely to override it.

A skill becomes shared only when its trigger, authority boundary, procedure, and expected result remain valid after removing project facts.
