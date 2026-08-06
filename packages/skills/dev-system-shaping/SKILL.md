---
name: dev-system-shaping
description: Load before choosing an execution mode when work changes software or system behavior.
---

# Development System Shaping

Use this guidance when changing software or system behavior. It shapes the change before HEAD chooses an execution mode; it does not start a Run or select a worker.

## Establish The Observable System

1. State the intended user-visible or operational result.
2. Trace the current path from authoritative input to the intended consumer.
3. Resolve facts that can change the model through the project authority and code-discovery paths.
4. Keep the map bounded to the behavior and dependencies being changed.

## Map Responsibilities And Flow

- Assign each material behavior to its responsible component and authority.
- Map relevant data, control, state, interfaces, configuration, operations, and dependencies.
- Identify the failure boundary and final consumer.
- Preserve working behavior and state outside the intended change.

## Choose The Implementation Shape

1. Choose the smallest viable change that produces the result and preserves the working system.
2. Compare alternatives only when they materially differ in architecture, cost, risk, reversibility, or operational fit.
3. Fix responsibilities, interfaces, dependencies, mutations, preservation boundaries, and integration behavior.
4. State the intended behavior in readable execution order without inventing unsupported implementation detail.

## Shape Coherent Implementation Outcomes

1. Divide the shape into outcomes that each produce a consumable behavior, artifact, or state.
2. Keep connected diagnosis, implementation, correction, and proof in one outcome.
3. Define interfaces so later outcomes consume artifacts instead of reconstructing reasoning.
4. Keep later outcomes coarse and elaborate only the current outcome to execution depth.
5. Return the system path, selected shape, boundaries, dependencies, and representative consumer result to HEAD for execution-mode selection.
