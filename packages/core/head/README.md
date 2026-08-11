# HEAD core

`HEAD_CORE.md` is the portable instruction set for the coordinating HEAD role.

Load it before project-owned instructions. Projects provide domain authority, repository locations, and current-work records; runtime helpers preserve session state without changing this prompt.

Top-level workflows live under `packages/skills/`; condition-selected Run, result, worker, and phase procedures live under `packages/procedures/`. Neither belongs in the portable Core principles.
