---
name: plan-run
description: Use only when HEAD Core selects a Run; route the current lineage phase without loading unrelated planning or execution procedures.
---

# Plan Run

`plan-run` controls context lineage for a Run. It does not supply product planning, system design, Run decomposition, or worker-contract methods. Load exactly one phase file for the current transition:

- Investigation and its task-relevant method selection are complete: read [capture-a.md](capture-a.md).
- Rich planning has ended with the user's exact `정리 끝`: read [contract-a-prime.md](contract-a-prime.md).
- Clean `a′` or an accepted generation needs one further planning pass: read [generation-loop.md](generation-loop.md).
- The accepted plan, Run route, and first executable result are ready: read [finalize-A.md](finalize-A.md).
- Immutable `A` is ready to replace planning `P` with execution successor `B`: read [activate-B.md](activate-B.md).

Whenever the selected phase saves or loads a HEAD, also read [anchor-operations.md](anchor-operations.md). Do not load the other phase files.
