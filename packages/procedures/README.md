# Procedures

Condition-selected branch procedures used by top-level Skills. This directory is distributed but is not a Skill-discovery root.

- `delegate-once/`: worker-specific one-shot execution contracts selected by `delegate-once`.
- `plan-run/lineage/`: durable Plan-context lineage and mainline transition procedures.
- `plan-run/workers/`: Run worker-readiness contracts.
- `plan-run/results/`: A-selected result preparation, scheduling, dispatch, and compatibility routing.
- `plan-run/run/`: active Run lifecycle and checkpoint procedures.

Top-level Skill files link to one exact procedure for the current condition. Procedure files contain no Skill frontmatter and are not independently advertised.
