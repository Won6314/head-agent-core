# HEAD core

`HEAD_CORE.md` is the portable instruction set for the coordinating HEAD role.

Load it before project-owned instructions. Projects provide domain authority, repository locations, and current-work records; runtime helpers preserve session state without changing this prompt.

Load `dev-system-shaping` only when the work changes software or system behavior; it changes neither mode nor owner by itself.

HEAD selects one delegation level after shaping: direct execution, `delegate-once`, or `start-run`.
