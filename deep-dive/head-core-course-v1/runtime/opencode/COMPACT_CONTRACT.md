## Compact Instructions

`context.md` and `run.md` are reloaded from their fixed session paths after compaction. They remain authoritative over this summary. Do not use the summary to change the agreed scope or completion criteria in `run.md`.

The JSON below updates only the fragile `progress.md` and `history.md` records. Those records are not recovery prompt inputs.

The compact summary MUST end with exactly one fenced `json` block using this schema:

```json
{
  "session": "<current session directory name, or empty if unknown>",
  "progress": {
    "current_state": "<markdown: state after this conversation>",
    "active_work": "<markdown bullets: run checklist position and exact next action>",
    "next_handoff": "<markdown numbered list: how to resume>"
  },
  "history_append": "<markdown entry starting '## YYYY-MM-DD: <title>' for completed work, or empty>"
}
```

Preserve material decisions, observed outputs, modified paths, run and slice references, and the exact next action. Reference the run canon instead of restating it. Keep strings valid JSON. Compact does not automatically persist lessons.
