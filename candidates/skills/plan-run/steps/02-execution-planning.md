# 02 — 실행 플래닝

ideation을 실제로 만든 P의 완료 맥락에서 시작한다. `context_run`은 그 맥락을 복사해 실행하므로 새로운 수행 방법론이나 실행기를 만들 필요가 없다.

## 호출 — context_run

```json
{
  "source_id": "{P_ID}",
  "command": "너는 원본 메인이 아니라, ideation을 마친 P의 맥락에서 이미 포크된 실행 플래닝 HEAD다. 지금 선택한 단기 목표 {SHORT_GOAL}를 실제 실행 규격으로 분해하라. 큰 작업 흐름과 선택 이유는 {IDEATION_FILE}에 있다. 이번 목표를 얻으려면 무엇을 어떻게 수행해야 하는지, 필요한 작업의 입력·처리·결과와 앞뒤 연결, 완료를 확인할 기준을 구체화하라. 이번 계획을 {PLAN_FILE}에 작성하라.",
  "completion_note": "현재 단계: 실행 플래닝. 다음 처리: 계획이 준비됐으면 P0 필요 최소성 점검, 미완료·입력 요청은 plan-run 공통 분기. 레퍼런스: plan-run / steps/02-execution-planning.md."
}
```

## 알림을 받으면

계획 참조와 제작 task/native ID를 유지하고 [03 P0 계획 점검](03-minimum-plan-review.md)으로 간다. 계획 보완은 이 제작 맥락에서 수행한다. 이번 일의 실행 규격을 만드는 것이지 상세 분해방법론 자체를 개발하는 단계가 아니다.
