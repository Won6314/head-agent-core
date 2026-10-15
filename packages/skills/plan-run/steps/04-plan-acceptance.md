# 04 — Pn 계보의 계획 검증·수용

문답 전 공통 출발 맥락 `SEED_ID`에서 별도로 분기한다. 제작 P나 P0 점검 분기에서 이어받아 검증하지 않는다.

## 호출 — context_run

```json
{
  "source_id": "{SEED_ID}",
  "command": "너는 기획 전에 보존한 판단 맥락에서 이미 포크된 계획 검증·수용 세션이다. 지금 {PLAN_FILE}과 P0 점검 결과 {P0_PLAN_REVIEW_FILE}을 받아 계획을 검증하라. 이 계획으로 이번 목표·조건을 충족할 수 있고 실제로 수행할 수 있는지 확인하라. 필요한 원자료는 직접 확인하고, 부족하면 보완할 내용을 짚어라. 수용할 수 있으면 무엇을 어떤 이해로 수용했는지 {PLAN_ACCEPTANCE_FILE}에 정리하라.",
  "completion_note": "현재 단계: Pn 계획 검증·수용. 다음 처리: 수용됐으면 해당 판단 맥락을 Pn으로 보존하고 실행, 보완·입력 요청이면 해당 처리. 레퍼런스: plan-run / steps/04-plan-acceptance.md."
}
```

## 수용 알림을 받으면 — context_fork

실제 수용 판정과 필요한 사용자 결정의 반영을 확인한 뒤, 완료 알림의 검증된 child ID를 `ACCEPTED_CHILD_ID`로 넣는다.

```json
{"source_id":"{ACCEPTED_CHILD_ID}"}
```

반환된 `session_id`를 새 `PN_ID`로 보존하고 [05 Rn 실행](05-execution.md)으로 간다. 기존 Pn과 `SEED_ID`는 유지한다. 보완이면 제작 맥락에서 수정한 뒤 보존 기준의 새 분기로 검증하고, 단순 설명·근거 확인이면 기존 검수 맥락에서 마친다.
