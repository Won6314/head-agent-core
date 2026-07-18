---
name: start-work
description: Create a durable WorkUnit when evidence, coordination, recovery, or handoff must survive multiple steps or compaction.
argument-hint: "[work name]"
---

# Start Work

Use a WorkUnit only when it materially improves durable evidence, coordination, recovery, or handoff. Handle small, clear, immediately verifiable work directly.

## Location

```text
<HEAD_ROOT>/sessions/{session}/work/{work_id}/
  meta.json
  run.md
  provenance.jsonl
  evidence/
  scratch/
  final/
```

Use the current project's established `work_id` generator and active-work mechanism. Do not change an existing ID contract merely for formatting consistency.

## Metadata

`meta.json` is the machine-readable contract and records at least:

```json
{
  "work_id": "<project-valid work ID>",
  "session": "<session>",
  "title": "<title>",
  "status": "active",
  "internal_artifacts": [],
  "external_artifacts": [],
  "code_refs": []
}
```

## Run Record

```markdown
# <title>
상태: planning | running | done | blocked
시작: YYYY-MM-DD

## 목적
<why, with evidence>

## 접근
<steps, success criteria, impact, rollback>

## 실행 기록
### Step 1: <title>
- 실행:
- 출력:
- 관찰:

## 결론
<the result and material evidence>

## 후속
- <next use or 없음>
```

## Rules

1. Fill purpose and approach before non-trivial execution.
2. Record only evidence and state needed for judgment, recovery, or handoff.
3. HEAD owns the canonical WorkUnit even when workers execute bounded steps.
4. Active pointers and provenance tracking assist recovery; they are not approval or completion gates.
5. On completion, update `run.md` and `meta.json.status`, record completed history, and clear the matching active pointer.
6. On interruption, set `blocked` and record the exact reason and next authority or evidence needed.
