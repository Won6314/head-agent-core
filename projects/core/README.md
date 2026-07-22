# Project Core

[HEAD Agent Core](../../README.md) / [Project Layer](../README.md) / Project Core

| Property | Value |
| --- | --- |
| Scope | Project-owned |
| Delivery | Always loaded |

## Why It Exists

Every project has non-portable authority boundaries: repository ownership, domain policy, operational constraints, and the local role of HEAD. These rules must be present before work begins, but they must not change the meaning of the shared Core for every other project.

## Boundary

Project Core contains stable project instructions, not a catalog of all project knowledge and not current task status. Broad facts and retrieval routes belong in [Additional Context](../context/README.md). Detailed procedures belong in [Project Skills](../skills/README.md).

## Relationship To Shared Core

[Shared Core](../../head/README.md) defines the portable HEAD model. Project Core narrows and applies that model to one project without duplicating it.
