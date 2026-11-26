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
| `head-context-0.9.19.sqlite` | 그래프 (노드 946, 연결 2,544) |
| `hc_graph.py` | 조회 스크립트 (Python 3 표준 라이브러리만, 읽기 전용) |

## 어떻게 만들었나

0.9.18 그래프를 만든 묶음([`../build/head-context/`](../build/head-context/))을 「새 판을 낼 때의 차례」대로 다시 돌렸습니다. 0.9.19(조사 스킬 `research`, 코어 지침의 Evidence·'Where HEAD sits'·'Use separate contexts for detailed work' 문장, start-job 2·4절 문장, 첫 실행의 방법론 애드온 단계)를 넣었습니다. 새 애드온 패키지 `packages/method`(head-method)는 이 그래프의 대상이 아닙니다. 이 그래프에는 head-context 쪽에서 애드온을 켜는 단계만 들어 있습니다.

- **코드**: head-agent-core commit `9dec306`(head-context 0.9.19)에서 스크립트로 처음부터 다시 뽑았습니다. 같은 commit이면 몇 번을 만들어도 결과가 같습니다(sqlite sha256 `b7516a91…`, 두 번 같음). 뽑는 규칙에서 둘을 고쳤습니다.
  - skill 기능의 근거 글을 스킬마다 그 파일(`skills/<이름>/SKILL.md`)로 적습니다. 전에는 모든 skill 기능에 start-job 설명이 붙었습니다.
  - `core/project.mjs` 안에서 파일 접근마다 닿는 곳(`.head/` 기록과 프로젝트 설정)을 줄 번호로 나눈 표(`purposes.json` fact_targets)를, 0.9.19에서 밀린 줄에 다시 맞추고 애드온 단계가 설정 폴더를 만드는 줄 하나를 더했습니다. 이제 고정한 줄에 바깥 접근 호출이 없으면 빌드가 problems로 알립니다(독립 검수 정보 1). 맞추지 않으면 그 줄에 없는 접근이 이어져 읽기 연결 넷(coreParts·refreshCore·setupTool·surveyReady → `.head/`)과 쓰기 연결 셋(mark → 프로젝트 설정, migrateImport·methodOn → `.head/`)이 잘못 생깁니다(빌드 problems로는 잡히지 않았고 앞 판과 비교해 찾았습니다).
- **유저가 받는 글**: 플러그인을 임시 폴더에 설치하고 tool과 hook을 돌려 받은 출력 314건에서 가져왔습니다. 0.9.18 때와 같은 299건 뒤에 0.9.19 애드온 단계를 보는 15건(R300~R314)을 더했습니다: Codex·Antigravity의 `method_on`은 설치 명령을 돌려주고 설정을 바꾸지 않음, Claude의 `method_on`은 프로젝트 설정에 한 줄을 더하고 다시 부르면 그대로 둠, 단계를 끝낸 프로젝트의 시작 훅에는 애드온 물음이 없음, 설정 파일이나 enabledPlugins가 JSON 객체가 아니면 고치지 않음, `never_ask step=method`. 앞 299건 중 254건이 글자까지 같습니다. 다른 45건 가운데 43건은 0.9.19 변경 때문입니다: 코어 지침 세 문단(그 문단을 싣는 코어 출력·setup 결과·Antigravity 시작·압축 뒤 출력), 초기설정 뒤 애드온을 묻는 이어서 안내(시작 훅·setup 결과), setup 도구 설명(도구 목록 4건), never_ask 오류 문구(R13), 시작 훅 session 글자 수(R124, 이어서 안내만큼 늘어남), 작업 세션 머리를 자르는 자리(R250, 이어서 안내 자리만큼 더 앞에서 자름). 나머지 2건은 할 일에 찍히는 실행 날짜입니다(R20·R107).
- **유저가 받는 글의 설명과 규칙**: 화면(출력 종류)이 하나 늘어 38입니다(SRV-04 조사 절차, research 스킬 본문). 화면요소는 133입니다(SRV-04#1~#4, STA-03#3 첫 실행 이어서 안내, TOL-12#7 애드온 물음, TOL-12#8 애드온 결과). 규칙이 넷 늘어 82입니다(pol.research-read-split, pol.research-trace, pol.method-ask, pol.method-on). pol.never-ask(method 단계), pol.read-first·pol.delegate-check(start-job 고친 문장), pol.no-host-tool-names(research도)를 고쳤습니다. 기능은 skill:research가 늘어 40입니다. 코어 지침 화면(STA-01)과 start-job 화면(SRV-03), setup 도구 설명(SRV-02#9), setup 오류 문구(ERR-01#6)의 글을 0.9.19 출력에 맞췄습니다.
- **유저가 하는 일**: 처음 붙이기(`ua.first-run`)에 초기설정 뒤 애드온 물음 분기를, 일 시작(`ua.start-job`)과 맡기기(`ua.delegate`)에 research 갈래를 글로 더했습니다. 출력과 코드로만 썼고 써 보지는 않았습니다.
- **검수**: 독립 검수 반영(재확인 전). 검수 1회(높음·중간 0, 낮음 7, 정보 4)에서 낮음 7건과 정보 1건(fact_targets 줄 검사)을 반영했습니다.
  - 결과 README의 실행 비교 수를 커밋된 실행 기록에 맞췄습니다(254건 같음, 45건 다름).
  - 맡기기(`ua.delegate`) 차례에 탐색을 여럿에게 따로 맡기는 분기를 두어 SRV-04#3에 이었습니다.
  - 이어서 안내도 Claude 프로그램 실행이 연결되지 않았으면 나오지 않는다는 것(R240·R241)을 pol.method-ask, pol.program-quiet-unconnected, STA-03 흐름에 적었습니다.
  - 코어 지침 화면(STA-01)에 research 정책 둘을, 초기설정 결과(TOL-12)에 화면 정책 절(pol.method-ask)과 처리 정책 pol.method-on 이름을 두었습니다.
  - pol.never-ask의 method 근거, TOL-12#8의 never_ask 문구, pol.no-host-tool-names 근거, pol.method-ask의 '다음 시작에 한 번', pol.read-first·ua.start-job의 '있으면', TOL-12 원문 줄을 고쳤습니다.

같은 방법으로 내 앱의 그래프를 만들려면 [`../build/`](../build/)를 봅니다. 그래프에 무엇을 담는지(정의)와 어떤 차례로 만드는지(순서)가 있습니다. 이 그래프를 만든 스크립트·문서·실행 기록은 [`../build/head-context/`](../build/head-context/)에 있고, 플러그인 새 판을 낼 때 그곳의 차례로 다시 만듭니다.

## 알아 둘 것

- 0.9.19 기준입니다. 그 뒤에 바뀐 코드는 들어 있지 않습니다. 독립 검수를 반영했고 재확인 전입니다.
- Codex·OpenCode·Antigravity 쪽은 실제 앱으로 써 보지 않았습니다. Codex·Antigravity 쪽 출력은 앱 없이 훅과 도구 서버를 직접 돌려 받았고, OpenCode 쪽은 플러그인의 훅 함수를 직접 불러 받았습니다. Antigravity 깨우기의 `started`는 ACP 쪽은 실행 기록에 없고, 터미널 쪽은 가짜 agy 프로세스로 본 것입니다(실제 터미널 agy 확인은 0.9.18 실제 확인). research 스킬 본문은 앱이 파일을 그대로 싣는 글이라 실행 기록이 없고, 그 화면요소는 스킬 파일 글로 이었습니다.
- 유저가 하는 일(처음 쓰는 사람 시험)은 0.9.5에서 한 것입니다.
- 그래프는 찾아가는 지도입니다. 최종 답은 그래프가 가리킨 코드와 글을 읽고 냅니다.
