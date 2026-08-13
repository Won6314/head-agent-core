# Skills

Top-level workflows advertised to HEAD through runtime Skill discovery. Detailed condition-selected branches live outside Skill discovery under [`packages/procedures/`](../procedures/README.md).

## Work routing

- Use `outcome-shaping` to turn a current/needed-state problem into a selected solution and consumer-ready Result Graph.
- Use `dev-system-shaping` when software or system behavior requires design judgment; it specializes `outcome-shaping` with the authoritative whole-outcome context and implementation shape.
- Continue directly when implementation and proof remain connected to HEAD's active whole-outcome context.
- Use `delegate-once` when HEAD already holds the whole context and one bounded result can independently return once.
- Use `plan-run` when an accepted whole design requires dependent bounded results, meaningful checkpoints, or durable recovery.
- Internal worker, result, lineage, and Run-lifecycle phases are procedures, not independently advertised Skills.

## Shared catalogue

- [agent-reply](agent-reply/README.md)
- [delegate-once](delegate-once/README.md)
- [dev-system-shaping](dev-system-shaping/README.md)
- [outcome-shaping](outcome-shaping/README.md)
- [plan-run](plan-run/README.md)

Session restore remains an installed Core operational command at `scripts/resume-session.sh`; it is not advertised through Skill discovery. Browser workflows belong to projects that own the browser daemon and profile binding.
