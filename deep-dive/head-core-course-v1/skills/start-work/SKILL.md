---
name: start-work
description: Start non-trivial general work by creating a durable run canon, composing relevant context, and detailing the current coherent outcome before execution.
---

# Start Work

Start from the outcome, not from a document template.

## Build The Work Model

1. State the intended result and the current state that matters to it.
2. Identify the parts, relationships, and order that make the result coherent.
3. Use the representation natural to the work: investigation coverage, decision structure, production flow, operating state, or another form that fits the outcome.
4. Resolve facts that can change the work model from the canonical sources indexed by the project.

## Compose Context

After the task is clear, search `agent-task_list_tips` once with a semantic query derived from the current goal. If the project exposes a past-run query, search for directly related runs as well. Carry forward only information that changes the current interpretation, decision, or result; reference the source instead of copying its full history.

## Create The Run

Use the project's run entry point to create the current working canon at:

```text
sessions/{session}/run.md
```

The run is the user-HEAD agreement for the whole outcome. Choose a structure natural to the work rather than following a fixed template, but include the original requirements and agreed decisions, complete intended result and scope, success conditions, work relationships and order, completed and remaining work, current situation, unverified assumptions, exact next action, and evidence locations.

Every run contains a work checklist. After the user and HEAD agree on the run, do not rewrite its requirements, scope, success conditions, or overall work model unless the user changes them. Update only checklists and current-situation fields as execution advances.

One coherent outcome uses `run.md` alone. When work is divided into slices, keep a separate checklist for every slice in `run.md` and give each slice brief under `sessions/{session}/slices/` its own checklist. Slice documents may detail execution but cannot narrow or replace the parent run.

## Execute

Begin from the current coherent outcome. Mark checklist progress and keep the current situation exact. Do not declare the run complete until its required checklist and success conditions are satisfied.
