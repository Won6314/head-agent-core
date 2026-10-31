# head-context 0.9.5 — 작업 세션·작업 브랜치·저장

작업 세션마다 메인과 작업 브랜치로 기록과 할 일을 남기고, 시작·/clear·압축 때 작업 맥락을 다시 불러온다.
살아 있는 대화를 작업 세션·작업 브랜치와 묶어 보여 준다. 포크·새 대화·대화 사이 메시지는 호스트(Claude Code) 기능을 그대로 쓴다.
기준 환경은 이 플러그인만 붙은 Claude Code와 Codex(데스크톱 앱 포함)다. 한 패키지에 두 앱의 포장이 있다(`.claude-plugin`, `.codex-plugin`). 두 앱은 프로젝트의 같은 기록을 같이 읽고 쓴다. 상주 프로세스는 없다(도구 호출 때만 도는 MCP 하나와 훅 둘). 사용자가 직접 치는 명령(스킬)은 두지 않는다: 모든 것은 자연어로 하고 모델이 도구를 부른다.
스킬은 모델이 부르는 `start-job` 하나다(`skills/start-job`, 호스트 목록에는 `head-context:start-job`). 일을 시작할 때 부르라는 지침은 서버 안내문 첫 줄과 코어 지침 둘 다에 있다.
첫 실행 초기설정은 프로젝트 `.claude/settings.json`에 `env.CLAUDE_CODE_FORK_SUBAGENT="1"`도 넣는다(기본 포크 켜기, 다른 설정은 그대로, 이미 값이 있거나 JSON이 깨졌으면 손대지 않고 알린다).
현황판·채널·대화 상태 표시는 코어 밖(추가기능)이다.

## 용어

| 말 | 뜻 | 코드 |
|---|---|---|
| 작업 세션 | 이어지는 큰 일의 묶음. 폴더 하나, 목적은 context.md | session, `sessions/` |
| 작업 맥락 | 작업 세션을 불러오면 들어오는 정보 | identity |
| 작업 브랜치 | 작업 세션 안에서 열리고 닫히는 한 번의 일. 이름이 있고 여럿이 동시에 열림 | branch |
| 메인 | 닫힌 작업 브랜치가 합쳐지는 하나의 흐름 | main |
| 기록 | 저장 한 번 | checkpoint/entry |
| 대화 | 호스트의 대화 하나(호스트가 "세션"이라 부르는 것) | conversation |

## 동작

- 대화는 처음에 아무 작업 세션에도 붙지 않는다. 작업 세션을 불러오거나 만들면 그 메인에 붙는다. 작업 브랜치를 자동으로 만들지 않는다.
- 작업 브랜치는 이름을 주고 연다(`branch create`). 다른 작업 브랜치로 옮기거나 대화가 끝나도 떠난 작업 브랜치는 열린 채 남는다.
  한 작업 브랜치를 여러 대화가 이어도 되고(attach), 작업 브랜치 없이 메인에 바로 기록해도 된다.
- 작업 브랜치는 next 없는 저장으로만 닫힌다. 그 저장은 recap(전체 정리)이 필수이고, 메인에 합침 항목 하나를 쓰며, 저장한 대화는 메인으로 돌아온다.
  닫힌 작업 브랜치에 붙어 있던 다른 대화는 메인에 기록한다. 닫힌 작업 브랜치에 attach하면 다시 열린다. 사용자가 그만둔 일은 abandon(이유 필수).
- 0.6의 `멈춤`(대화가 끝나 닫힌 것)은 열린 것으로 친다. 0.6 자동 이름(`branch-<시각>-<16진>`)은 짧은 이름 + 옛 이름표로 보인다.
- 대화 안에서 도는 작업(Agent 도구의 fork·하위 에이전트, 훅이 `agent_id`를 채운 호출)은 쓰기를 거절하고 읽기만 된다. 쓰기 = load·create·save·branch·todo add/done. 시작할 때 SubagentStart 훅이 안내 한 덩어리를 넣는다(맡은 일 하나, 결과를 돌려주면 부른 대화가 확인·저장, 기록은 읽기만). 대화가 되는 복제(데스크톱 사이드 포크)에는 아무것도 넣지 않고 보통 대화처럼 저장한다. 지침에는 포크 저장 규칙을 두지 않는다.
- 프로그램이 돌리는 대화(entrypoint `sdk-cli`·`sdk-ts`·`sdk-py`, 곧 `claude -p`로 띄운 포크·워커)도 쓰기를 거절하고 읽기만 된다. 판정은 MCP 서버가 받는 `CLAUDE_CODE_ENTRYPOINT`(없으면 등록 파일). 사람이 돌리는 대화(cli·claude-desktop·편집기)는 그대로 쓴다.
- 작업 브랜치 저장의 상대 링크(`[이름](work/…)`)는 브랜치 파일 자리에서도 열리게 `../../`을 붙여 적는다. 색인은 기록 파일 폴더 → 작업 세션 폴더 순으로 찾는다.
- 할 일은 작업 세션의 `todo.md`(작업 브랜치가 닫혀도 남는다). 줄 형식은 앞선 도구와 같다: `- [ ] 2026-09-18 기한 2026-09-23(수) "원문"`.

## 도구 (도구 서버 이름 `session`, 호스트가 conversation_id·agent_id를 채움)

Claude Code에서는 `mcp__plugin_head-context_session__<도구>`, Codex에서는 `mcp__session__<도구>`로 보인다.

| 도구 | 하는 일 |
|---|---|
| list | 작업 세션 목록: 이름, context.md 첫 문장, 메인 최신 요약, 열린 작업 브랜치 수 |
| load | 작업 세션 불러오기·연결, 작업 맥락 반환. branch로 작업 브랜치 이어 가기, branch=main은 메인 |
| create | 새 작업 세션(context 필수), 메인에 연결 |
| save | 기록. next 없으면 작업 브랜치를 닫음(recap 필수) |
| branch | create(이름 필수)/attach/abandon(reason 필수) |
| read | overview(둘러보기: 연결 없이 작업 맥락을 읽기 전용으로, 최근 기록은 작업 세션 전체에서)/map/recent/entry/find/files, 연결을 바꾸지 않음. files는 기록(id) 또는 작업 브랜치(branch)가 가리킨 파일과 그 파일들이 링크·백틱 경로로 가리킨 파일을 나무 모양으로(depth 1~3, 기본 2, 50개까지) |
| todo | add/list/done |
| conversations | 살아 있는 대화: 작업 세션 → 작업 브랜치 → 대화, 안 붙은 대화 묶음. 대화마다 제목·주소·종류·마지막 활동·하는 일. 포크·워커는 띄운 대화가 살아 있으면 그 아래에 한 번만 |
| setup | 첫 실행 초기설정(코어 지침 켜기와 사본 .head/core.md, .claude/settings.json) |
| send (Codex만) | 다른 대화에 메시지 보내기. threadId에 대화 목록의 보낼 곳(`claude:<ID>`·`codex:<ID>`), prompt에 보낼 말. Claude Code는 원래 SendMessage를 쓴다 |

## 작업 맥락 (시작 훅·load)

데이터만 담는다. 무슨 뜻인지는 서버 안내문(`core/mcp.mjs` instructions)에 한 번만 있다.

서버 안내문은 공용 부분과 앱별 부분으로 나뉜다. 공용 부분(`instructions`)과 `start-job` 스킬, 도구 설명은 앱의 도구 이름을 쓰지 않고 "이 앱의 보내기 도구", "하위 에이전트를 이 대화의 컨텍스트를 이어받게 부르기(기본 포크)", "하위 에이전트를 새 컨텍스트로 부르기(에이전트)"처럼 쓴다. 앱별 부분(`APP_INSTRUCTIONS`의 "이 앱에서 부르는 도구")이 그 앱에서 실제로 부르는 도구를 적는다: Claude Code는 SendMessage(to)·Agent 도구 subagent_type "fork"·다른 subagent_type(브리프는 prompt), Codex는 이 플러그인의 send(threadId, prompt)·spawn_agent fork_turns "all"·"none"(브리프는 message). 각 앱은 공용 부분 뒤에 자기 앱 부분만 받는다(`instructionsFor`; Claude Code는 서버 안내문, Codex는 시작 훅). OpenCode는 공용 부분만 받는다. load는 두 부분을 이어서 돌려준다.

```
# 작업 세션: <이름>                    ← 작업 세션 부분: 반드시 들어온다
<context.md 전문>
이 대화의 작업 브랜치: <이름 | 없음(메인)>

## 열린 작업 브랜치 (n)                ← 작업 맥락 부분: 이름 · 마지막 시각 · 다음
## 할 일 (열린 n개, 기한 임박 k개)     ← 기한 임박 전부 + 최근 것까지 3줄
## 흐름 (최신이 위)                    ← git 그래프 모양 지도, 최대 30줄
## 이 작업 브랜치의 최근 기록: <이름>  ← 작업 브랜치에 있을 때만: 정리(있으면), 최근 3개 본문, 마지막 다음
```

코어 지침(`instructions/HEAD_CORE.md`)도 시작 훅이 넣는다(초기설정 뒤, 시작·/clear·압축 때. 재개·포크 때는 넣지 않음). 0.7은 CLAUDE.md의 `@.head/core.md` import로 넣었는데, Claude Code가 압축 뒤 import한 파일을 Read 결과로 다시 붙여 두 번 들어갔다. Claude에서는 출력 상한에 맞춰 두 출력(`core 1 2`, `core 2 2`)으로 나누고, 순서가 섞여 들어와도 알도록 앞부분 끝과 뒷부분 머리에 꼬리표를 단다.
- 0.7 프로젝트: 코어 출력이 CLAUDE.md의 import 줄을 빼고(그 줄만 있던 CLAUDE.md는 지움) 코어를 넣는다. 2.1.311은 시작 훅 뒤에 CLAUDE.md를 읽으므로 이 시작부터 한 번만 들어간다.
- 0.7에서 시작한 대화를 다시 열 때: 호스트가 "지침 파일이 더 이상 없다"를 붙이므로, 그 대화의 기록에 훅이 넣은 코어(꼬리표)가 없으면 한 번 넣는다.

시작 훅은 세 출력으로 나눠 넣는다(시작·/clear·압축 모두, 재개는 아무것도 넣지 않음).
- 작업 세션: 9,000자를 넘으면 context.md 앞부분과 전문 파일 경로. 연결이 없으면 연결 안 됨 한 줄. 첫 실행 안내도 여기.
- 작업 맥락: 9,000자를 넘으면 이 순서로 줄여 맞춘다: 최근 본문 3→2→1개, 본문 앞부분 + `(전문: read entry <ID>)`, 지도 30→15줄. 열린 작업 브랜치·할 일·마지막 다음은 끝까지 남는다(load 결과는 줄이지 않음).
- 최근 대화(압축·/clear 직후만): 직전 주고받기 5번의 원문(사용자가 친 말·작업 중에 보낸 말·질문 창 답, 모델 답 중 보이는 글). 도구 호출·결과·생각·훅/시스템 알림·명령 줄은 빼고, 그 앞 사용자 말은 버린다. /clear 뒤에는 /clear 전 대화의 기록 파일에서 읽는다. 넘치면 앞쪽 주고받기부터 빼고 기록 파일 경로를 적는다.

상한은 출력 하나마다 따로다(2.1.303 실측: 한 출력이 10,000자를 넘으면 2KB 미리보기와 파일 경로로 바뀌고, 9,000자 출력 넷은 합계 36,000자로 전부 들어옴). 출력들은 나란히 돌아 들어오는 순서가 정해져 있지 않다.

압축 직전 훅(PreCompact)은 호스트의 요약 대신 한 줄 포인터만 쓰게 하는 지시를 낸다(`hosts/claude/compact.mjs`). 되살릴 것은 위 세 출력이 넣는다.

## 대화 알아보기 (Claude)

- 연결 파일 `.head/state/conversations/claude-<대화ID>.json`: 작업 세션, 작업 브랜치, 연결 시각, 호스트가 알려 준 것(pid, 앱 주소 hostSessionId, 제목, entrypoint, 기록 경로).
  코어가 남기는 대화 상태는 이것뿐이다(작업 중·대기·끝남 같은 상태, 하위작업 기록, 종료 처리 없음).
- 새 대화가 이어받는 자리(시작 훅, 연결이 없을 때만): continued-in 사슬 → /clear 직전 대화(같은 앱 주소, 없으면 같은 pid) → 복사본의 부모(기록 앞부분에 복사된 다른 sessionId 중 자기 기록 바로 앞의 것: 데스크톱 사이드 포크·`--fork-session`).
  이어받으면 작업 세션과 작업 브랜치를 그대로 가져간다. 없으면 `HEAD_CONTEXT_SESSION` 이름의 메인, 그것도 없으면 연결하지 않는다.
- 살아 있는 대화: 등록 파일(`~/.claude/sessions/<pid>.json`)의 cwd가 이 프로젝트이고 pid가 응답하는 대화(CLI·데스크톱 모두),
  그리고 데스크톱 대화(entrypoint `claude-desktop`) 중 기록 파일이 7일 안에 바뀐 것. 데스크톱 앱은 쉬는 대화를 내렸다가 메시지가 오면 다시 띄우므로 데스크톱 대화에는 "끝남"이 없고, 7일은 보여 줄 범위다.
  보관한 데스크톱 대화(앱 기록의 isArchived)는 뺀다. 생존은 목록을 그릴 때만 보고 저장하지 않는다.
- 주소: CLI는 등록 파일의 `messagingSocketPath`를 `uds:<경로>`로(SendMessage가 받는 모양), 데스크톱은 hostSessionId(`local_…`). 프로세스가 없는 데스크톱 대화는 연결 파일이나 앱 기록에서 찾는다.
- 부모: 프로그램이 돌리는 대화는 시작 훅이 연결 파일에 `parent`를 적는다. 띄운 쪽이 준 환경 변수 `HEAD_CONTEXT_PARENT`가 먼저이고, 없으면 복사된 기록의 `forkedFrom.sessionId`(SDK 세션 복사) 또는 앞선 다른 sessionId(`--fork-session`). 새 대화가 이어받는 자리도 이 순서의 부모가 맨 앞이다.

## 현황 데이터 (추가기능용)

현황판·폰 화면 같은 코어 밖 도구는 `hosts/claude/tree.mjs`의 `claudeTree(project, {name})`로 `conversations`와 같은 데이터(Claude Code·Codex 대화 함께)를 받는다. 부를 때마다 등록 파일과 기록 끝을 읽어 만들고 저장하지 않는다.

```
{timezone, sessions:[{name, main:{last_summary,last_at}, conversations:[Row],
  branches:[{name,title,next,last_at,last_summary,conversations:[Row]}]}], loose:[Row]}
Row = {conversation_id,host:'claude'|'codex',title,address,reachable,last_at,entrypoint,kind:'person'|'copy',parent,said,task,doing,session,stem,children:[Row]}
```

- `kind:'copy'`이고 부모가 살아 있으면 부모의 `children`에만 들어간다. 부모가 없으면 자기 줄기의 맨 뒤(사람 다음)에 남는다.
- 작업 중·대기 같은 상태는 코어에 없다. 필요하면 등록 파일의 `status`를 직접 읽는다.
- `doing(row, 작업 브랜치 이름, 메인의 마지막 저장)`은 `core/sessions.mjs`에서도 내보낸다.
- 코어 밖 도구의 하위 작업 보고는 `core/state.mjs`의 `report()`(선택 칸 `child_conversation_id` 포함)로 `.head/state/subtasks/`에 남긴다. 코어는 이것을 읽지 않는다.

## 훅

`hooks/hooks.json`: SessionStart 다섯 명령(`hook.mjs core 1 2|core 2 2|session|context|recent`), PreCompact 하나(요약 지시), SubagentStart 하나(대화 안 작업에 안내), PreToolUse 하나(`session` 서버 도구, setup 제외), 모드 하나(`hooks/conversations.mjs`: SendMessage의 `codex:` 대상). 하위 에이전트의 SessionStart는 건너뛴다. 파일 다시 붙이기 막기·스킬 목록 되살리기는 넣지 않았다(지금 버전에서 시험 뒤 정함).

## 파일·색인

- `sessions/<이름>/context.md`, `history.md`(메인), `work/<작업 브랜치>/history.md`, `todo.md`. 파일이 원본이다.
- `.head/index.sqlite`: 위치·구조만 담는 색인(files/nodes/edges, 스키마 2). 손상·버전 불일치면 파일에서 다시 만든다.
  `linkfiles`/`links`는 files가 물을 때만 채우는 파일→파일 링크 캐시다(수정 시각·크기가 바뀐 파일만 다시 읽음, 1MB 초과·글 아닌 파일·URL·없는 파일 제외).
- 작업 파일 규칙: 작업 세션 폴더의 `work/YYYY-MM/YYYY-MM-DD-<이름>.md`(여러 개면 같은 이름 폴더), 커지면 `work/<작업명>/`으로 옮기고 가리키던 기록 링크도 고친다. 서버 안내문과 save 설명에 있다.
- 작업 브랜치 파일 머리의 `이름표:`·`갈래:`·`상태:` 줄과 메인의 색인 줄(`이름표: … · 본문: …`)은 파일 형식이라 그대로 둔다.
- 지도는 `git log --graph`처럼 저장 하나가 한 줄(짧은 ID 5자, MM-DD HH:MM, 요약), 메인이 첫 열. 시각은 `.head/config.json`의 `timezone`, 없으면 컴퓨터 시간대.
  표기도 git 관례 그대로: 줄기 끝에 `(main)`·`(이름)`, 이 대화가 있는 줄기는 `(HEAD -> 이름)`, 닫힌 작업 브랜치의 합침은 `Merge branch '이름'`(0.6의 멈춤 합침도), 중단은 `Abandon branch '이름': 이유`. 줄기 끝에 상태 말은 붙이지 않는다.
- 기록이 가리키는 파일(points, `find(file)`, `files`의 시작점)은 `[이름](경로)`와 백틱 경로만이다. 본문에 이름만 적힌 파일은 가리킨 것이 아니다.

## 0.6에서 올릴 때 (한 번)

0.6은 마켓 `head-local`(GitHub `plugin-root` 브랜치)이었다. 0.7부터는 main의 마켓 `head-agent-core`다. 마켓 이름이 달라 자동으로 넘어가지 않으니 이 순서로 바꾼다.

1. 예전 판 떼기: `/plugin uninstall head-context@head-local`, `/plugin marketplace remove head-local`. 프로젝트·사용자 settings에 `head-local`이 남아 있으면(`extraKnownMarketplaces`, `enabledPlugins`) 지운다.
2. 새 판 설치: 아래 [배포·업데이트](#배포업데이트)의 설치 명령.
3. 기록 정리: 아래 스크립트를 미리 보기로 돌려 보고 `--apply`. 스크립트는 설치된 플러그인 폴더(`~/.claude/plugins/cache/head-agent-core/head-context/<판>/scripts/`)에 있다.
4. 자동 업데이트 붙이기: 0.6에서 초기설정을 마친 프로젝트는 초기설정을 다시 묻지 않는다. Claude Code를 다시 연 뒤 모델에게 `setup`(action=setup)을 한 번 부르게 한다. 이미 있는 것은 그대로 두고 빠진 것(마켓 `autoUpdate`, 플러그인 켜기, 기본 포크 env)만 더한다.
5. 한 번 더 다시 연다. 0.8부터 코어 지침은 시작 훅이 새 판 그대로 넣는다(`.head/core.md`는 다른 도구가 읽는 사본).

작업 기록(`.head/sessions/` 등)은 그대로 읽힌다. 지우지 않는다.

`node scripts/migrate-0.7.mjs <절대 프로젝트> [--apply]` — 미리 보기가 기본이고, 지우지 않고 `.head/state/_0.6/`으로 옮긴다.
- 옛 상태 파일 `activity/`·`pending-load/`(0.7은 읽지 않음). `subtasks/`는 코어 밖 도구가 아직 써서 둔다.
- 저장 없는 0.6 자동 브랜치(`branch-<시각>-<16진>`, 열림·멈춤, 다른 브랜치가 갈라져 나오지 않은 것). 그 브랜치를 가리키던 대화는 메인으로.
- 이름표에 ` (fork)`가 반복되면 하나만 남긴다.
다시 돌려도 더 할 일이 없다.

## Codex 포장

- `.codex-plugin/plugin.json`이 스킬(`skills/`), 도구 서버(`.codex-mcp.json`, 상대 경로 `scripts/codex-mcp.mjs` — Codex는 도구 서버 인자의 `${CLAUDE_PLUGIN_ROOT}`를 풀지 않는다), 훅(`hooks/codex-hooks.json`)을 가리킨다. Codex는 `hooks` 필드의 파일만 읽어서 Claude용 `hooks/hooks.json`과 섞이지 않는다.
- SessionStart 네 명령(`codex-hook.mjs core|instructions|session|context`, 출력 상한 끔): 코어 지침 전체, 서버 안내문(Codex는 서버 안내문을 시작 때 모델에 주지 않는다), 작업 세션(+ 첫 실행 안내), 작업 맥락. `source`가 resume·fork면 아무것도 넣지 않는다.
- 대화 ID: 도구 서버가 도구 호출마다 오는 `_meta.threadId`·`_meta.sessionId`를 읽는다(훅으로 인자를 바꾸지 않는다). 연결 파일은 `.head/state/conversations/codex-<대화ID>.json`.
- 프로젝트: Codex는 도구 서버를 플러그인 폴더에서 띄우고 프로젝트를 알려 주지 않는다. 시작 훅이 대화 ID와 작업 폴더(cwd)를 플러그인 데이터 폴더의 `threads/<대화ID>.json`에 남기고, 도구 서버가 그것으로 프로젝트를 찾는다. 데이터 폴더는 두 쪽 모두 설치 경로(`<home>/plugins/cache/<마켓>/<플러그인>/<판>` → `<home>/plugins/data/<플러그인>-<마켓>`)에서 구한다.
- /clear: Codex는 /clear 전 대화를 확정할 단서를 남기지 않아 이어받지 않는다(연결 안 됨 한 줄). 압축 뒤: Codex가 사용자 말 원문을 남기므로 최근 대화를 넣지 않고, 요약 지시(PreCompact)도 쓰지 않는다(Codex 서버 압축은 그 출력을 쓰지 않음).
- UserPromptSubmit 한 명령(`codex-hook.mjs inbox`): 바로 깨우지 못한 동안 쌓인 메시지를 입력과 함께 넣는다.
- 도구 서버는 Codex가 띄우는 동안만 돌고, 플러그인이 따로 띄우는 상주 프로그램은 없다. Codex 설정 파일은 쓰지 않는다.
- 하위 에이전트(spawn_agent, 포크든 새 컨텍스트든): Codex는 도구 호출마다 부른 스레드(`_meta.threadId`)와 그 트리의 뿌리(`_meta.sessionId`, 뿌리 스레드 자신의 ID)를 준다. 둘이 다르면 대화 안 작업이다. 대화는 뿌리, 작업은 그 스레드(agent)이고 기록은 읽기만 된다. SubagentStart 한 명령(`codex-hook.mjs subagent`)이 Claude와 같은 안내를 넣는다. Codex는 하위 에이전트에서 SessionStart를 돌리지 않으므로 등록·목록에 따로 오르지 않는다(Claude의 대화 안 작업과 같다). 그 안의 입력 훅은 부른 대화의 편지함을 비우지 않는다.
- 설치: `codex plugin marketplace add Won6314/head-agent-core` → `codex plugin add head-context@head-agent-core`. 그다음 아래 훅 신뢰를 한 번 한다.
- 훅 신뢰(한 번): Codex는 신뢰하지 않은 플러그인 훅을 묻지 않고 건너뛴다. 그동안 도구는 보이지만 코어 지침·안내·작업 맥락·초기설정 질문이 하나도 들어가지 않는다.
  - 터미널 Codex: 설치 뒤 처음 열 때 뜨는 `Hooks need review — 6 hooks are new or changed`에서 `Trust all and continue`.
  - Codex 앱: 왼쪽 아래 프로필 → 설정 → 맨 아래 `코딩` → `Hook` → `플러그인에서 제공` 아래 `Head Context` → `모두 신뢰`. 같은 화면의 `설정에서 → 사용자 구성`은 사용자 설정의 훅이라 이 플러그인과 무관하다.
  - 신뢰한 뒤 새 대화를 연다.
  - 훅 6개가 하는 일(화면에는 이름 없이 번호로만 보인다):

    | 때 | 훅 | 하는 일 |
    |---|---|---|
    | 세션 시작 | 훅 1 `core` | HEAD 코어 지침(초기설정한 프로젝트만) |
    | 세션 시작 | 훅 2 `instructions` | 플러그인 안내(공용 + 이 앱에서 부르는 도구) |
    | 세션 시작 | 훅 3 `session` | 대화 등록(도구 서버가 이 대화의 프로젝트를 찾는 근거), 연결 상태·첫 실행 안내 |
    | 세션 시작 | 훅 4 `context` | 연결된 작업 세션의 작업 맥락 |
    | 사용자 프롬프트 제출 | 훅 1 `inbox` | 바로 깨우지 못한 동안 다른 대화가 보낸 메시지 |
    | 하위 에이전트 시작 | 훅 1 `subagent` | 하위 에이전트에게 "기록은 읽기만" 안내 |

  - 신뢰 전에 도구를 부르면 도구 결과가 이 신뢰 경로를 알려 준다(모델이 사용자에게 전한다).

## 대화 간 메시지 (Claude Code ↔ Codex)

LLM은 자기 앱의 보내기 도구에 대화 목록(`conversations`)의 보낼 곳을 그대로 준다. 두 앱의 대화가 한 목록에 함께 나온다.

| 보내는 쪽 | 도구 | 받는 쪽 | 가는 길 |
|---|---|---|---|
| Claude Code | 원래 SendMessage(to) | Claude (`uds:…`) | 원래 그대로 |
| Claude Code | 원래 SendMessage(to) | Codex (`codex:<ID>`) | 모드(`hooks/conversations.mjs`)가 가로채 `scripts/relay.mjs`로 넘기고 원래와 같이 보냄으로 답한다 |
| Codex | 이 플러그인의 send(threadId, prompt) | Claude (`claude:<ID>`) | Claude의 받은 편지함 소켓(등록 파일 `messagingSocketPath`)에 Claude끼리 보내는 모양으로 넣는다(`hosts/claude/deliver.mjs`). 받는 대화가 써 둔 인증 키(`sessions/<pid>.<경로 해시>.key`)로 인증 줄을 먼저 보낸다(Windows는 필수). 받았다는 확인은 오지 않아 결과는 `sent`다 |
| Codex | 이 플러그인의 send | Codex (`codex:<ID>`) | 아래 받기 |

- Codex에서 받기(`hosts/codex/deliver.mjs`): 받는 대화가 공용 엔진(`codex app-server --listen unix://`, 터미널 Codex가 스스로 띄우고 붙는다)에서 돌면 그 엔진에 `turn/start`를 보내 바로 깨운다. Codex 원래 send_message_to_thread와 같은 위임 모양이라 화면에 "Sent by Codex from task <보낸 곳>"이 뜬다. 데스크톱 앱 대화는 Codex 대기열로 넣는다(0.9.4 절). 창 안에서 엔진이 도는 창은 바깥에서 깨울 문이 없어 편지함(`.head/state/inbox/codex-<ID>/`)에 두고, 다음 입력 때 넣는다. 편지함은 이름 바꾸기로 가져갈 권리를 잡아 한 메시지를 한 번만 준다(가져간 쪽이 넣은 직후 지우기 전에 죽거나 10분 넘게 멈추면 한 번 더 들어갈 수 있다).
- Codex의 원래 send_message_to_thread는 Codex 대화로만 가고, 플러그인이 끌 수 없다(끄려면 사용자 설정 파일을 고쳐야 한다). 그래서 남겨 두고, Codex 안내문에서 대화 간 메시지는 send를 쓰라고 안내한다.
- 대화 목록의 Codex 대화: 시작 훅이 `.head/state/presence/codex-<ID>.json`에 어느 엔진에서 도는지 남기고, 입력 훅이 갱신한다. 살아 있음은 목록을 그릴 때 본다: 공용 엔진은 엔진이 들고 있는 대화(창을 닫아도 엔진이 30분쯤 들고 있다), 창 안 엔진은 그 프로세스, 데스크톱은 기록이 7일 안에 바뀐 것.
- 실행 중이 아닌 Claude 대화(데스크톱이 내린 대화)는 Codex 목록에 "지금은 받지 못함"이 붙고, 보내면 실패를 돌려준다.
- Claude 등록 파일과 기록은 `CLAUDE_CONFIG_DIR`을 따른다(없으면 `~/.claude`). Codex 도구 서버에는 `.codex-mcp.json`의 env_vars로 넘긴다.
- 화면 없이 띄운 Claude 대화(`claude -p`)를 띄운 쪽이 `HEAD_CONTEXT_PERSON=1`로 띄우면 포크·워커가 아니라 사람 대화로 센다(기록 쓰기도 됨).

## 0.9.5에서 바뀐 것

- 깨진 파일 때문에 일이 멈추지 않는다. 기계적으로 고칠 수 있으면 고치고, 못 고치면 모델에게 알린다.
  - 플러그인 자기 기록(대화 연결, 하위 작업 보고, 기록 폴더 안 파일)이 깨지면 `<파일>.broken-<시각>`으로 옮기고 없는 것으로 읽는다. 다음 훅 출력이나 도구 답에 옮긴 경로를 한 줄로 알린다.
  - `.head/config.json`은 사람이 고치는 설정이라 깨지면 전처럼 멈춘다(계속하면 기록이 엉뚱한 곳에 쓰인다). 대신 어느 파일이 왜 문제인지 알린다.
  - 시작·입력 훅이 실패하면 stderr에만 쓰지 않고 대화에 한 줄을 넣는다.
  - Codex 대화 기록(presence) 하나가 깨져도 목록 전체가 비지 않고 그 대화만 빠진다.
  - Codex 편지함의 깨진 메시지는 지우지 않고 편지함의 `.broken/`으로 옮긴 뒤, 그 대화의 다음 입력 때 알린다.
- 앱 사이 전달·Codex 엔진 연결의 오류 문구를 한국어로 바꿨다(Codex가 준 원문은 안에 남긴다).
- 코드 정리(동작 변화 없음): OS 차이는 `core/platform.mjs`, 두 앱이 같이 쓰는 메시지 봉투·훅 출력은 `core/protocol.mjs`, 잠금은 `core/lock.mjs`, 상태 JSON 읽기와 파일 끝 읽기는 `core/storage.mjs` 한 곳으로 모았다. 두 앱 포장은 도구 서버에서 서로를 직접 부르지 않고 입구(`scripts/mcp.mjs`, `scripts/codex-mcp.mjs`)가 이어 붙인다. 코드 모양은 Prettier로 맞췄다.
- 확인: 시험 89/89. f2 실제 실행(깨진 파일 다섯 경우, Codex 공용 엔진 깨우기, Codex→Claude 보내기)과 Windows 실제 실행(프로세스 목록, Codex 앱 엔진 판별, 인증 줄을 붙인 Claude 보내기). Mac은 이번 판에서 다시 돌리지 않았다.

## 0.9.4에서 바뀐 것

- Codex 데스크톱 앱 대화로 가는 메시지를 Codex 자체 대기열로 넣는다(`codex queue --thread <ID> --message <글>`, 앱 엔진의 실행 파일과 CODEX_HOME으로 실행). 전에는 편지함에 두고 사용자가 다음에 입력할 때 넣었다.
  - 앱의 엔진은 10초마다 대기열을 보고, 자기가 들고 있는 대화가 쉬고 있으면 턴을 연다. 사용자가 최근까지 쓰던 대화는 몇 초 안에 받고, 그렇지 않은 대화는 그 대화를 여는 순간 받는다(입력은 필요 없다). 진행 중인 턴은 끊지 않고 끝난 뒤 받는다.
  - Mac은 넣은 뒤 `codex://threads/wake/<ID>`를 배경으로 열어(`open -g`) 앱이 그 대화를 바로 집게 한다. 화면은 옮기지 않는다. Windows 앱(26.930)에는 이 링크가 없어 대화를 열 때 받는다.
  - 대기열은 사용자 메시지로만 받으므로 Codex 자체 위임 모양(`<codex_delegation>`)으로 싸서 넣는다.
  - 대기열에 넣지 못하면(앱 엔진 실행 파일을 모름, 명령 실패) 전처럼 편지함에 둔다. 0.9.4 전에 기록된 앱 대화는 실행 파일 경로가 없으므로, 그 대화를 새로 열 때까지 편지함으로 간다.
  - Codex send와 중계의 결과에 `app-queued`가 더해졌다.
- Mac 실제 확인(ChatGPT 앱 26.1027, 번들 codex 0.166): 앱을 켠 직후 들고 있지 않던 대화로 보낸 메시지가 6초 만에 턴으로 열려 답했고 편지함은 비어 있었다.

## 0.9.3에서 바뀐 것

- Windows에서 터미널 Codex 대화(공용 엔진)를 메시지로 바로 깨운다. 전에는 실행 환경을 `ps`로만 읽어서 Windows에서는 판별하지 못했고, 메시지가 다음 입력 때까지 편지함에 머물렀다.
  - 실행 환경: Windows에서는 PowerShell로 프로세스 목록(부모 번호, 실행 명령)을 한 번 받아 공용 엔진·창·앱을 가린다.
  - 엔진 연결: Windows의 공용 엔진은 AF_UNIX 소켓을 쓰는데 Node는 Windows에서 이 소켓에 직접 붙지 못한다(EACCES). 그래서 엔진의 실행 파일로 `codex app-server proxy --sock <소켓>`을 띄워 그 입출력으로 붙는다. Mac·Linux는 그대로 소켓에 바로 붙는다.
  - 소켓 확인: Windows의 AF_UNIX 소켓 파일은 소켓으로 보이지 않으므로 파일이 있으면 된 것으로 본다.
- 도구 서버가 알리는 판 번호를 플러그인 판과 맞췄다(0.9.2에서 0.9.1로 남아 있었다).
- Windows 실제 확인(Codex 0.160, Claude Code 2.1.314): Claude 쪽 중계로 보낸 메시지에 Codex 대화가 입력 없이 바로 깨어나 답했고, Codex send로 보낸 메시지를 Claude 대화가 인증을 거쳐 받았다.

## 0.9.2에서 바뀐 것

- Windows에서 Codex가 Claude 대화로 보낸 메시지가 들어가지 않던 문제를 고쳤다. Windows의 Claude Code는 첫 줄로 인증을 받은 연결의 메시지만 받는데, 플러그인이 인증 없이 보내고 연결이 닫힌 것을 성공으로 알렸다. 이제 받는 대화가 써 둔 인증 키로 인증 줄을 먼저 보낸다(Mac·Linux에서도 키가 있으면 보낸다). Windows에서 키를 찾지 못하면 보내지 않고 실패를 알린다.
- Codex send의 Claude 쪽 결과를 `delivered`에서 `sent`로 바꿨다. 받는 쪽이 같은 연결로 받았다는 답을 주지 않으므로 보낸 것까지만 말한다.

## 0.9.1에서 바뀐 것

- Codex 훅 신뢰 안내: 설치 안내에 신뢰 경로와 훅 6개가 하는 일을 적었다. 훅이 돌지 않은 Codex 대화에서 도구를 부르면 결과가 신뢰 경로를 알려 준다(전에는 "대화를 새로 시작하거나 다시 열어 주세요"만 나왔다).

## 0.9.0에서 바뀐 것

- 도구 서버 이름을 `context`에서 `session`으로, 도구 이름에서 `session_`·`project_` 머리를 뗐다(`load`, `save`, `branch`, `todo`, `list`, `read`, `create`, `conversations`, `setup`). 플러그인 이름은 그대로다. 옛 이름을 적어 둔 권한 설정·지침은 고쳐야 한다. 업데이트 전에 열려 있던 대화는 옛 이름을 기억하고 있어 옛 이름으로 부르면 '알 수 없는 도구'가 난다. 새 대화로 열면 새 이름과 새 지침으로 시작한다. Codex에서 옛 대화를 이어 열기(resume)는 시작 지침을 다시 넣지 않으므로, 그 대화의 옛 지침은 그대로 남는다(도구는 새 이름으로 바뀐다). 옛 이름 별칭은 두지 않는다.
- 대화 간 메시지(위 절), 두 앱 통합 대화 목록, 화면 없는 Claude 사람 대화 표시.
- 지침을 공용 부분과 앱별 부분으로 나눴다. 공용 지침·start-job·도구 설명에는 앱의 도구 이름이 없고, 각 앱은 "이 앱에서 부르는 도구"로 자기 앱 도구만 받는다.

## 0.8.1에서 바뀐 것

- 프로젝트 경로와 그 위쪽의 심볼릭 링크를 허용합니다(Mac `/tmp` 등). 저장 경로를 계산할 때 프로젝트 경계만 실제 경로로 바꾸며, `.head`·기록 폴더·기록 파일의 링크는 계속 거절합니다.
- 호스트의 프로젝트 cwd와 Codex 대화 등록 형식은 바꾸지 않습니다. 0.8.0의 작업 세션·대화 연결을 그대로 이어 읽습니다.

## 0.8.0에서 바뀐 것

- 코어 지침을 두 앱 모두 시작 훅으로 넣는다. 초기설정은 CLAUDE.md를 건드리지 않는다. 0.7 프로젝트의 import 줄은 다음 시작에 빠진다.
- Codex 포장(위).
- 도구 서버가 호출마다 프로젝트를 받을 수 있다(`serve({projectOf})`).

## 0.7.1에서 바뀐 것

- `claude -p`로 도는 대화: 띄운 대화 아래 하위로 묶고, 쓰기를 거절한다. 부모는 `HEAD_CONTEXT_PARENT` 또는 복사된 기록의 `forkedFrom`.
- `conversations`: 하위 묶기, 메인 대화의 하는 일에 메인의 마지막 저장. 현황 데이터 `claudeTree()`·`doing()`을 내보냄.
- 작업 브랜치 저장의 상대 링크가 브랜치 파일에서도 열림.
- 서버 안내문: 작업 세션은 사용자에게 물은 뒤 만든다.
- `report()`: `child_conversation_id`, 이전 `kind` 유지.

## 배포·업데이트

설치(Claude Code 2.1.275 이상), 앱이나 대화 안에서:

```
/plugin marketplace add Won6314/head-agent-core
/plugin install head-context@head-agent-core
```

터미널에서는 한 줄로 `claude plugin install head-context --marketplace Won6314/head-agent-core`. 그다음 첫 대화에서 초기설정에 동의하면 프로젝트에 자동 업데이트까지 적힌다.

공개 GitHub `Won6314/head-agent-core`의 마켓 `head-agent-core`(저장소 이름과 같음)로 낸다. 새 판은 `plugin.json` 버전을 올려 main에 합치고 태그 `head-context--v<판>`을 단다. 초기설정이 프로젝트 settings에 이 마켓을 `autoUpdate: true`로 적으므로 앱이 시작할 때 새 판을 받는다.

## 시험

```bash
HEAD_CONTEXT_TEST_ROOT=<짧은 절대 시험 폴더(소켓 경로 길이 제한)> node --test scripts/*.test.mjs
node scripts/map.mjs <절대 프로젝트> <작업 세션> 30
```

## 코드 모양

Prettier 기본에 작은따옴표·한 줄 120자(`.prettierrc.json`)로 맞춘다. 외부 패키지는 두지 않으므로 고친 뒤 이렇게 돌린다.

```bash
npx prettier@3 --write "**/*.mjs"
```
