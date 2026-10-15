# head-context 0.4.0 candidate — 기록과 파일 위치 그래프

이 경로가 운영 플러그인이다. HEAD 런처가 로컬 마켓 `head-local`의 설치본(원본 직접 읽기)으로 켠다.
메인·브랜치 기록과 그래프 기반 읽기에 이어, 시작/재개/압축 복구·호스트 지금 줄·새 판 흐름을 구현했다.
운영 HEAD 지침은 제안만 만들었고 변경하지 않았다. agent-task/Herdr 연결은 다음 범위다.
판의 옛 works 투영을 제거했고 `--watch`/q/Esc와 `--json`은 유지했다.

## 계약

- 세션은 메인이 기본. 이름 없이 session_save하면 세션 history.md에 저장한다.
- 새 기록에는 `work:`가 없다. 옛 `work:`/`run:` 항목은 메인 체크포인트다.
- 브랜치 파일은 자기 기록만 갖는다. 부모는 갈라진 시각/정확한 ID로 가리키며 복사/구분선 없음.
- 완료/중단은 메인에 정리 항목 한 개로 합쳐지고 해당 대화는 메인으로 돌아온다.
- 파일이 원본. SQLite는 구조·위치만 저장하며 방향/요약/본문/커서는 저장하지 않는다.
- 모든 load/start/list/map/recent/entry/find/view는 그래프의 위치를 얻어 파일을 읽는다.
- 체크포인트는 날짜·요약·본문·다음(선택) 네 칸이다. work와 일반 항목의 `상태:`는 없다.
  `다음`이 있으면 이어갈 일이 있다는 뜻이고, 없으면 끝났다는 뜻이다.
  브랜치 정리·중단 항목만 도구가 `상태:`/`브랜치:`/`기록:`/`이유:` 표시 줄을 쓴다(그래프 merge 간선과 지도 `M` 표시).
- 세션 로드 = 세션 정체성. 시작 훅과 session_load는 같은 출력이다:
  context.md, 열린 브랜치, 최근 5건보다 오래된 항목의 요약 줄(ID·시각 없음, merge는 `M … ← 합쳐짐`),
  최근 5건의 시각+본문(요약·표시 줄·지난 다음 없음), 가장 최근 항목의 `다음`.
- 세션 리드(session_read)는 연결을 바꾸지 않는 조회다. 지도(ID 포함)·원문·찾기, 다른 세션도 읽는다.

## 도구 (호스트가 conversation_id를 채움)

기존 다섯 개 + action을 가진 두 개로 읽기/브랜치 동작을 묶었다.

| 도구 | 인자 / 동작 |
|---|---|
| session_create | name, context — 새 세션, 기본 메인. context(방향)는 필수이며 없거나 공백뿐이면 폴더를 만들지 않고 거절 |
| session_load | name?, branch?, history_count=5, map_limit=30 — 세션을 정하고 붙인 뒤 세션 정체성을 돌려줌. map_limit은 지난 기록 요약 줄 최대 수(0 전체). name 생략은 지금 자리. branch=main은 메인. 닫힌 브랜치는 조회만 |
| session_save | summary, history, next? — 지금 자리 저장·즉시 색인. next는 이어갈 일이 있을 때만 |
| session_finish | branch?, summary?, history?, next? — 결과 정리를 대화에 보이고 메인에 합침. 메인의 옛 호출은 마무리 체크포인트만 쓰며 메인을 닫지 않음 |
| session_list | 세션과 짧은 지도 |
| session_branch | action=create/attach/main/abandon, branch?, topic?, parent?, summary?, history?, next?, reason? |
| session_read | action=map/recent/entry/find, name?, branch?, limit=30, count=5, id?, file?, query? — 연결을 바꾸지 않는 읽기 |

```javascript
session_create({name:"demo",context:"사용자와 정한 이 세션의 목적"})
session_save({summary:"확인한 결과",history:"작업 요약과 근거 파일 링크",next:"이어갈 일(있을 때만)"})
session_branch({action:"create",branch:"review",topic:"사용자의 첫 지시 첫 줄"})
session_branch({action:"attach",branch:"review"})
session_branch({action:"main"})
session_finish({summary:"브랜치 결과",history:"결정·산출물·남은 것·자료 링크"})
session_branch({action:"abandon",reason:"사용자가 그만둔 이유"})
session_read({action:"map",limit:30}) // 세션 전체 지도, branch 지정 시 그 줄기
session_read({action:"recent",count:5}) // 지금 줄기, 부모 쪽 포함
session_read({action:"entry",id:"session/main@2026-10-13T12:00:00.000Z"})
session_read({action:"find",file:"work/review/result.md"})
session_read({action:"find",query:"낱말"})
session_read({action:"map",name:"다른-세션"})
```

목적 없는 세션은 만들지 않는다. session_create는 사용자와 정한 방향을 context로 받아야 하고,
코어를 직접 부르는 `sessions().create`도 같은 규칙으로 거절한다.
session_branch create는 topic(사용자 지시 첫 줄)이 필요하다. branch 이름 생략 시 UTC 시각+랜덤 이름.
parent 생략은 지금 자리, main/메인은 메인. main/메인은 브랜치 이름으로는 예약어.
브랜치를 떠날 때 종료 지시가 없으면 끝낼지 열어둘지 한 번 묻는 규칙은 MCP 안내에 있다.
limit/count 0은 전체. 지도는 최근 체크포인트부터 채우고 `그 앞 N개`로 줄인다.
브랜치 지도는 부모 줄기를 포함하고 갈라진 뒤 메인 변경은 별도 요약만 보여 준다.

## 파일

```markdown
<!-- head-context branch:1 -->
# review

주제: 사용자 지시 첫 줄
시작: 2026-10-13T12:00:00.000Z
갈래: session/메인@2026-10-13T11:00:00.000Z
갈래-ID: session/main@2026-10-13T11:00:00.000Z
상태: 열림

## 2026-10-13T12:10:00.000Z

요약: 자기 결과 한 줄

자기 본문만.

다음: 위치
```

부모 체크포인트가 없으면 `갈래: session/메인@없음`, 갈래-ID는 비어 있다.
형식 식별 주석은 기존 work 산출물의 history.md를 브랜치로 오해하지 않기 위한 기본값.
갈래-ID는 옛 동일 시각 중복 체크포인트가 있어도 정확한 갈라진 항목을 고정한다.
지도 ID는 URL-escaped 세션/줄기@시각, 옛 중복 시각에는 #2 등 번호가 붙는다.
브랜치에서 브랜치를 가를 수도 있고 닫힌 부모 기록도 갈래로 삼을 수 있다.

메인 정리 항목:

```markdown
## 2026-10-13T13:00:00.000Z

요약: 브랜치 결과
상태: 끝남
브랜치: review
기록: work/review/history.md

결정, 결과, 남은 것과 링크.
```

중단은 상태: 중단 + 이유: 한 줄. 브랜치 첫머리 상태도 끝남/중단으로 갱신한다.
브랜치 lock → 메인 lock 순서로 정리하며, 이미 있는 같은 브랜치 정리 항목을 다시 append하지 않는다.
파일 변경 뒤 색인 실패/중단은 다음 읽기의 mtime/size 동기화로 회복된다. 파일이 권위다.
강제 종료된 lock 디렉터리의 자동 회수는 이전과 같이 범위 밖이다.

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
- 판은 세션 줄이 메인, 열린 브랜치만 아래 줄이다. 브랜치의 브랜치는 한 단 더 들어가고,
  대화가 없어도 열린 브랜치는 ·로 보인다. 하위작업은 그 소유 대화/브랜치 아래 ↳.
  메인에 살아 있는 대화가 둘이면 각각 한 줄이며, 대화도 열린 브랜치도 없으면 그 외 세션 N개로 모은다.

```bash
HEAD_CONTEXT_TEST_ROOT=/절대/시험폴더 node --test scripts/*.test.mjs
node scripts/map.mjs /절대/프로젝트 세션 30
node scripts/board.mjs /절대/프로젝트 --watch
claude --plugin-dir /home/jywon/head-context-next
```

검증 실물은 `/home/jywon/backups/head-context-migration-20261012/evidence/phase3-core/`.
기존 운영 sessions 전체 복사본에서만 실제 자료 색인을 만들었다. 운영 위치에 반영하지 않았다.

## 시작·재개·압축 = 세션 로드

- 재개(resume)는 대화가 이미 세션을 갖고 있으므로 로드하지 않는다.
- 새 시작·/clear·압축은 처음 시작과 같다. 세션 정체성(session_load와 같은 출력)을 다시 넣는다. 압축 요약은 믿지 않는다.
- 새 대화의 세션: /clear는 같은 호스트 프로세스의 직전 대화(activity의 liveness pid 일치)를, native 포크는 forkedFrom 부모를 따른다.
  그 밖에는 주어진 이름(HEAD_CONTEXT_SESSION 또는 호스트 세션 제목)이 있는 세션일 때만 붙는다. 이름을 Herdr 탭 라벨에서 얻는 일은 로컬 런처 몫이다.
- native 포크는 부모 세션에 붙되 이미 맥락이 있으므로 로드는 생략한다.
- 시작 자리 물음(강제 브랜치 선택 질문)은 없다. 로드는 열린 브랜치 목록만 보이고, 어디로 이어갈지는 LLM이 판단하며 모르면 사용자에게 평소 말로 묻는다.
- 브랜치를 떠나는 main/다른 attach/다른 세션 load는 먼저 “끝낼까요, 열어둘까요” 안내를 반환하고 연결을 유지한다.
  사용자가 끝내면 session_finish 후 이동, 열어두면 같은 이동에 keep_open=true. create는 추가 물음 없이 새 브랜치에 붙는다.

### 훅 상한과 채널 (Claude)

- 로드가 훅 JSON 9,000자(10,000자 호스트 상한의 여유) 안이면 훅 additionalContext에 그대로 넣는다.
- 넘으면 훅은 세션·자리와 안내 한 줄만 넣고 `.head/state/pending-load/claude-<대화ID>.json`에 자기 프로세스 조상 pid를 남긴다.
  같은 Claude 프로세스의 head-context MCP(ppid 일치)가 initialized 2초 뒤부터 0.5초마다 이 파일을 집어
  같은 로드를 `notifications/claude/channel`(meta kind=session_load)로 보낸다. Claude는 이것을 한 턴으로 넣는다.
- 채널은 `claude/channel` capability를 선언한 플러그인 MCP다. 운영은 head-agent-core 루트의 로컬 디렉터리 마켓
  `head-local`(`.claude-plugin/marketplace.json`, 원본을 상대경로로 직접 읽음)에서 설치하고,
  `--channels plugin:head-context@head-local`로 등록한다. 관리 설정 `/etc/claude-code/managed-settings.json`의
  `allowedChannelPlugins`에 `head-context@head-local`이 있어야 한다. `--plugin-dir`로 띄우는 개발 실행은
  `--dangerously-load-development-channels plugin:head-context@inline`이 필요하다. 채널이 없으면 메시지는 버려지고,
  훅 안내에 따라 모델이 session_load를 부른다. 10분 넘은 대기 파일은 버린다.
- Claude의 SessionStart `initialUserMessage`는 interactive 시작·/clear에서 턴을 만들지 않아(헤드리스 전용) 쓰지 않는다.
- OpenCode는 요청마다 시스템 프롬프트를 다시 만들고 상한이 없으므로, 연결된 대화의 정체성을 매 요청 system에 넣는다.

### 기본값

- 최근 기록 5건, 지난 기록 요약 줄 최대 30개(넘으면 `그 앞 N개 — session_read map`).
- 열린 브랜치는 자기 마지막 체크포인트/시작 시각 최신순.
- 사용자 지시 첫 줄을 Unicode code point 80자까지 상태의 current에 적는다. 10자 이하는 짧은 답으로 간주해 이전 줄 유지.
  slash command, synthetic/system 입력, 워커 완료·다른 HEAD 전달은 현재 줄을 바꾸지 않는다.
- SessionStart timeout 20초: 첫 SQLite 색인과 10초 잠금 대기를 수용.

### JSON 변경

--json은 `[ {name, main:{status,summary,timestamp,conversations}, branches:[{name,topic,parent,status,summary,timestamp,conversations}]} ]`.
conversation은 host/conversation_id/alive/status/host_status/current/subtasks/running_subtasks를 갖는다.
옛 works와 stopped 집계는 없다. JSON도 텍스트와 같은 메인·열린 브랜치·소유 대화 구조다.
watch의 q/Esc/Ctrl+C 종료는 그대로이며 데이터/서비스를 변경하지 않는다(파생 SQLite 색인만 갱신 가능).

phase4 실물·HEAD 세 글의 전후 제안·운영 반영 순서는
`/home/jywon/backups/head-context-migration-20261012/evidence/phase4-flow/`에 있다. 실행 반영은 하지 않았다.
