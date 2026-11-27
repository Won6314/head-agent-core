# head-context 그래프 빌드 묶음

이 폴더는 [`../../head-context-0.9.20/`](../../head-context-0.9.20/)의 그래프를 만든 재료 전부입니다. 스크립트, 사람이 쓴 문서, 플러그인을 실제로 돌려 받은 출력 기록이 들어 있습니다. 플러그인 새 판을 낼 때 이 폴더로 그 판의 그래프를 다시 만듭니다.

그래프에 무엇을 담는지(정의)와 어떤 차례로 만드는지(일반 순서)는 [`../02a-graph-definitions.md`](../02a-graph-definitions.md)와 [`../02b-graph-workflow.md`](../02b-graph-workflow.md)에 있습니다. 이 README는 head-context 그래프에 맞춘 차례입니다.

## 들어 있는 것

| 파일 | 무엇 | 누가 고치나 |
|---|---|---|
| `make.sh` | 처음부터 다시 만드는 입구. 아래 스크립트를 차례로 부른다 | — |
| `extract_js.mjs` | 코드에서 정의·호출·파일 접근을 뽑는다(TypeScript 구문 트리) | 코드 모양이 바뀌어 못 뽑을 때 |
| `build_graph.py` | 뽑은 코드와 문서를 합쳐 노드·연결을 만들고 SQLite로 쓴다. 문서에 적힌 ID를 그대로 읽어 잇고, 글을 맞추거나 실행 기록을 읽지 않는다(1초 안) | 기능을 찾는 규칙이 코드와 안 맞을 때(빌드가 '분기를 찾지 못함'으로 알린다) |
| `run_a.py`, `write_a1.py` | 플러그인을 임시 폴더에서 실제로 돌려 출력 원문을 모은다(`runs/a-runs.json`, 사람용 `runs/A-1-outputs.md`). 출력설계서를 쓰고 확인할 때 보는 자료이고, 빌드는 읽지 않는다 | 새 동작을 보는 실행을 더할 때(뒤에 더하면 앞 실행 번호가 그대로다) |
| `run_coverage.py` | 기능을 실제로 돌려, 그래프가 말한 코드 범위와 실제로 돈 코드를 맞춘다(`runs/coverage.json`) | — |
| `meaning.json` | 사람이 쓰는 뜻: 기능 한 줄, 정책(조건/주체/행위), DB 컬럼 뜻 | 기능·정책·DB가 바뀌었을 때 |
| `purposes.json` | 코드 묶음 이름과 바깥(파일·소켓·프로세스) 칸, 데이터 대상 줄 단위 지정 | 새 파일·새 바깥 대상이 생겼을 때 |
| `common-modules.json`, `schema.txt` | 공통 모듈 목록, SQLite 표 설명 | 드물게 |
| `docs/` | 출력설계서(`screens.md`: 절 하나 = 출력 부분 하나, `내는 기능` 줄 = 그 부분을 담는 기능), 유저플로우(`activities.md`), 제품 정의서·저니·IA | 출력이나 동작이 바뀌었을 때 |
| `runs/` | 지금 판의 실행 출력 기록과 실행 대조 결과 | `make.sh --with-run`이 다시 쓴다 |
| `hc_graph.py` | 조회 스크립트. `make.sh`가 결과 폴더로 복사한다 | 조회 명령을 고칠 때 |
| `compare_runs.py`, `compare_sqlite.py` | 앞 판과 비교: 실행 출력, 그래프 노드·연결 | — |

## 필요한 것

- git
- Node.js 22.13 이상. 내장 `node:sqlite`를 쓸 수 있어야 한다. `--with-run`의 '옛 Node' 실행에는 node:sqlite가 없는 옛 Node(예: v18)가 `/usr/bin/node`에 있어야 한다(없으면 `run_a.py`가 멈춘다).
- Python 3(표준 라이브러리만)
- TypeScript 5.9의 `typescript.js`
  - 기본 위치는 `~/.local/opt/typescript-5.9.3/lib/typescript.js`다.
  - 다른 곳이면 환경 변수 `HC_TYPESCRIPT=<typescript.js 경로>`로 준다.
  - 받는 법: `npm pack typescript@5.9.3` 뒤 풀기
- 실행 기록은 임시 폴더(`/tmp/hc-demo`)에서만 돈다. 실제 `~/.claude`, `~/.codex` 설정은 읽지도 쓰지도 않는다.

## 쓰는 법

```bash
graph/build/head-context/make.sh <head-agent-core 저장소> [커밋] [--with-run]
```

- 커밋을 생략하면 그 저장소의 HEAD다.
- 판은 그 커밋의 `packages/context/.claude-plugin/plugin.json` 버전이다.
- 결과로 `graph/head-context-<판>/head-context-<판>.sqlite`와 `hc_graph.py`가 생긴다. 마지막 줄에 sqlite의 sha256이 나온다.
- 같은 커밋과 같은 `runs/`면 몇 번을 만들어도 바이트까지 같다.
- 실행 기록에는 실행한 날짜가 들어간다. 그래서 `--with-run`을 다른 날 돌리면 기록 글자가 조금 다를 수 있다. 그래프는 실행 기록을 읽지 않으므로 달라지지 않는다.

## 새 판을 낼 때의 차례

플러그인 새 판을 main에 합친 뒤, 태그를 달기 전에 한다.

1. **그래프를 만든다.** `make.sh <저장소> <새 커밋>`. 빌드가 `problems`를 내면(기능을 찾는 분기 문자열이 코드와 안 맞음, 출력설계서의 내는 기능이 기능에 없음 등) 그 원인을 고친다.
2. **코드 diff로 바뀐 곳을 찾는다.**
   - `git -C <저장소> diff <앞 판 커밋> <새 커밋> -- packages/context`로 바뀐 함수와 새 함수를 본다.
   - 바뀐 함수마다 `python3 -I hc_graph.py impact <함수>`로 걸리는 기능·출력 부분·정책을 모은다.
   - 그래프끼리는 `python3 graph/build/head-context/compare_sqlite.py <앞 판 sqlite> <새 판 sqlite>`로 새로 생기거나 없어진 기능·코드를 본다.
3. **바뀐 곳만 고친다.**
   - 걸린 출력 부분과 유저 활동만 `docs/`에서 고친다. 새 출력 부분이면 절을 더하고 `내는 기능` 줄을 적는다. 바뀐 출력 글은 그 기능만 돌려 확인한다(`run_a.py`의 해당 실행, 또는 직접 실행).
   - 새 기능·정책·DB 컬럼과 뜻이 바뀐 것은 `meaning.json`을 고친다.
   - 새 파일이나 새 바깥 대상은 `purposes.json`을 고친다.
4. **다시 만들고 확인한다.**
   - `make.sh <저장소> <새 커밋>`을 두 번 돌려 sha256이 같은지 본다(한 번에 몇 초).
   - 빌드 출력의 `problems 0`을 본다.
   - 검사 목록 수가 앞 판과 크게 다르지 않은지 본다.
   - 빈 폴더에 sqlite와 `hc_graph.py`만 두고 `python3 -I hc_graph.py overview` 등이 도는지 본다.
5. **만들지 않은 쪽이 검수한다.** 그래프를 만든 대화가 아닌 다른 AI나 사람이 그래프를 원본 코드·실제 출력과 대조한다. 나온 지적을 고치고 4를 다시 한다.
6. **결과 폴더를 바꾼다.**
   - `graph/head-context-<새 판>/`에 앞 판의 `README.md`·`USER.md`·`LLM.md`를 옮겨 판·커밋·노드와 연결 수·실행 수·검수 결과를 사람이 고친다. 수는 `python3 -I hc_graph.py sql "SELECT (SELECT count(*) FROM nodes),(SELECT count(*) FROM edges)"`로 센다.
   - 앞 판 폴더 `graph/head-context-<앞 판>/`은 지운다. git 기록에 남는다.
   - 이 묶음의 바뀐 파일(`docs/`, `meaning.json`, `runs/` 등)과 함께 같은 main에 넣은 뒤 태그를 단다.

## 알아 둘 것

- 유저 활동(`docs/activities.md`)은 0.9.5 때 처음 쓰는 사람처럼 실제로 써 본 기록으로 썼다. 판마다 다시 써 보지는 않고, 바뀐 것만 그 줄에 적는다.
- Codex·OpenCode·Antigravity 쪽 출력은 실제 앱 없이 훅·도구 서버·플러그인 훅 함수를 직접 돌려 받는다. Antigravity 실행(R159~)은 임시 HOME의 `.gemini/config/plugins/head-context`에 복사한 플러그인과 `PLUGIN_DATA`로 돈다. `--with-run`은 세 도구 서버의 serverInfo 판이 plugin.json 판과 다르면 멈춘다(R192).
- 기능 → 출력 부분은 출력설계서 절의 `내는 기능` 줄만 읽는다. 공통 영역 부분(CMN)에 이 줄이 없으면 그 부분을 공통 영역으로 둔 부분의 기능을 물려받는다. 추출기가 잡지 않는 바깥 접근(전역 `fetch`)은 `MANUAL_OUTSIDE`에 손으로 적는다.
- 처음부터 다른 제품의 그래프를 만들 때는 이 폴더를 복사하지 말고 `../02b-graph-workflow.md`의 차례를 따른다. 이 폴더의 규칙은 head-context 코드에 맞춘 것이다.
