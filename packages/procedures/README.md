# Procedures

Condition-selected branch procedures used by top-level Skills. This directory is distributed but is not a Skill-discovery root.

- `delegate-once/`: worker-specific one-shot execution contracts selected by `delegate-once`.
- `outcome-shaping/`: detailed Problem-to-Result method selected by `outcome-shaping`.
- `plan-run/planning/`: Problem Baseline, Plan Draft, Accepted Plan Baseline, and Runner activation procedures.
- `plan-run/results/`: Result-horizon selection, Execution Contract preparation, and horizon dispatch.
- `plan-run/run/`: current Run initialization, checkpoint application, recovery, stopping, and finishing.
- `plan-run/workers/`: Run worker-readiness contracts.

Top-level Skill files link to one exact procedure for the current condition. Procedure files contain no Skill frontmatter and are not independently advertised.
