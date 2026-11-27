# head-context 제품 그래프

head-context 플러그인 전체를 하나의 지도로 만든 것입니다. AI가 이 플러그인을 고치거나 설명할 때, 파일을 하나씩 뒤지지 않고 이 지도에서 필요한 곳을 먼저 찾게 합니다.

## 왜 그래프를 쓰나

AI에게 "이 기능 고쳐 줘"라고 하면, AI는 보통 파일을 하나씩 열어 가며 관련 코드를 찾습니다. 이 방식에는 문제가 셋 있습니다.

- 찾는 동안 열어 본 파일이 대화를 채웁니다. 정작 필요한 내용이 그 사이에 묻힙니다.
- 코드만 보고는 지금 동작이 일부러 그렇게 만든 것인지, 실수인지 알 수 없습니다.
- 한 곳을 고치면 어디가 같이 바뀌는지 놓치기 쉽습니다.

그래프는 이것들을 미리 이어 둡니다.

- 유저가 하는 일(예: 기록 남기기) → 그때 유저가 받는 글 → 그 글을 내는 기능 → 그 기능의 코드(파일과 줄)
- 정해 둔 규칙 → 그 규칙을 지키는 기능과 코드

AI는 그래프에서 필요한 곳을 먼저 찾고, 그 파일과 줄만 엽니다. 대화에는 지금 판단에 필요한 것만 들어갑니다. "이건 정해 둔 규칙인가"도 그래프에서 확인합니다.

## 이 폴더에 있는 것

| 파일 | 무엇 |
|---|---|
| `USER.md` | 내 AI에 이 그래프를 넣는 법 |
| `LLM.md` | AI가 읽는 조회 안내 |
| `head-context-0.9.20.sqlite` | 그래프 (노드 976, 연결 2,629) |
| `hc_graph.py` | 조회 스크립트 (Python 3 표준 라이브러리만, 읽기 전용) |

## 어떻게 만들었나

0.9.19 그래프를 만든 묶음([`../build/head-context/`](../build/head-context/))을 「새 판을 낼 때의 차례」대로 다시 돌렸습니다. 0.9.20(압축·/clear 복원 블록을 따로 내는 recovery 출력과 「이 대화가 남긴 기록」 지도, save가 쓰는 `대화:` 줄, 연결 기록의 앞 대화 `previous`, Antigravity 터미널 /clear 이어받기)을 넣었습니다.

- **코드**: head-agent-core commit `399d056`(head-context 0.9.20)에서 스크립트로 처음부터 다시 뽑았습니다. 같은 commit이면 몇 번을 만들어도 결과가 같습니다(sqlite sha256 `9d9035b9…`, 두 번 같음). 뽑는 규칙(`build_graph.py`)은 고치지 않았습니다. 새 파일 셋(`core/conversation-map.mjs`, `hosts/claude/saves.mjs`, `hosts/antigravity/cleared.mjs`)을 코드 묶음에 넣고, agy 입력 기록(`~/.gemini/antigravity-cli/history.jsonl`)을 바깥 칸으로 더했습니다(`purposes.json`).
- **유저가 받는 글**: 플러그인을 임시 폴더에 설치하고 tool과 hook을 돌려 받은 출력 345건에서 가져왔습니다. 0.9.19 때와 같은 314건 뒤에 0.9.20 기록 지도를 보는 31건(R315~R345)을 더했습니다: 두 Claude 대화가 한 메인에 번갈아 저장하고 옛 기록(대화 줄 없음)을 섞은 뒤 각자 압축하면 자기 기록만 나옴(R326·R327), /clear 이어받기와 그 뒤 압축의 사슬(R328~R331), 프로그램 실행·Codex 하위 에이전트·처음 시작에는 없음(R332·R337·R338), Codex 압축(R336), Antigravity 압축 지도와 옛 기록(R343), 같은 agy 프로세스의 /clear 이어받기(R344, 이름이 agy인 대역 node 프로세스 아래)와 입력 기록 줄이 없는 새 대화(R345). 앞 314건 중 303건이 글자까지 같습니다. 다른 11건 가운데 8건은 0.9.20 변경 때문입니다: 압축 뒤 session 출력에서 복원 블록이 빠지고 그만큼 context.md 머리가 더 들어감(R53·R234·R235·R238·R251, Codex R255는 자르지 않아 context.md 전체), read recent 원문의 `대화:` 줄(R27), Antigravity 압축 뒤 출력에 복원 블록과 지도(R168). 나머지 3건은 같은 시각 두 기록의 find 순서(R29)와 할 일에 찍히는 실행 날짜(R20·R107)입니다.
- **유저가 받는 글의 설명과 규칙**: 화면은 38 그대로입니다. STA-07을 「컴팩트·/clear 뒤 먼저 할 것과 이 대화가 남긴 기록」으로 고쳐 화면요소 둘(STA-07#4 지도 머리, #5 지도 줄)을 더해 135입니다. TOL-07(기록 본문)에 `대화:` 줄을 적었습니다. 규칙이 넷 늘어 86입니다(pol.save-conversation-line, pol.conversation-map-own, pol.clear-previous, pol.agy-clear-same-process). pol.compact-recovery(recovery 출력·/clear·Antigravity·메인 문구)와 pol.session-part-fits(Claude만, Codex는 자르지 않음)를 고쳤습니다. 기능은 hook:claude:SessionStart:recovery와 hook:codex:SessionStart:recovery가 늘어 42입니다. session·Antigravity 훅·save 기능의 한 줄을 0.9.20 동작에 맞췄습니다.
- **유저가 하는 일**: 이어 하기(`ua.resume`)의 압축·/clear 분기에 기록 지도를 받는 줄을 더했습니다. 출력과 코드로만 썼고 써 보지는 않았습니다(0.9.20 기능 자체는 실제 Claude Code·agy·Codex로 확인했습니다 — head-core 작업 세션 기록).
- **검수**: 독립 검수 아직 안 함.

같은 방법으로 내 앱의 그래프를 만들려면 [`../build/`](../build/)를 봅니다. 그래프에 무엇을 담는지(정의)와 어떤 차례로 만드는지(순서)가 있습니다. 이 그래프를 만든 스크립트·문서·실행 기록은 [`../build/head-context/`](../build/head-context/)에 있고, 플러그인 새 판을 낼 때 그곳의 차례로 다시 만듭니다.

## 알아 둘 것

- 0.9.20 기준입니다. 그 뒤에 바뀐 코드는 들어 있지 않습니다. 독립 검수는 아직 하지 않았습니다.
- Codex·OpenCode·Antigravity 쪽은 실제 앱으로 써 보지 않았습니다. Codex·Antigravity 쪽 출력은 앱 없이 훅과 도구 서버를 직접 돌려 받았고, OpenCode 쪽은 플러그인의 훅 함수를 직접 불러 받았습니다. Antigravity 깨우기의 `started`는 ACP 쪽은 실행 기록에 없고, 터미널 쪽은 가짜 agy 프로세스로 본 것입니다(실제 터미널 agy 확인은 0.9.18 실제 확인). Antigravity /clear 이어받기(R344)도 이름이 agy인 대역 프로세스 아래에서 본 것입니다. research 스킬 본문은 앱이 파일을 그대로 싣는 글이라 실행 기록이 없고, 그 화면요소는 스킬 파일 글로 이었습니다.
- 유저가 하는 일(처음 쓰는 사람 시험)은 0.9.5에서 한 것입니다.
- 그래프는 찾아가는 지도입니다. 최종 답은 그래프가 가리킨 코드와 글을 읽고 냅니다.
