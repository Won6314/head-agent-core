---
description: 작업 세션을 불러와 이 대화를 연결하고 작업 맥락을 받습니다.
argument-hint: <작업 세션 이름> [이어 갈 작업 브랜치 또는 main]
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/skill.mjs" *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/skill.mjs" "${CLAUDE_PROJECT_DIR}" "${CLAUDE_SESSION_ID}" "$ARGUMENTS"`

도구 결과는 이 작업 세션의 작업 맥락입니다. 그 작업 세션이 없어 새로 만들어야 하면 먼저 사용자와 목적을 정하고 그 내용을 context로 주어 `session_create`하세요.
