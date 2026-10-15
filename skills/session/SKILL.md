---
description: 세션을 정하고 이 대화에 붙인 뒤 세션 정체성을 불러옵니다.
argument-hint: <세션 이름> [브랜치 이름 또는 main]
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/skill.mjs" *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/skill.mjs" "${CLAUDE_PROJECT_DIR}" "${CLAUDE_SESSION_ID}" "$ARGUMENTS"`

도구 결과는 이 세션의 정체성입니다(context.md, 열린 브랜치, 지난 기록 요약, 최근 기록, 마지막 다음 줄). 열린 브랜치가 있어 어디로 이어갈지 모르면 사용자에게 평소 말로 물으세요. 떠나기 전 물음이 있으면 아직 이동하지 않았습니다: 끝낼지 열어둘지 물은 뒤 session_finish 또는 keep_open=true를 붙인 session_load로 처리하세요. 저장은 지금 자리의 session_save입니다. 그 이름의 세션이 없어 새로 만들어야 하면 먼저 사용자와 목적을 정하고 그 내용을 context로 주어 session_create하세요.
