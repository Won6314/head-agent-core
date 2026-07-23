## Persistence Checkpoint

Produce a machine payload for the session files. This is not a continuation summary and must not tell the next model what local action to execute.

Output exactly one fenced `json` block and no other text:

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

Rules:

- Write valid JSON strings and keep the payload concise.
- Record verified result changes, not the conversation, compaction, persistence process, or tool narration.
- `progress.md` and `history.md` are fragile retrieval records, not authority and not future prompt inputs.
- Do not output `Objective`, `Important Details`, `Work State`, `Next Move`, `Relevant Files`, or prose outside the JSON block.
- Do not preserve worker IDs, validator IDs, hashes, node IDs, commands, errors, or file lists unless one value is indispensable to recover unfinished work.
- Do not turn the most recent blocker into the session goal. Describe its place in the full run and its reproducible checkpoint.
- A history entry records a completed outcome only. Do not append planning, pending work, or repeated prior history.
