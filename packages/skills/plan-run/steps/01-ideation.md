# 01 — Q/P ideation

메인이 읽는 파일이다. Q/P는 같은 `SEED_ID`에서 시작한다. Q가 P를 직접 호출하며 메인은 문답을 중계하지 않는다.

## 1. P 준비

`context_fork`:

```json
{"source_id":"{SEED_ID}"}
```

반환된 `session_id`를 `P_ID`로 둔다. 반환된 runtime/model/effort 또는 variant를 아래 호출문에 채운다. P는 아직 작업을 시작하지 않은 복사본이다.

## 2. Q 시작

`context_run`의 `{P_CALL}`에는 아래 런타임별 호출문 하나를 실제 ID·모델·경로로 채워 넣는다. `{P_INPUT_FILE}`은 Q가 현재 질문을 작성할 파일이다.

```json
{
  "source_id": "{SEED_ID}",
  "command": "너는 원본 메인이 아니라, 같은 출발 맥락에서 이미 포크되어 실행 중인 질문 세션 Q다. 지금 할 일은 전체 목표를 이루기 위한 큰 작업 흐름을 P와의 문답으로 완성하는 것이다. P의 실제 세션 ID는 {P_ID}다. 전체 목표·고정 조건과 답을 대조해 밝혀진 것과 미결을 가르고, 근거 없는 전제나 성급한 결론을 짚어라. 부족하면 같은 문제를 심화하고 충분하면 다음 물음으로 넘어가라. 질문 입력은 {P_INPUT_FILE}에 작성하고 다음 호출문으로 기존 P에 직접 질문하여 답을 받아라: {P_CALL}\nP에 주는 입력은 매번 '너는 이미 포크된 플래닝 세션 P다. 이어받은 문제·목표·조건을 보고, 이 목표를 이루려면 어떤 일을 어떤 흐름으로 해나가면 좋을지 아이디어를 내라. 지금은 Q의 다음 질문에 답하라'로 시작하고 실제 질문을 붙여라. 필요할 때 사실을 확인하며 답하게 하라. P의 답이 돌아온 뒤 같은 P에 다음 질문을 보내라. 이번 산출물은 큰 작업 흐름과 선택한 이번 일·단기 목표이며 상세 실행 규격은 다음 단계의 일이다. 큰 흐름이 준비되면 P가 {IDEATION_FILE}에 정리하도록 하고 그 결과를 확인하라. 사용자만 결정할 내용이 생기면 필요한 질문과 이유를 남겨라. 지금 P에 첫 질문을 시작하라.",
  "completion_note": "현재 단계: Q/P ideation. 다음 처리: 결과가 준비됐으면 P의 완료 맥락에서 실행 플래닝, 사용자 입력·막힘은 plan-run 공통 분기. 레퍼런스: plan-run / steps/01-ideation.md."
}
```

### Q에게 넣을 P 호출문 — Claude

Q의 Bash 작업 디렉터리는 HEAD 디렉터리다. 입력 파일에는 P의 분기 정체성과 현재 질문을 담는다. stdout의 답은 Q에게 돌아간다.

```bash
P_ID='{P_ID}'
P_MODEL='{P_MODEL}'
P_EFFORT='{P_EFFORT_OR_EMPTY}'
P_INPUT='{P_INPUT_FILE}'
args=(-p --resume "$P_ID" --model "$P_MODEL" --dangerously-skip-permissions --output-format json)
if [ -n "${P_EFFORT:-}" ]; then args+=(--effort "$P_EFFORT"); fi
env -u CLAUDECODE -u CLAUDE_CODE_SSE_PORT claude "${args[@]}" < "$P_INPUT"
```

### Q에게 넣을 P 호출문 — OpenCode

```bash
P_ID='{P_ID}'
P_MODEL='{P_MODEL}'
P_VARIANT='{P_VARIANT_OR_EMPTY}'
P_INPUT='{P_INPUT_FILE}'
args=(run --session "$P_ID" --model "$P_MODEL" --format json)
if [ -n "${P_VARIANT:-}" ]; then args+=(--variant "$P_VARIANT"); fi
opencode "${args[@]}" "너는 이미 포크되어 실행 중인 플래닝 세션 P다. $P_INPUT 에 적힌 현재 질문을 읽고 답하라."
```

두 호출은 새 fork를 만들지 않는다. 반환의 오류와 실제 세션 식별을 확인하고, 다른 세션으로 바뀌었으면 정상 답변으로 이어가지 않는다. 현재 CLI 문법을 바탕으로 준비했으며 새 Q/P 연속 실행 검증은 아직 하지 않았다.

## 알림을 받으면

큰 흐름·선택한 단기 목표·P의 실제 세션을 확인하고 [02 실행 플래닝](02-execution-planning.md)으로 간다. Q가 준비됐다는 판단은 실행 계획 수용이 아니다. 필요한 사용자 입력은 메인에서 받고 Q를 이어간다.
