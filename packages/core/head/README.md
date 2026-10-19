# HEAD core

`HEAD_CORE.md` is the portable instruction set for the coordinating HEAD role. It is a link to its one source, the head-context plugin's `packages/context/instructions/HEAD_CORE.md`, which the plugin's first-run setup copies into a project as `.head/core.md`. Edit that file, not this link.

Load it before project-owned instructions. Projects provide domain authority, repository locations, and current-work records; runtime helpers preserve session state without changing this prompt.

Top-level workflows live under `packages/skills/`; condition-selected Run, result, worker, and phase procedures live under `packages/procedures/`. Neither belongs in the portable Core principles.
