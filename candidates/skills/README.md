# Skills

Candidate skills. Nothing under `candidates/` is loaded by the plugin; a skill ships when it moves to the root `skills/` folder. Branch procedures they link live in [`../procedures/`](../procedures/README.md).

## Work routing

- `start-job` ships in the root `skills/` folder.
- Use `product-planning` for the user-facing planning sequence: problem → user value → user flow, before breaking down internal functions or implementation.
- Continue directly when implementation and proof remain connected to HEAD's active whole-outcome context.
- Use `delegate-once` when HEAD already holds the whole context and one bounded result can independently return once.
- Use `plan-run` when an accepted whole design requires dependent bounded results, meaningful checkpoints, or durable recovery.
- Internal worker, result, lineage, and Run-lifecycle phases are procedures, not independently advertised Skills.

## Shared catalogue

- [agent-reply](agent-reply/README.md)
- [delegate-once](delegate-once/README.md)
- [plan-run](plan-run/README.md)
- [product-planning](product-planning/SKILL.md)

Browser workflows belong to projects that own the browser daemon and profile binding.
