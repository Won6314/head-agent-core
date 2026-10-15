# 08 — Pn 계보의 재통합·다음 방향

결과를 검수한 `PN_REVIEW_ID`의 맥락에서 이어간다. 아래 호출은 그 판단 맥락을 복사해 재통합하며, Rn이나 P0 리뷰를 출발점으로 바꾸지 않는다.

## 호출 — context_run

```json
{
  "source_id": "{PN_REVIEW_ID}",
  "command": "너는 원본 메인이 아니라, 앞 결과를 검수한 Pn 계보에서 이미 포크된 재통합 세션이다. P0의 전체 진행 점검 {P0_PROGRESS_REVIEW_FILE}을 받아 현재 이해에 반영하라. 합의한 목표·조건 안에서 다음에 무엇을 해야 할지, 보완이 필요한지, 또는 완료했는지 판단하라. 그 판단과 이유를 {DIRECTION_FILE}에 정리하라.",
  "completion_note": "현재 단계: Pn 계보 재통합·다음 방향. 다음 처리: 판정에 따라 보완, 새 기획 출발본 보존 후 ideation, 또는 전체 완료 보고. 레퍼런스: plan-run / steps/08-next-direction.md."
}
```

## 계속할 일이 있으면 — context_fork

재통합을 마친 실제 child ID를 `INTEGRATED_CHILD_ID`로 넣는다.

```json
{"source_id":"{INTEGRATED_CHILD_ID}"}
```

반환된 `session_id`를 다음 `SEED_ID`로 두고 [01 Q/P ideation](01-ideation.md)을 시작한다. 새 실행 계획을 수용하기 전까지 이 출발본을 새 Pn으로 부르지 않는다.

완료 판정이면 실제 결과·검수 근거와 함께 사용자에게 완료를 보고한다. 보완 판정이면 해당 제작·검수 단계로 돌아가고, 필요한 사용자 입력이 있으면 그 경계에서 요청한다.
