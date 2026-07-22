# Application Repositories

[HEAD Agent Core](../../README.md) / [Additional Context](README.md) / Application Repositories

| Property | Value |
| --- | --- |
| Delivery | On demand |

## Why It Exists

Code, tests, configuration, and Git history provide direct implementation evidence. Repository boundaries must remain project-owned so HEAD and workers mutate only the system that owns the intended result.

## Boundary

The shared layer supplies general implementation behavior. The project defines repository locations, branch policy, commands, and source ownership.
