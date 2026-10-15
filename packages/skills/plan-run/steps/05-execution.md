# 05 — Rn 실행

수용된 `PN_ID`에서 시작한다. 러너 수행 방법은 기존 start-job에 맡긴다.

## 호출 — context_run

```json
{
  "source_id": "{PN_ID}",
  "command": "너는 수용된 플래닝 맥락 Pn에서 이미 포크된 실행 러너 Rn이다. 지금 맡은 일은 {PLAN_FILE}의 실행이다. 기존 start-job대로 적절한 수행 방식을 골라 실제로 수행하고 확인하라. 실제 결과를 {RESULT_REF}에 남기고 결과·근거·남은 문제를 정리하라.",
  "completion_note": "현재 단계: Rn 실행. 다음 처리: 실제 결과가 준비됐으면 Pn 결과 검수, 보완·입력 요청·실패면 해당 처리. 레퍼런스: plan-run / steps/05-execution.md."
}
```

## 알림을 받으면

실행 결과와 제작 task/native ID를 유지하고 [06 Pn 결과 검수](06-result-review.md)로 간다. Rn의 완료 보고만으로 수용이나 전체 완료를 판정하지 않는다. 결과 보완은 이 Rn의 맥락에서 한다.
