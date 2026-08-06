---
name: delegate-task
description: Do not use for Session one-shots; use from final Run planning or migrated execution successor B to route one exact subordinate-result phase.
---

# Delegate Task

Load exactly one phase file for the current subordinate-result operation; one-shot Session delegation uses `delegate-once`.

- A first or subsequent Run result needs its owner-specific contract: read [prepare-slice.md](prepare-slice.md).
- Two or more independently ready prepared results need a schedule: read [schedule.md](schedule.md).
- Active `B` is ready to execute a prepared Slice: read [dispatch.md](dispatch.md).
- A dispatched worker has returned: read [integrate-result.md](integrate-result.md).

Preparation and scheduling may occur before final `A`. Dispatch and integration belong only to active execution successor `B`.
