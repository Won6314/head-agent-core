# The Failed Recovery Story

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Canon](README.md) / The Failed Recovery Story

## Learning Objective

See how a plausible compact summary can create a self-reinforcing recovery error even when later validation reports success.

## Generalized Failure

In one recovery failure, a compact summary retained results and a completion judgment but did not preserve the complete work model. The next session accepted that summary as the work state. It then used the reduced scope to select what to inspect and what to validate.

```text
full agreement
     |
lossy summary omits a boundary
     |
recovery accepts the summary as authority
     |
validation checks the reduced target
     |
"pass" confirms the wrong question
```

The failure was not only missing information. A derivative, lossy representation displaced the original user agreement. Once that happened, progress records and inferred current-work selection reinforced the same reduced interpretation instead of challenging it.

## Design Response

Recovery now begins from the fixed session context and full run. Progress and history can be searched later, but claims from them are untrusted until checked against the agreement or referenced evidence. A validator must assess the full agreed success conditions, not merely the artifacts named by a handoff.

## What This Does Not Claim

This is a generalized failure story, not a claim that all validators or all summaries are unreliable. It demonstrates that a passing check only has meaning relative to its target, and a reduced target can make a pass misleading.

## Related Theory

The story can be read through the retrospective lens of specification drift: a working representation gradually replaces the intended specification. The label explains the pattern; it is not evidence that the label caused or originally guided the design.

## Takeaway

Validation cannot repair a lost agreement when the lost agreement no longer defines what validation must test.

Previous: [Fragile Progress And History](fragile-progress-and-history.md) | Next: [The Two-File Contract](the-two-file-contract.md)

Source class: generalized failure; current shared recovery contract; retrospective theory.
