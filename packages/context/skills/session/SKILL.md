---
description: 세션을 정하고 이 대화를 그 세션의 자기 자리에 붙인 뒤 정체성을 불러옵니다.
argument-hint: <세션 이름> [이어받을 자리 이름]
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/skill.mjs" *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/skill.mjs" "${CLAUDE_PROJECT_DIR}" "${CLAUDE_SESSION_ID}" "$ARGUMENTS"`

도구 결과는 이 자리의 정체성입니다(context.md, 메인 색인 요약, 이 자리의 지금까지 요약, 최근 기록, 마지막 다음, 다른 자리의 남은 일). 자리는 코어가 자동으로 만들고 닫으므로 사용자에게 자리를 묻지 마세요. 남은 일이 보이면 "○○의 '이름표' 이어서 할까요?"만 한 번 묻고, 예라면 `session_branch(action="attach", branch=…)`로 이어받으세요. 저장은 지금 자리의 `session_save`이고, 이어갈 일이 없으면 `next` 없이 `recap`(지금까지 요약)을 함께 주세요. 그 이름의 세션이 없어 새로 만들어야 하면 먼저 사용자와 목적을 정하고 그 내용을 context로 주어 `session_create`하세요.
