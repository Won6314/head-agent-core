# 06 — Pn 결과 검수

이번 계획의 보존본 `PN_ID`에서 분기한다. 실제 실행 Rn에서 검수자를 만들지 않는다.

## 호출 — context_run

```json
{
  "source_id": "{PN_ID}",
  "command": "너는 이번 계획을 보존한 Pn에서 이미 포크된 결과 검수 세션이다. 이제 {RESULT_REF}의 실제 결과와 근거를 확인하라. 이번에 하려던 일을 실제로 충족했는지 판단하고, 받아들일 새 사실과 부족한 점을 {PN_RESULT_REVIEW_FILE}에 정리하라. 필요한 원자료와 실제 결과를 직접 확인하라.",
  "completion_note": "현재 단계: Pn 결과 검수. 다음 처리: 결과를 받아들일 수 있으면 P0 전체 진행 점검, 부족하면 실행 보완 또는 사실 확인. 레퍼런스: plan-run / steps/06-result-review.md."
}
```

## 알림을 받으면

결과를 수용할 수 있으면 검증된 검수 child ID를 `PN_REVIEW_ID`로 유지하고 [07 P0 전체 진행 점검](07-progress-review.md)으로 간다. 실제 산출물 보완은 [05의 Rn](05-execution.md)에 돌리고 수정본은 `PN_ID`의 새 분기에서 검수한다. 대상 변경 없는 추가 확인은 현재 검수 맥락을 이어간다.
