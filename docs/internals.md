# head-context 내부 형식

사용법은 [README](../README.md). 이 문서는 기록 파일·도구·SQLite 색인·훅 동작의 세부 계약이다.

## 계약

- 세션(작업 주제)은 `context.md`(방향)와 `history.md`(색인)를 갖는다. 사용자에게 묻는 것은 작업 주제뿐이다.
- 세션에 연결된 대화는 저마다 자기 브랜치(자리)에 쓴다. 한 자리에 살아 있는 대화는 하나뿐이고, 생성·이름표·닫힘은 코어가 한다.
- 메인은 색인이다. `session_save` 한 번이 본문은 그 대화의 브랜치 파일에, 메인에는 시각·이름표·요약·본문 링크 한 줄을 쓴다.
- `다음`이 없는 저장에는 `recap`(지금까지 요약)이 필수이고 브랜치 첫머리에 덮어쓴다. `다음`이 있는 저장은 recap을 받지 않는다.
- 브랜치 상태는 계산한다: 진행 중(붙은 대화가 살아 있음) / 남은 일(붙은 대화 없음 + 마지막 저장에 다음 + N일 이내) / 내려감(N일 지남) / 끝남(다음 없음). 중단만 파일에 남는 결정이다.
- 붙은 대화가 끝나면 메인에 합쳐짐 항목 하나가 생긴다. 마지막 저장에 다음이 없으면 `상태: 끝남` + 그 recap, 있으면 `상태: 멈춤` + 마지막 recap·그 뒤 저장 요약 목록·마지막 다음(코어가 기계적으로 만든다). 표시 줄(`상태:`/`브랜치:`/`기록:`/`이유:`)은 그대로라서 그래프 merge 간선과 지도 `M … ← 합쳐짐`이 계속 동작한다.
- 저장이 없는 브랜치는 닫을 때 버린다. 재개·이어받기는 브랜치를 다시 열고, 다음 닫힘에서 합쳐짐이 하나 더 생긴다.
- 내려감은 지우지 않는다. 남은 일 목록·현황판·새 대화 안내에서만 빠지고 `session_read`로 읽히며, 사용자가 꺼내면 다시 붙는다.
- 파일이 원본. SQLite는 구조·위치만 저장하며 방향/요약/본문/커서는 저장하지 않는다.
- 체크포인트는 날짜·요약·본문·다음(선택) 네 칸이다. work와 일반 항목의 `상태:`는 없다.
- 세션 로드 = 지금 자리의 정체성. 시작 훅과 `session_load`는 같은 출력이다:
  context.md, 지난 기록 요약 줄(메인 색인 + 이 자리의 오래된 기록, ID·시각 없음, merge는 `M … ← 합쳐짐`),
  이 자리의 지금까지 요약, 최근 기록의 시각+본문, 가장 최근 항목의 `다음`, 다른 자리의 남은 일과 이어받기 문구.
- 세션 리드(`session_read`)는 연결을 바꾸지 않는 조회다. 지도(ID 포함)·원문·찾기, 다른 세션도 읽는다.
- 기존 `history.md` 항목은 건드리지 않는다. 옛 `work:`/`run:` 항목과 옛 `상태: 열림`·`다음:` 줄은 그대로 읽고, 새 저장부터 위 규칙을 적용한다.

## 도구 (호스트가 conversation_id를 채움)

일곱 개 + 프로젝트 첫 실행 도구 하나.

| 도구 | 인자 / 동작 |
|---|---|
| session_create | name, context — 새 세션. context(방향)는 필수이며 없거나 공백뿐이면 폴더를 만들지 않고 거절. 만든 뒤 이 대화의 새 자리에 붙인다 |
| session_load | name?, branch?, history_count=5, map_limit=30 — 세션을 정하고 이 대화를 자기 자리에 붙인 뒤 정체성을 돌려줌. 처음 붙는 대화는 자리가 자동으로 생기고, 이미 자리가 있으면 그 자리를 그대로 쓴다. branch를 주면 그 자리를 이어받으며 살아 있는 대화가 붙은 자리·중단한 자리는 거절. branch=main은 메인 색인 조회 |
| session_save | summary, history, next?, recap? — 본문은 자기 브랜치에, 메인에 색인 한 줄. next가 없으면 recap 필수, 있으면 recap 금지. summary가 이름표를 갱신 |
| session_finish | branch? — 그 자리를 지금 닫고 메인에 합쳐짐 1개. 지금 자리를 닫으면 이 대화는 새 자리로 이어간다. 요약·본문은 받지 않는다(코어가 기록에서 만든다) |
| session_list | 작업 주제 목록: 이름, context.md 첫 문장, 최신 기록 요약, 남은 일 수 |
| session_branch | action=create/attach/abandon, branch?, label?, parent?, reason? |
| session_read | action=map/recent/entry/find, name?, branch?, limit=30, count=5, id?, file?, query? — 연결을 바꾸지 않는 읽기 |

```javascript
session_create({name:"demo",context:"사용자와 정한 이 세션의 목적"})
session_save({summary:"확인한 결과",history:"작업 요약과 근거 파일 링크",next:"이어갈 일(있을 때만)"})
session_save({summary:"끝낸 결과",history:"본문",recap:"이 자리에서 한 일 전체 정리"}) // next 없는 저장
session_branch({action:"attach",branch:"branch-20261016T110012-ee58db1c"}) // 남은 일 이어받기
session_branch({action:"create",label:"따로 할 일"})
session_branch({action:"abandon",reason:"사용자가 그만둔 이유"})
session_finish({})
session_read({action:"map",limit:30})
session_read({action:"recent",count:5})
session_read({action:"entry",id:"session/main@2026-10-13T12:00:00.000Z"})
session_read({action:"find",file:"work/review/result.md"})
```

목적 없는 세션은 만들지 않는다. `session_create`는 사용자와 정한 방향을 context로 받아야 하고,
코어를 직접 부르는 `sessions().create`도 같은 규칙으로 거절한다.
브랜치 이름은 자동(UTC 시각+랜덤)이며 사용자에게 보이지 않는다. 이름표가 사람이 읽는 이름이다.
`main`/`메인`은 메인 줄기의 예약 이름이다. limit/count 0은 전체.
지도는 최근 체크포인트부터 채우고 `그 앞 N개`로 줄인다.

## 파일

브랜치 파일 (`work/<브랜치>/history.md`):

```markdown
<!-- head-context branch:1 -->
# branch-20261016T110012-ee58db1c

이름표: 저장 요약으로 갱신되는 사람이 읽는 이름
시작: 2026-10-13T12:00:00.000Z
갈래: session/메인@2026-10-13T11:00:00.000Z
갈래-ID: session/main@2026-10-13T11:00:00.000Z
상태: 열림

## 지금까지 요약

다음 없는 저장마다 덮어쓰는 이 자리 전체 정리.

## 2026-10-13T12:10:00.000Z

요약: 자기 결과 한 줄

자기 본문만.

다음: 위치
```

- `상태:`는 열림 / 멈춤 / 끝남 / 중단. 계산되는 상태(진행 중·남은 일·내려감)는 파일에 없다.
- `이름표:`는 처음에 호스트 제목이나 첫 사용자 지시에서 따오고, 저장마다 그 요약으로 갱신한다. 옛 파일의 `주제:`도 이름표로 읽는다.
- `## 지금까지 요약`은 머리글과 첫 체크포인트 사이에 있고 날짜 제목이 아니므로 체크포인트로 읽히지 않는다.
- 부모 체크포인트가 없으면 `갈래: session/메인@없음`, 갈래-ID는 비어 있다. 저장이 없는 브랜치를 부모로 지정하면 그 위의 자리를 가리킨다(빈 자리는 물려줄 것이 없고 버려지기 때문).
- 형식 식별 주석은 기존 work 산출물의 history.md를 브랜치로 오해하지 않기 위한 기본값.
- 갈래-ID는 옛 동일 시각 중복 체크포인트가 있어도 정확한 갈라진 항목을 고정한다.
- 지도 ID는 URL-escaped 세션/줄기@시각, 옛 중복 시각에는 #2 등 번호가 붙는다.
- 브랜치에서 브랜치를 가를 수 있고(깊이 제한 없음) 닫힌 부모 기록도 갈래로 삼을 수 있다.

메인 색인 항목 (저장마다 한 줄):

```markdown
## 2026-10-16T11:00:14.252Z

요약: 설계 확정
이름표: 설계 확정 · 본문: work/branch-20261016T110012-ee58db1c/history.md
```

메인 합쳐짐 항목 (붙은 대화가 끝날 때 하나):

```markdown
## 2026-10-13T13:00:00.000Z

요약: 이름표
상태: 멈춤
브랜치: review
기록: work/review/history.md

마지막 지금까지 요약

이어서 한 일:
- 그 뒤 저장 요약

마지막 다음: 이어갈 일
```

다음이 없던 자리는 `상태: 끝남` + 그 지금까지 요약만 본문으로 쓴다.
중단은 `상태: 중단` + `이유:` 한 줄이며, 브랜치 첫머리 상태도 같이 갱신한다.
`이름표:`·`본문:` 줄과 표시 줄은 도구만 쓴다. 모델 본문에 이 접두사로 시작하는 줄은 거절한다.
브랜치 lock → 메인 lock 순서로 쓰며, 이미 닫힌 브랜치는 다시 합치지 않는다(첫머리 상태가 멈춤 방지 역할).
파일 변경 뒤 색인 실패/중단은 다음 읽기의 mtime/size 동기화로 회복된다. 파일이 권위다.
강제 종료된 lock 디렉터리의 자동 회수는 이전과 같이 범위 밖이다.

## 대화와 자리: Claude Code 기록이 권위

`.head/state`는 계산 결과의 캐시이고, 권위는 Claude Code가 남기는 기록이다.
모든 시작(startup·resume·clear·compact·fork)에서 자리를 다시 계산하고, 캐시가 어긋나면 기록이 이긴다.

| 묻는 것 | 읽는 기록 |
|---|---|
| 이 대화가 살아 있나 | `~/.claude/sessions/<pid>.json`이 아직 이 대화 ID를 들고 있고 `process.kill(pid,0)`이 통하면 살아 있다. 상태 기록의 `liveness`는 `{pid, session_id, registry}`이며 읽는 쪽이 호스트를 몰라도 검사된다 |
| MCP가 지금 대화 찾기 | `process.ppid`의 등록 파일 → `sessionId`. 채널 대기 파일도 이것으로 짝을 맞춘다 |
| /clear 뒤 자리 잇기 | 등록 파일로 내 pid를 찾고, 같은 pid가 직전에 쓰던 대화의 자리를 잇는다. 옛 대화는 끝난 것으로 기록한다 |
| 이어짐 | 옛 기록 끝의 `{"type":"continued-in","continuedInSessionId":…}`. 프로젝트 기록 폴더의 꼬리만 읽어 사슬을 만들고 깊이 제한 없이 따라 올라간다(417개 파일 12ms 실측) |
| 포크 부모 | 바로 위 부모만 쓴다: 훅 입력의 `forked_from` → 실행 인자 `--resume <부모>.jsonl --fork-session`(Linux `/proc`, 보조) → 복사된 기록의 uuid 겹침. 복사는 uuid를 그대로 보존하므로, 자리를 가진 대화들 중 자기 기록이 내 기록 안에서 가장 늦게 끝나는 대화가 바로 위 부모다. 첫 기록의 `forkedFrom`(가장 오래된 조상)은 마지막 수단 |
| 하위 에이전트 | `SubagentStart`/`SubagentStop`의 `session_id`가 띄운 대화다. 그 대화의 자리 아래 `↳`로 보인다. 포크의 포크가 띄운 것도 같다 |

- 깊이 제한 없음: 조상 목록은 가까운 순이고, 코어는 자리를 가진 첫 조상을 쓴다. 중간 조상이 캐시에 없어도 더 위로 간다.
- 끝났음의 증거가 필요하다: 상태 기록이 `ended`라고 말하거나, 남긴 증거가 지금 맞지 않을 때만 죽은 것으로 본다. 증거가 없는 기록은 "모름"이고 자리를 닫지 않는다.
- `SessionEnd`의 `reason`이 `clear`면 자리를 닫지 않는다. 바로 뒤에 오는 시작이 같은 자리를 잇기 때문이다. 그 밖의 reason은 닫는다.
- 실측(Claude Code 2.1.301): `--resume <id>`는 같은 대화 ID + `source: resume`. `--resume <id> --fork-session`은 새 ID + `source: fork`이며 훅 입력에 부모 ID가 없고 `continued-in`도 쓰지 않는다. 훅 입력에 `session_title`은 없다.
- `source`가 `resume`·`fork`면 대화가 이미 맥락을 들고 있으므로 로드를 다시 넣지 않는다. 처음 시작·`/clear`·압축은 넣는다.

## 프로젝트 첫 실행 (초기설정·조사)

플러그인을 켠 프로젝트에서 처음 시작하면 두 단계를 한 번씩 묻는다. 묻는 것은 LLM, 쓰는 것은 코드(`project_setup`)다.

- 상태: `.head/config.json`의 `first_run: {setup, survey}`. 값은 `done`(끝남) 또는 `never_ask`(다시 묻지 않음). 없으면 아직 안 함. `sessions_dir` 등 다른 키는 그대로 둔다.
- 시작 훅(startup·/clear만, resume·compact 제외): 초기설정 전이면 짧은 안내를 세션 정체성 뒤에 붙인다. 정체성이 훅 상한을 넘어 채널로 가도 안내는 훅에 남는다.
  모델은 첫 입력에서 먼저 "초기설정 해도 될까요?"를 묻고 답을 받은 뒤 원래 이야기로 간다. 거절하면 "다시는 묻지 않을까요?"를 묻고, 예일 때만 기록한다(아니오면 다음 시작에 다시 묻는다).
- 초기설정 = 플러그인의 `instructions/HEAD_CORE.md`를 프로젝트 `.head/core.md`로 복사 + 프로젝트 `CLAUDE.md`에 `@.head/core.md` 한 줄(파일 없으면 생성, 있으면 끝에 한 번만, 기존 내용 보존).
  CLAUDE.md가 의존하는 파일은 언제나 프로젝트 안에 둔다. 플러그인 설치 경로(버전마다 바뀜)를 가리키지 않는다.
  도구 결과로 코어 본문을 돌려주므로 그 대화부터 적용된다.
- 초기설정이 끝난 프로젝트는 시작마다(모든 source) `.head/core.md`를 플러그인 코어로 맞춘다.
  Claude Code 2.1.300 실측: 대화형은 CLAUDE.md를 시작 훅 뒤(첫 질의 때)에 읽어 같은 시작에 반영되고, 헤드리스 `-p`는 훅 전에 읽어 다음 시작부터 반영된다.
- 조사: 초기설정이 끝났고 플러그인에 `instructions/survey.md`가 있을 때만 "프로젝트 조사해볼까요?"를 묻는다. 지금은 그 파일이 없어 묻지 않는다(내용 준비 중).

| 도구 | 인자 |
|---|---|
| project_setup | action=setup / never_ask(step=setup·survey) / survey_done. conversation_id 없음(프로젝트 단위) |

## SQLite

`.head/index.sqlite` 하나. 외부 npm/서버/타이머 없음. SQLite 기본 rollback journal은
트랜잭션 중 임시로 생기며 정상 종료 때 제거된다.

```sql
files(path PRIMARY KEY, mtime, size)
nodes(id PRIMARY KEY, kind, session, stem, stamp, file, start, end, seq)
edges(src, dst, kind, PRIMARY KEY(src,dst,kind))
```

- node kind: session / branch / checkpoint / file. start/end는 UTF-8 byte 위치.
- edge kind: next / fork / merge / points. fork는 부모 줄기와 정확한 체크포인트 둘을 연결한다.
- mtime+size가 바뀐 원본만 다시 색인. 구조 간선은 변경 후 다시 연결한다.
- 참조는 실제 존재하는 파일만: Markdown 링크, backtick 경로, 절대/상대 경로.
  상대 경로는 항상 세션 폴더 기준. URL은 로컬 파일이 아니다.
- 삭제/스키마 불일치/손상된 DB는 파일에서 재생성. 읽기 내용은 DB에 복제하지 않는다.
- SQLite busy timeout, BEGIN IMMEDIATE, 프로젝트 gate로 동시 프로세스와 스키마 교체를 직렬화.
  그래프 읽기는 history lock을 취하지 않으며, writer는 append lock을 풀고 색인한다.

Node: 실기 24.11.1에서 내장 SQLite는 플래그 없이 동작하나 ExperimentalWarning이 있다.
require의 동기 구간에서 **SQLite 경고만** 선택적으로 억제하고 다른 경고는 그대로 둔다.
플래그 없이 SQLite 사용은 22.13.0, 본 구현 timeout 옵션은 22.16.0/24.0.0부터.
경고도 없는 최소 LTS는 공식 소스 기준 24.15.0(직전 24.14.0에는 경고), 25 계열 25.7.0.
그 버전 바이너리는 여기서 설치/실행하지 않았다.

## 호환·검증

- work는 없다. 도구는 work 인자를 거절하고, 연결 기록은 branch만 본다(옛 연결의 work는 메인으로 읽음).
  HEAD_CONTEXT_WORK 환경변수도 읽지 않는다. 옛 `work:`/`run:` 항목은 메인 체크포인트로 읽고, 요약이 없을 때만 지도에 work 이름표를 보인다.
- 옛 항목의 `상태: 열림`·`다음:` 줄은 그대로 읽는다. 로드는 본문에서 이 줄들을 빼고 보여 준다.
- Claude/OpenCode ID injection은 새 두 도구까지 인식한다. 상태/하위작업 어댑터는 그대로다.
- 판은 세션 줄 아래에 진행 중·남은 일 자리만 보인다(끝남·내려감·중단은 빠진다). 자리의 자리는 한 단 더 들어가고,
  대화가 없어도 남은 일 자리는 ·로 보인다. 하위작업은 그 소유 대화 아래 ↳이며, 포크의 포크가 띄운 것도 그 대화 아래다.
  같은 세션에 살아 있는 대화가 둘이면 각자의 자리 줄이 하나씩이고, 보일 자리가 없으면 그 외 세션 N개로 모은다.

```bash
HEAD_CONTEXT_TEST_ROOT=/절대/시험폴더 node --test scripts/*.test.mjs
node scripts/map.mjs /절대/프로젝트 세션 30
node scripts/board.mjs /절대/프로젝트 --watch
claude --plugin-dir /절대/head-agent-core
```

## 시작·재개·압축 = 세션 로드

- 모든 시작에서 자리를 다시 계산한다(위 표). 재개(`resume`)와 포크(`fork`)는 맥락이 이미 있어 로드를 넣지 않고, 처음 시작·`/clear`·압축은 넣는다. 압축 요약은 믿지 않는다.
- 새 대화의 세션: 이어짐·`/clear`는 앞 대화의 자리를 그대로 잇고, 포크는 바로 위 부모의 세션에 자기 자리를 받는다. 그 밖에는 주어진 이름(`HEAD_CONTEXT_SESSION` 또는 호스트 세션 제목)이 있는 세션일 때만 붙는다. 이름을 Herdr 탭 라벨에서 얻는 일은 로컬 런처 몫이다.
- 시작 자리 물음은 없다. 자리는 코어가 만들고, 로드가 다른 자리의 남은 일과 "○○의 '이름표' 이어서 할까요?"라는 물음 문구를 함께 준다.
- 떠나기 전 물음(끝낼까요/열어둘까요)과 `keep_open`은 없앴다. 자리를 떠나면 저장이 없으면 버리고, 있으면 메인에 합쳐진다. 다시 붙으면 다시 열린다.

### 훅 상한과 채널 (Claude)

- 로드가 훅 JSON 9,000자(10,000자 호스트 상한의 여유) 안이면 훅 additionalContext에 그대로 넣는다.
- 넘으면 훅은 세션·자리와 "session_load를 호출해 받으세요" 안내만 넣고 `.head/state/pending-load/claude-<대화ID>.json`을 남긴다.
  데스크톱 앱에는 채널이 없으므로 이 안내가 기본 경로다.
  채널이 있는 호스트에서는 그 대화의 head-context MCP(자기 `process.ppid`의 등록 파일이 그 대화를 가리키는 쪽)가
  initialized 2초 뒤부터 0.5초마다 이 파일을 집어 같은 로드를 `notifications/claude/channel`(meta kind=session_load)로 보낸다.
- 채널은 `claude/channel` capability를 선언한 플러그인 MCP다. 마켓에서 설치하고
  `--channels plugin:head-context@<마켓>`로 등록한다. 관리 설정 `/etc/claude-code/managed-settings.json`의
  `allowedChannelPlugins`에 이 플러그인이 있어야 한다. `--plugin-dir`로 띄우는 개발 실행은
  `--dangerously-load-development-channels plugin:head-context@inline`이 필요하다. 채널이 없으면 메시지는 버려지고,
  훅 안내에 따라 모델이 session_load를 부른다. 10분 넘은 대기 파일은 버린다.
- Claude의 SessionStart `initialUserMessage`는 interactive 시작·/clear에서 턴을 만들지 않아(헤드리스 전용) 쓰지 않는다.
- OpenCode는 요청마다 시스템 프롬프트를 다시 만들고 상한이 없으므로, 연결된 대화의 정체성을 매 요청 system에 넣는다.

### 기본값

- 최근 기록 5건, 지난 기록 요약 줄 최대 30개(넘으면 `그 앞 N개 — session_read map`).
- 내려감 기간 N은 14일. `.head/config.json`의 `standby_days`로 바꾼다(0 이상의 숫자).
- 남은 일은 자리마다 이름표와 마지막 다음을 한 줄로 보여 준다.
- 사용자 지시 첫 줄을 Unicode code point 80자까지 상태의 current에 적는다. 10자 이하는 짧은 답으로 간주해 이전 줄 유지.
  slash command, synthetic/system 입력, 워커 완료·다른 HEAD 전달은 현재 줄을 바꾸지 않는다.
- SessionStart timeout 20초: 첫 SQLite 색인과 10초 잠금 대기를 수용.

### 판 JSON

--json은 `[ {name, main:{status,summary,timestamp,conversations}, branches:[{name,label,topic,parent,lifecycle,next,status,summary,timestamp,conversations}]} ]`.
`label`이 이름표이고 `topic`은 같은 값의 호환 이름이다. `lifecycle`은 진행 중 또는 남은 일이다.
conversation은 host/conversation_id/alive/status/host_status/current/subtasks/running_subtasks를 갖는다.
JSON도 텍스트와 같은 메인·열린 브랜치·소유 대화 구조다.
watch의 q/Esc/Ctrl+C 종료는 그대로이며 데이터/서비스를 변경하지 않는다(파생 SQLite 색인만 갱신 가능).
