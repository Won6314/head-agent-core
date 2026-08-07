# Why Workers Are One-Shot

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [Decisions](README.md) / Why Workers Are One-Shot

## Problem

Long-lived workers seem convenient: they retain prior conversation and are ready for the next request. They also retain stale framing, create ambiguous ownership, and require ongoing coordination.

## Attempted Alternative

Maintain resident specialist sessions that receive a stream of tasks and continue their own local history. A coordinator can ask them for status or redirect them as conditions change.

## Observed Failure

**Historical record.** Earlier system designs included persistent task packages, current-state mechanisms, and recovery-oriented coordination. Current architecture records these as legacy rather than authority.

**Operational observation.** A worker that remains available after its outcome is complete can become an implicit owner of follow-on decisions. Its retained context may be helpful, but it is not automatically the current source of truth. Monitoring it also turns HEAD's work into status management.

**Generalized failure.** A worker completes a research note and remains active. A later request arrives with a changed objective. The worker continues from its earlier assumptions and starts expanding the old scope before the owner has re-evaluated the new request.

## Current Decision

Workers are invoked for one coherent outcome, produce direct completion evidence, and end. HEAD receives completion, verifies the result, and decides whether any later work needs a new bounded outcome. Intervention is for a concrete exception, not a substitute for a resident workforce.

This favors clean ownership over conversational continuity. References and durable canon preserve what must survive without treating a live worker session as authority.

## Related Theory

**Related theory.** Stateless job execution and least authority offer useful analogies: grant only the authority and lifetime needed for the result. The analogy is retrospective; one-shot workers still use context and can make mistakes.

## Current Limitation

Starting a fresh worker has setup cost and loses useful local familiarity. Repeated, tightly coupled technical work may be faster when HEAD handles it directly or shapes a larger coherent outcome. One-shot is a boundary, not an efficiency guarantee.

## Takeaway

End worker ownership when its result ends. Preserve durable facts in canonical sources and let HEAD decide the next result from current evidence.

Previous: [Why Not An Autonomous Swarm?](why-not-an-autonomous-swarm.md) | Next: [Why Outcomes, Not Step Lists?](why-outcomes-not-step-lists.md)

Source class: historical record from prior coordination designs; operational observation; current context and delegation contracts; retrospective theory.
