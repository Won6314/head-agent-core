# head-context 0.7.0 — 작업 세션·작업 브랜치·저장

작업 세션마다 메인과 작업 브랜치로 기록과 할 일을 남기고, 시작·/clear·압축 때 작업 맥락을 다시 불러온다.
살아 있는 대화를 작업 세션·작업 브랜치와 묶어 보여 준다. 포크·새 대화·대화 사이 메시지는 호스트(Claude Code) 기능을 그대로 쓴다.
기준 환경은 이 플러그인만 붙은 Claude Code 데스크톱 앱이다. 상주 프로세스는 없다(도구 호출 때만 도는 MCP 하나와 훅 둘).

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
- 작업 브랜치는 이름을 주고 연다(`session_branch create`). 다른 작업 브랜치로 옮기거나 대화가 끝나도 떠난 작업 브랜치는 열린 채 남는다.
  한 작업 브랜치를 여러 대화가 이어도 되고(attach), 작업 브랜치 없이 메인에 바로 기록해도 된다.
- 작업 브랜치는 next 없는 저장으로만 닫힌다. 그 저장은 recap(전체 정리)이 필수이고, 메인에 합침 항목 하나를 쓰며, 저장한 대화는 메인으로 돌아온다.
  닫힌 작업 브랜치에 붙어 있던 다른 대화는 메인에 기록한다. 닫힌 작업 브랜치에 attach하면 다시 열린다. 사용자가 그만둔 일은 abandon(이유 필수).
- 0.6의 `멈춤`(대화가 끝나 닫힌 것)은 열린 것으로 친다. 0.6 자동 이름(`branch-<시각>-<16진>`)은 짧은 이름 + 옛 이름표로 보인다.
- 기본 포크·하위 에이전트(훅이 `agent_id`를 채운 호출)는 쓰기를 거절하고 읽기만 된다. 쓰기 = load·create·save·branch·todo add/done.
- 할 일은 작업 세션의 `todo.md`(작업 브랜치가 닫혀도 남는다). 줄 형식은 앞선 도구와 같다: `- [ ] 2026-09-18 기한 2026-09-23(수) "원문"`.

## 도구 (호스트가 conversation_id·agent_id를 채움)

| 도구 | 하는 일 |
|---|---|
| session_list | 작업 세션 목록: 이름, context.md 첫 문장, 메인 최신 요약, 열린 작업 브랜치 수 |
| session_load | 작업 세션 불러오기·연결, 작업 맥락 반환. branch로 작업 브랜치 이어 가기, branch=main은 메인 |
| session_create | 새 작업 세션(context 필수), 메인에 연결 |
| session_save | 기록. next 없으면 작업 브랜치를 닫음(recap 필수) |
| session_branch | create(이름 필수)/attach/abandon(reason 필수) |
| session_read | map/recent/entry/find, 연결을 바꾸지 않음 |
| session_todo | add/list/done |
| session_conversations | 살아 있는 대화: 작업 세션 → 작업 브랜치 → 대화, 안 붙은 대화 묶음. 대화마다 제목·주소·마지막 활동 |
| project_setup | 첫 실행 초기설정(.head/core.md + CLAUDE.md 한 줄) |

## 작업 맥락 (시작 훅·session_load)

데이터만 담는다. 무슨 뜻인지는 서버 안내문(`core/mcp.mjs` instructions)에 한 번만 있다.

```
# 작업 세션: <이름>
<context.md>

## 이 대화의 작업 브랜치: <이름>      ← 작업 브랜치에 있을 때만: 정리(있으면), 최근 기록 3개 본문, 마지막 다음
## 열린 작업 브랜치 (n)                ← 이름 · 마지막 시각 · 다음
## 할 일 (열린 n개, 기한 임박 k개)     ← 기한 임박 전부 + 최근 것까지 3줄
## 흐름 (최신이 위)                    ← git 그래프 모양 지도, 최대 30줄
```

- 재개(resume)는 이미 맥락이 있으므로 넣지 않는다. 새 시작·/clear·압축은 넣는다.
- 훅 JSON 9,000자를 넘으면 훅은 한 줄 안내만 넣고, 채널이 있는 호스트에서는 같은 MCP가 같은 내용을 메시지로 보낸다(`hosts/claude/channel.mjs`).

## 대화 알아보기 (Claude)

- 연결 파일 `.head/state/conversations/claude-<대화ID>.json`: 작업 세션, 작업 브랜치, 연결 시각, 호스트가 알려 준 것(pid, 앱 주소 hostSessionId, 제목, entrypoint, 기록 경로).
  코어가 남기는 대화 상태는 이것뿐이다(작업 중·대기·끝남 같은 상태, 하위작업 기록, 종료 처리 없음).
- 새 대화가 이어받는 자리(시작 훅, 연결이 없을 때만): continued-in 사슬 → /clear 직전 대화(같은 앱 주소, 없으면 같은 pid) → 복사본의 부모(기록 앞부분에 복사된 다른 sessionId 중 자기 기록 바로 앞의 것: 데스크톱 사이드 포크·`--fork-session`).
  이어받으면 작업 세션과 작업 브랜치를 그대로 가져간다. 없으면 `HEAD_CONTEXT_SESSION` 이름의 메인, 그것도 없으면 연결하지 않는다.
- 살아 있는 대화: 등록 파일(`~/.claude/sessions/<pid>.json`)의 cwd가 이 프로젝트이고 pid가 응답하는 대화(CLI·데스크톱 모두),
  그리고 데스크톱 대화(entrypoint `claude-desktop`) 중 기록 파일이 7일 안에 바뀐 것. 데스크톱 앱은 쉬는 대화를 내렸다가 메시지가 오면 다시 띄우므로 데스크톱 대화에는 "끝남"이 없고, 7일은 보여 줄 범위다.
  보관한 데스크톱 대화(앱 기록의 isArchived)는 뺀다. 생존은 목록을 그릴 때만 보고 저장하지 않는다.
- 주소: 데스크톱은 hostSessionId(`local_…`), CLI는 등록 파일의 name. 프로세스가 없는 데스크톱 대화는 연결 파일이나 앱 기록에서 찾는다.

## 훅

`hooks/hooks.json`: SessionStart(시작·재개·/clear·압축) 하나와 PreToolUse(`session_*` 도구) 하나. 하위 에이전트의 SessionStart는 건너뛴다.

## 파일·색인

- `sessions/<이름>/context.md`, `history.md`(메인), `work/<작업 브랜치>/history.md`, `todo.md`. 파일이 원본이다.
- `.head/index.sqlite`: 위치·구조만 담는 색인(files/nodes/edges). 손상·버전 불일치면 파일에서 다시 만든다.
- 작업 브랜치 파일 머리의 `이름표:`·`갈래:`·`상태:` 줄과 메인의 색인 줄(`이름표: … · 본문: …`)은 파일 형식이라 그대로 둔다.
- 지도는 `git log --graph`처럼 저장 하나가 한 줄(짧은 ID 5자, MM-DD HH:MM, 요약), 메인이 첫 열. 시각은 `.head/config.json`의 `timezone`, 없으면 컴퓨터 시간대.

## 시험

```bash
HEAD_CONTEXT_TEST_ROOT=<절대 시험 폴더> node --test scripts/*.test.mjs
node scripts/map.mjs <절대 프로젝트> <작업 세션> 30
node scripts/board.mjs <절대 프로젝트> [--all] [--json] [--watch]
```
