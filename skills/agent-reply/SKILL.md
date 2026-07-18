---
name: agent-reply
description: Respond to a `[from <agent> msg:<id>]` authority question from a worker.
---

# Agent Reply

Handle a worker request for a HEAD decision.

## Input

```text
[from <agent_name> msg:<message_id>] <question>
```

## Procedure

1. Parse `agent_name`, `message_id`, and the question.
2. Read supplied `context_files` and only the additional primary evidence needed for the decision.
3. Ask the user if the answer requires user-owned product, policy, architecture, cost, workflow, or irreversible-impact authority.
4. Answer the exact question with a short decision and rationale.
5. Write `/tmp/agent-comm/<agent_name>/inbox/<message_id>.reply.json`:

```json
{
  "in_reply_to": "<message_id>",
  "from": "head",
  "content": "<answer>",
  "replied_at": "<ISO-8601 UTC timestamp>"
}
```

6. Notify the user in one line that the reply was sent.

Do not invent a missing authority decision. Keep the reply concise because the worker is waiting through server-side polling.
