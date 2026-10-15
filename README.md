# head-context

Claude Code 플러그인. 작업을 세션 단위로 기록하고 다시 불러오며, HEAD 코어 지침을 프로젝트에 붙인다. Claude Code의 기본 지침은 그대로 두고 덧붙이기만 한다.

## 설치

```text
/plugin marketplace add <owner>/head-agent-core
/plugin install head-context@head-local
```

요구: Node 22.16 이상(24.15 이상이면 내장 SQLite 경고도 없다). 외부 npm 의존은 없다.

## 첫 실행

플러그인을 켠 프로젝트에서 처음 말을 걸면 먼저 묻는다.

1. **"초기설정 해도 될까요?"** — 예면 코어 지침을 `.head/core.md`에 두고, 프로젝트 `CLAUDE.md`에 `@.head/core.md` 한 줄을 넣는다(파일이 없으면 만들고, 있으면 기존 내용은 그대로 둔다). 그 대화부터 코어 지침이 적용된다.
2. **"프로젝트 조사해볼까요?"** — 조사 절차가 준비되면 초기설정 뒤에 묻는다(아직 없음).

거절하면 "다시는 묻지 않을까요?"를 묻는다. 예면 그 프로젝트에서는 다시 묻지 않고, 아니오면 다음 시작에 다시 묻는다. 파일 쓰기는 모델이 아니라 `project_setup` 도구가 한다.

## 개념

- **세션**: 큰 작업 주제. `context.md`(방향)와 `history.md`(기록)를 가진다.
- **메인**: 세션 안의 일이 시간순으로 쌓이는 곳. 기록 한 항목은 날짜·요약·본문·다음(선택)이다.
- **브랜치**: 별도 작업을 동시에 할 때만 쓴다. 끝나면 결과 한 항목이 메인에 합쳐진다.
- **다시 불러오기**: 새 시작·`/clear`·압축 때 세션 정체성(context.md, 열린 브랜치, 지난 기록 요약, 최근 기록)을 다시 넣는다. 압축 요약은 믿지 않는다.
- **파일이 원본**: 기록은 Markdown 파일이고, `.head/index.sqlite`는 위치만 담은 색인이다. 지우면 파일에서 다시 만든다.

## 들어 있는 것

| 종류 | 이름 |
|---|---|
| MCP 도구 | `session_create`, `session_load`, `session_save`, `session_finish`, `session_list`, `session_branch`, `session_read`, `project_setup` |
| 스킬 | `/head-context:session <세션> [브랜치]` |
| 훅 | 시작(다시 불러오기·첫 실행 안내), 입력·응답 끝·권한 요청·질문·하위 에이전트·종료(판 상태), 세션 도구 호출 전(대화 ID 채우기) |
| 지침 | `instructions/HEAD_CORE.md` (초기설정 때 프로젝트 `.head/core.md`로 복사) |

프로젝트에 생기는 것: `.head/`(설정 `config.json`, 세션 `sessions/<이름>/`, 상태 `state/`, 색인 `index.sqlite`), 초기설정을 하면 `CLAUDE.md`의 한 줄.

세션 정체성이 시작 훅 상한(약 9,000자)을 넘으면 나머지는 채널로 이어 들어온다. 채널은 `--channels plugin:head-context@<마켓>`과 관리 설정의 `allowedChannelPlugins`가 있어야 열린다. 없으면 모델이 `session_load`를 직접 부른다.

판 보기: `node <플러그인>/scripts/board.mjs <프로젝트> --watch`.

## 아직 아닌 것

- OpenCode: 세션 어댑터(`hosts/opencode/`)는 있으나 첫 실행과 코어 지침 연결은 아직 없다.
- 스킬: 후보는 `candidates/`에 있고 아직 싣지 않았다.

## 개발

```bash
HEAD_CONTEXT_TEST_ROOT=/절대/시험폴더 node --test scripts/*.test.mjs
claude --plugin-dir /절대/head-agent-core
```

세부 형식은 [docs/internals.md](docs/internals.md).
