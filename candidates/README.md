# Candidates

Skills and procedures kept for selection. The plugin loads skills only from the root `skills/` folder, so nothing here is advertised. To ship a skill, move its folder to `skills/` and, if it links a procedure, move that procedure with it so the relative link still resolves.

Outside dependencies (2026-10-15):

| Skill | Depends on |
|---|---|
| `product-planning` | nothing |
| `start-job` | judgment text stands alone; the fork (`context_run`), `checkpoint` skill and `record_checkpoint` lines assume the agent-task runtime |
| `delegate-once` | `context_run` and a fresh-worker runtime; links `procedures/` |
| `plan-run` | `context_fork`, `context_run`, `quick_task_control` (agent-task) |
| `agent-reply` | the agent-task `agent-comm` reply files |
