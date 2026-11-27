# 화면설계서 — head-context 0.9.15

> 0.9.5 판(11-04)을 0.9.10(head-agent-core `7a5896c`) 실행 출력과 코드에 맞춰 바뀐 곳만 고쳤다(11-15). R번호는 0.9.10 실행 기록이다. R112까지는 0.9.5와 같은 차례의 실행이고, R113부터는 0.9.6~0.9.10에서 바뀐 동작을 보려고 더한 실행이고, R140부터는 독립 검수(11-15)가 짚은 출력을 보려고 더한 실행이다. `a3`·`C-3`으로 적은 것은 0.9.5에서 한 처음 온 유저 시험이고 다시 하지 않았다.
>
> 0.9.15(head-agent-core `e96f5aa`, 11-23): Antigravity 포장(0.9.11~0.9.15)을 더했다. Antigravity 출력은 R159~R220이다. 앞 R158까지는 0.9.10 실행과 같은 차례다(그래프 패치 2.8·5.6, A1~A26). Antigravity 훅 출력은 시스템 메시지(injectSteps)마다 나뉘어 들어가고, 원문에는 빈 줄 하나로 이어 적었다. agy 앱 자체는 띄우지 않았다.

화면이 없는 제품이라 정의서의 '화면이 없는 제품' 절대로 적용했다. 화면 하나 = 유저가 받는 출력 한 종류, 화면요소 = 그 출력 안의 한 부분. 그림 대신 실제로 받은 출력 원문을 `원문:`에 적었다(R번호 = [A-1 조작 기록](../runs/A-1-outputs.md)).
유저는 사람과 그 사람의 AI agent다. 대부분의 출력은 agent가 읽고, 사람은 agent가 전하는 말로 받는다.

화면요소 줄의 표시: `←` 뒤 기능은 그 화면요소에 결과를 내는 기능(기능→화면요소), `→` 뒤 기능은 그 화면요소를 읽고 agent가 부르는 기능(화면요소→기능).
`(코드)`가 붙은 화면요소는 실행에서 나오지 않아 코드에서만 읽은 것이다.

## CMN-01 작업 세션 머리

- 출력 종류: 공통 영역(시작 훅 출력과 도구 결과 앞머리에 붙음)
- 상태: 대화가 작업 세션에 연결됨
- 원문: R14, R48, R72, R121, R161(Antigravity 시작 훅), R250·R251(Claude 시작·압축 뒤, 머리를 자름), R254·R255(Codex 시작 — 자르지 않음, 압축 뒤 — 자름)
- 그리는 코드: `code:core/sessions.mjs#sessions.parts`, `code:core/recovery.mjs`

### 개요
대화가 어느 작업 세션의 어느 자리에서 일하는지 알려 주는 머리. 시작할 때와 불러올 때마다 맨 앞에 온다.

### 화면 흐름
agent는 여기서 이 일의 목적(context.md)과 지금 자리(메인 또는 작업 브랜치)를 읽고 그 자리에 기록한다.

### 화면요소
1. **작업 세션 이름** — `# 작업 세션: <이름>` 한 줄.
2. **context.md 전문** — 작업 세션의 목적·방향·범위. 상한(9,000자)을 넘으면 앞부분과 `(context.md 뒷부분 생략 — 전문:` 경로 한 줄. Claude 시작 훅은 시작·/clear·압축 때 첫 실행 안내 자리까지 더해 잰다(R250·R251). Codex 시작 훅은 자르지 않는다(R254·R255). 0.9.19까지는 압축 뒤 복원 블록(STA-07)이 이 출력 끝에 붙어 그 자리까지 쟀다. 0.9.20부터 복원 블록은 따로 나온다.
3. **이 대화의 작업 브랜치** — `이 대화의 작업 브랜치: <이름 | 없음(메인)>`. 둘러보기(TOL-08)에는 없다.
4. **작업 세션 폴더** — 이름(#1) 바로 아래 한 줄 `작업 세션 폴더: <절대 경로>`(0.9.6부터). 작업 파일을 둘 자리(`work/YYYY-MM/…`)를 찾지 않아도 된다. 둘러보기(TOL-08)에도 나온다.

### 화면 정책
- `pol.session-part-fits`

## CMN-02 작업 맥락

- 출력 종류: 공통 영역(시작 훅의 작업 맥락 출력, load·create·branch 결과, 둘러보기)
- 상태: 대화가 작업 세션에 연결됨
- 원문: R16, R25, R28, R49, R72, R122(시작 훅에서 줄인 것), R123(load — 줄이지 않은 것), R153·R154(Codex, 작업 브랜치), R155(OpenCode), R161·R162(Antigravity 시작 훅), R168(Antigravity 압축 뒤)
- 그리는 코드: `code:core/sessions.mjs#sessions.parts`, `code:core/recovery.mjs`, `code:core/map-view.mjs`

### 개요
하던 일을 되찾게 하는 압축 지도. 열린 일, 할 일, 최근 흐름, 지금 작업 브랜치의 최근 기록을 담는다.

### 화면 흐름
agent는 열린 작업 브랜치와 '다음'을 보고 이어 갈 일을 고른다. 더 볼 것은 read(TOL-06~TOL-10)로 내려간다.

### 화면요소
1. **열린 작업 브랜치** — `## 열린 작업 브랜치 (n)`, 줄마다 이름 · 마지막 저장 시각 · 다음. 이 대화가 있는 것은 '(이 대화)'. 열린 것이 없으면 절이 없다. 시작 훅에서 작업 맥락이 9,000자를 넘어 마지막 단계까지 줄이면 앞의 몇 개만 보이고 나머지 수를 적는다(이 대화의 것은 늘 보인다, 코드). 열린 작업 브랜치 36개·할 일 15개인 실행(R122)에서는 줄이기 6단계(최근 기록 1개, 본문 500자, 지도 15줄)에서 맞아, 열린 작업 브랜치 36줄이 load(R123)와 같은 길이로 모두 남았다. 줄을 짧게 하거나 열린 작업 브랜치 수를 줄이는 뒤 단계는 실행으로 본 적이 없다(코드). → `tool:branch`
2. **할 일** — `## 할 일 (열린 n개[, 기한 임박 k개])`, 기한 임박 전부(3개를 넘을 수 있음)와 남은 자리(합쳐 3줄까지). 기한 있는 것은 기한 순, 없는 것은 최신 순. 한 항목 120자까지. 더 있으면 `(전체: todo list)`. 열린 것이 없으면 절이 없다. → `tool:todo`
3. **흐름 지도** — `## 흐름 (최신이 위)`, git 그래프 모양, 저장 하나가 한 줄(짧은 ID 5자, 겹치면 더 길어짐, MM-DD HH:MM, 요약), 줄기 끝 `(main)`·`(이름)`·`(HEAD -> 이름)`, 합침 `Merge branch '이름'`, 중단 `Abandon branch '이름': 이유`. 기본 기록 30개(연결선 줄은 따로, load의 map_limit로 바꿈). 저장이 없는 새 작업 브랜치는 줄기가 생기지 않고 열린 작업 브랜치(#1)에만 보인다(R16). 메인 기록의 본문·다음은 작업 맥락에 나오지 않는다. → `tool:read`
4. **이 작업 브랜치의 최근 기록** — `## 이 작업 브랜치의 최근 기록: <이름>`, 최근 본문 3개와 마지막 다음. 작업 브랜치에 있을 때만. 기록이 없으면 `(아직 기록 없음)`.

### 화면 정책
- `pol.hook-budget`
- `pol.todo-order`
- `pol.map-hides-index-dup`

## CMN-03 바로잡은 기록 알림

- 출력 종류: 공통 영역(훅 출력·도구 결과 끝에 붙음)
- 상태: 플러그인 자기 기록 파일이 깨져 옮겨 둔 직후
- 원문: R63(Claude 시작 훅), R157(도구 결과 끝), R158(Codex 시작 훅)
- 그리는 코드: `code:core/storage.mjs#takeNotices`

### 개요
깨진 기록을 옮겨 두고 일을 계속했다는 것을 agent에게 한 번 알린다.

### 화면요소
1. **옮긴 파일 한 줄** — `head-context: 읽을 수 없는 기록 파일을 옮겨 두고 없는 것으로 처리했습니다: <파일>.broken-<시각> (<JSON 오류>)`. 대화 연결 파일이 깨졌으면 그 대화는 연결 없음으로 시작한다(R63). 도구 답(모든 도구, serve의 withNotices)과 시작·입력 훅 출력 끝에 붙는다. 문구: `읽을 수 없는 기록 파일을 옮겨 두고 없는 것으로 처리했습니다` ← `tool:list` ← `tool:load` ← `tool:create` ← `tool:save` ← `tool:branch` ← `tool:read` ← `tool:todo` ← `tool:conversations` ← `tool:setup` ← `tool:send` ← `hook:claude:SessionStart:session` ← `hook:claude:SessionStart:context` ← `hook:codex:SessionStart:session` ← `hook:codex:SessionStart:context` ← `hook:codex:UserPromptSubmit:inbox` ← `hook:antigravity:SessionStart` ← `hook:antigravity:PreInvocation` ← `tool:send@antigravity`

### 화면 정책
- `pol.broken-record-notice`

## STA-01 코어 지침

- 출력 종류: 시작 훅이 넣는 글
- 상태: 초기설정을 마친 프로젝트에서 시작·/clear·압축 Antigravity: 시작과 압축 뒤 첫 단계(사람 대화만 — 서브에이전트에는 나오지 않고 AGT-01로 바뀐다)
- 원문: R46, R47(Claude 두 출력 — 0.9.10 코어는 한 출력에 들어가 R47은 빈 출력), R52(압축), R56(재개), R65(Codex 한 출력), R133(node:sqlite 없는 Node에서도 들어감), R160(Antigravity 시작), R168(Antigravity 압축 뒤 복원), R187(Antigravity, node:sqlite 없는 Node)
- 내는 기능: `hook:claude:SessionStart:core`, `hook:codex:SessionStart:core`, `hook:antigravity:SessionStart`, `hook:antigravity:PreInvocation`
- 그리는 코드: `code:core/project.mjs#coreParts`

### 개요
agent가 일하는 방식(HEAD Core 지침)을 매 시작마다 넣는다. 본문은 패키지의 `instructions/HEAD_CORE.md`이고 영어다. 0.9.19에서 세 문단이 바뀌었다: Evidence 문단에 남이 읽고 요약한 발견은 되짚을 수 있는 만큼만 근거라는 두 문장, 'Where HEAD sits'는 다른 컨텍스트가 하는 일을 high-resolution production and review로, 'Use separate contexts for detailed work'는 맡기는 일을 production and review로 좁히고 판단의 근거 읽기는 HEAD가 직접(양이 많을 때 빼고), 열린 탐색은 서로 모르는 여러 컨텍스트로, 방법은 research 스킬(SRV-04)이라고 적는다(R46·R65·R160).

### 화면 흐름
agent는 이 지침대로 일한다. 0.9.10 코어 지침(HEAD Core 1/1)은 HEAD가 일하는 원칙(How context works, How HEAD works)만 담고 start-job을 부르라는 줄이 없다. 그 줄은 서버 안내문(SRV-01#1)에만 있다. 0.9.19 코어는 조사할 때 research 스킬(SRV-04)을 가리킨다.

### 화면요소
1. **앞부분** — # HEAD Core로 시작. Claude에서는 출력 상한(9,000자)에 맞춰 나눈 것의 첫째이고 끝에 몇째인지 꼬리표가 붙는다. 0.9.10 코어(약 6,900자)는 한 출력에 들어가 꼬리표가 `(HEAD Core 1/1)`이다. 0.9.19 코어(약 7,500자)도 한 출력이다(R46 7,509자, R47 빈 출력). ← `hook:claude:SessionStart:core` 문구: `(HEAD Core 1/1)`
2. **뒷부분** — 코어가 상한을 넘을 때만 `# HEAD Core (계속 <n>/<n>)`로 시작하는 둘째 출력. 0.9.10에서는 둘째 출력이 비어 있다(R47, 코드). ← `hook:claude:SessionStart:core`
3. **Codex·Antigravity 한 출력** — Codex는 출력 상한을 꺼서 지침 전체가 꼬리표 없이 한 출력. Antigravity도 지침 전체가 꼬리표 없이 시스템 메시지 하나로 들어간다(0.9.11~, R160·R168). 0.9.10에서는 Claude 출력(#1)도 본문 전체라 글이 겹치지만 Claude 쪽은 #1이고, setup 결과 안의 본문은 TOL-12#3이다(빌드가 이 두 연결을 이름으로 뺀다). ← `hook:codex:SessionStart:core` 문구: `HEAD owns the whole outcome…Prohibitions belong in review criteria, where they are checked against a finished result.` ← `hook:antigravity:SessionStart` ← `hook:antigravity:PreInvocation`

### 화면 정책
- `pol.core-after-setup`
- `pol.quiet-on-resume`
- `pol.research-read-split`
- `pol.research-trace`

## STA-02 시작 때 작업 세션

- 출력 종류: 시작 훅이 넣는 글
- 상태: 연결된 대화의 시작·/clear·압축 Antigravity: 시작(시작 파일·HEAD_CONTEXT_SESSION으로 연결됐을 때)과 압축 뒤 첫 단계, 사람 대화만
- 원문: R48, R53, R121, R161·R162(Antigravity 시작 파일로 연결), R168(Antigravity 압축 뒤)
- 공통 영역: CMN-01, CMN-03
- 내는 기능: `hook:claude:SessionStart:session`, `hook:codex:SessionStart:session`, `hook:antigravity:SessionStart`, `hook:antigravity:PreInvocation`
- 그리는 코드: `code:core/sessions.mjs#sessions.parts`

### 개요
새로 열리거나 지워지거나 압축된 대화가 자기 자리를 되찾는 첫 출력. 반드시 들어와야 하는 부분이라 따로 낸다.

### 화면요소
1. **작업 세션 머리** — CMN-01 그대로. ← `hook:claude:SessionStart:session` ← `hook:codex:SessionStart:session` ← `hook:antigravity:SessionStart` ← `hook:antigravity:PreInvocation`

node:sqlite를 쓸 수 없는 Node에서는 이 출력 대신 ERR-05의 이유 한 줄이 들어간다(R134, R138).

### 화면 정책
- `pol.quiet-on-resume`
- `pol.old-node-says`

## STA-03 연결 안 됨과 첫 실행 안내

- 출력 종류: 시작 훅이 넣는 글
- 상태: 대화가 작업 세션에 연결되지 않음(첫 실행 전이면 안내가 붙음). 0.9.19부터 초기설정을 마쳤고 방법론 애드온 단계가 기록되지 않았으면 연결 여부와 상관없이 이어서 안내가 붙는다(연결된 대화는 STA-02 뒤) Antigravity: 시작, 또는 압축 뒤 복원 때 연결 없음(첫 실행 안내는 시작 때만, 서브에이전트에는 나오지 않음)
- 원문: R3(첫 실행 전), R60(/clear 뒤 이어받을 대화를 못 찾음), R67(Codex, 초기설정 뒤), R159(Antigravity 첫 실행 전), R160(Antigravity 연결 안 됨), R240~R244(0.9.17 Claude 프로그램 실행 sdk-cli — 빈 출력, HEAD_CONTEXT_PERSON=1이면 연결 안 됨, 초기설정 전 사람 대화와 대조), R48·R60·R63·R67·R108·R160(0.9.19 이어서 안내 — 애드온 물음), R307·R308(0.9.19 애드온 단계를 끝낸 뒤 — 안내 없음)
- 공통 영역: CMN-03
- 내는 기능: `hook:claude:SessionStart:session`, `hook:codex:SessionStart:session`, `hook:antigravity:SessionStart`, `hook:antigravity:PreInvocation`
- 그리는 코드: `code:core/project.mjs#guide`

### 개요
아직 자리가 없는 대화에 그 사실을 알리고, 첫 실행이면 초기설정을 묻게 한다. 0.9.19부터 초기설정이 끝난 프로젝트에서 남은 첫 실행 단계(방법론 애드온)가 있으면 그것을 묻게 한다.

### 화면 흐름
첫 실행 전: agent는 사람의 첫 입력에 답하기 전에 "초기설정 해도 될까요?"를 묻고 답에 따라 setup을 부른 뒤 원래 이야기로 돌아간다. 초기설정 뒤 애드온 단계가 남았으면(0.9.19): 첫 입력에 답하기 전에 애드온을 켤지 묻고 예면 setup(action=method_on), 아니오면 다시 묻지 않을지 물어 예일 때만 never_ask(step=method)를 부른다. 어느 앱에서 기록했든 같은 프로젝트에서는 다시 묻지 않는다(R301 Codex 기록 뒤 R307 Claude·R308 Codex 시작에 안내 없음). 연결 안 됨만 있으면: 첫 말에 답하면서 남길 작업 세션을 제안한다(0.9.17, SRV-01#2·SRV-03#1). Claude 프로그램 실행(entrypoint sdk-*, HEAD_CONTEXT_PERSON=1 아님)은 연결이 없어도 연결 안 됨과 첫 실행 안내(0.9.19부터 이어서 안내 #3까지)를 받지 않는다(0.9.17, R240·R241).

### 화면요소
1. **연결 안 됨 한 줄** — `이 대화는 아직 작업 세션에 연결되지 않았습니다.` ← `hook:claude:SessionStart:session` ← `hook:codex:SessionStart:session` ← `hook:antigravity:SessionStart` ← `hook:antigravity:PreInvocation` → `tool:list`
2. **첫 실행 안내** — `# 프로젝트 첫 실행 (head-context)`: 초기설정이 하는 일(코어 지침 켜기, `.claude/settings.json`에 기본 포크 env·마켓·플러그인 켜기), 예/아니오일 때 부를 것, "파일은 직접 쓰지 말고 이 도구만 쓰세요". 초기설정 전이고 시작·/clear일 때만. → `tool:setup` Antigravity 문구는 "나중에 같은 프로젝트를 Claude Code로 열 때 쓰도록 … Antigravity 설정은 바꾸지 않습니다"다(R159). 문구: `Antigravity 설정은 바꾸지 않습니다` ← `hook:antigravity:SessionStart`
3. **첫 실행 이어서 안내** — `# 프로젝트 첫 실행 이어서 (head-context)`: 사용자의 첫 입력에 답하기 전에 "방법론 애드온(head-method)도 켤까요? …"를 묻게 하고, 예면 setup(action=method_on), 아니오면 "다시는 묻지 않을까요?"를 물어 예일 때만 setup(action=never_ask, step=method), "파일은 직접 쓰지 말고 이 도구만 쓰세요". 초기설정을 마쳤고 first_run.method가 없을 때 시작·/clear마다(0.9.19, Claude·Codex·Antigravity 같은 글). 연결된 대화에서는 작업 세션 머리 뒤에 붙는다(R48). Claude 시작 훅은 이 안내 자리까지 더해 상한을 재므로 긴 작업 세션 머리가 그만큼 더 잘린다(R250). → `tool:setup` 문구: `# 프로젝트 첫 실행 이어서 (head-context)` ← `hook:claude:SessionStart:session` ← `hook:codex:SessionStart:session` ← `hook:antigravity:SessionStart`

관찰: 0.9.19 패키지에도(0.9.5와 같이) 조사 절차 파일(`instructions/survey.md`)이 없어 프로젝트 조사 물음은 나오지 않는다(core/project.mjs surveyReady·pendingQuestions). 0.9.18까지의 따로 된 조사 안내 머리(`# 프로젝트 조사 (head-context)`)는 0.9.19에서 없어졌고, 조사 물음도 있으면 애드온 물음 뒤에 같은 이어서 안내(#3)로 붙는다. 그래서 조사 물음은 화면요소로 두지 않았다.

### 화면 정책
- `pol.first-run-guide`
- `pol.never-ask`
- `pol.program-quiet-unconnected`
- `pol.method-ask`

## STA-04 시작 때 작업 맥락

- 출력 종류: 시작 훅이 넣는 글
- 상태: 연결된 대화의 시작·/clear·압축 Antigravity: 시작과 압축 뒤 첫 단계, 사람 대화만
- 원문: R49, R54, R122(9,000자를 넘어 줄임), R154(Codex, 작업 브랜치에 연결), R135·R139(node:sqlite 없는 Node — 빈 출력), R161·R162(Antigravity 시작 파일로 연결), R168(Antigravity 압축 뒤)
- 공통 영역: CMN-02, CMN-03
- 내는 기능: `hook:claude:SessionStart:context`, `hook:codex:SessionStart:context`, `hook:antigravity:SessionStart`, `hook:antigravity:PreInvocation`
- 그리는 코드: `code:core/sessions.mjs#sessions.parts`

### 개요
작업 맥락(CMN-02)을 시작 훅 출력 하나의 상한에 맞춰 넣는다.

### 화면요소
1. **작업 맥락** — CMN-02 그대로, 9,000자를 넘으면 줄인 것. 끝을 자르지 않는다(0.9.6부터). load로는 10,639자였던 같은 자리가 시작 훅에서는 7,338자로 들어왔다. 줄이기 6단계(최근 기록 1개, 본문 500자, 지도 30→15줄)에서 맞았고, 열린 작업 브랜치 36줄과 마지막 다음이 남았다(R122~R124). ← `hook:claude:SessionStart:context` ← `hook:codex:SessionStart:context` ← `hook:antigravity:SessionStart` ← `hook:antigravity:PreInvocation`

### 화면 정책
- `pol.hook-budget`
- `pol.quiet-on-resume`

## STA-05 최근 대화

- 출력 종류: 시작 훅(Claude)·매 단계 훅(Antigravity, 압축 뒤 처음 한 번)이 넣는 글
- 상태: 압축·/clear 직후 Antigravity: 대화 기록에 새 CHECKPOINT가 보인 첫 단계(사람 대화만). 마지막 CHECKPOINT 앞 구간만 쓰고 `/` 명령 입력은 뺀다
- 원문: R55, R136(node:sqlite 없는 Node에서도 들어감), R168(Antigravity), R188(Antigravity, node:sqlite 없는 Node)
- 내는 기능: `hook:claude:SessionStart:recent`, `hook:antigravity:PreInvocation`
- 그리는 코드: `code:core/recent.mjs#renderRecent`(0.9.15부터 Claude·Antigravity가 같이 쓴다)

### 개요
호스트 요약 대신 직전 주고받기를 원문 그대로 돌려준다.

### 화면요소
1. **머리** — `# 최근 대화 (직전 주고받기 n번, 원문)`. ← `hook:claude:SessionStart:recent` ← `hook:antigravity:PreInvocation`
2. **주고받기** — 최대 5번. 번호마다 `## n · 사용자 MM-DD HH:MM`(사람이 친 말, 질문 창 답은 tool 결과에서 뽑음)과 `## n · 답`(모델 답 중 보이는 글). 도구 호출·결과·생각·훅 알림은 뺀다. 문구: `## n · 사용자` ← `hook:claude:SessionStart:recent` ← `hook:antigravity:PreInvocation`
3. **넘칠 때 기록 파일 경로** — 오래된 주고받기부터 빼고, 한 번만 남아도 길면 본문을 자르고, 대화 기록 파일 경로를 적는다(코드). 문구: `번은 상한 때문에 뺐습니다. 대화 기록 파일:` ← `hook:claude:SessionStart:recent` ← `hook:antigravity:PreInvocation`

### 화면 정책
- `pol.recent-after-compact-clear`

## STA-06 OpenCode 요청마다 넣는 글

- 출력 종류: OpenCode system prompt에 더하는 글
- 상태: OpenCode 대화의 모든 요청. 하위 세션에도 서버 안내문 공용 부분은 들어가고, 작업 맥락만 빠진다
- 원문: R155(연결된 대화), R156(하위 세션) — OpenCode 앱 없이 플러그인의 훅 함수를 node로 직접 불렀다(가짜 client가 대화 정보를 돌려줌)
- 공통 영역: CMN-01, CMN-02
- 내는 기능: `hook:opencode:experimental.chat.system.transform`
- 그리는 코드: `code:hosts/opencode/plugin.mjs#server.experimental.chat.system.transform`

### 개요
OpenCode에서는 시작 훅 대신 요청마다 서버 안내문 공용 부분과 작업 맥락을 넣는다.

### 화면요소
1. **서버 안내문 공용 부분** — SRV-01의 #1~#7(앱별 부분 없음). 하위 세션에도 들어간다(R156). 글이 SRV-01과 같아 문구로 잇지 않는다 — 실행 R155가 그 기능을 SRV-01#1~#7에 잇는다. ← `hook:opencode:experimental.chat.system.transform`
2. **작업 맥락** — 연결됐으면 CMN-01·CMN-02(R155). 하위 세션(부모가 있고 연결이 없는 세션)에는 넣지 않는다(R156). 글이 CMN-01·CMN-02와 같아 문구로 잇지 않는다 — 실행 R155가 그 기능을 CMN-01·CMN-02 화면요소에 잇는다. ← `hook:opencode:experimental.chat.system.transform`

## STA-07 컴팩트·/clear 뒤 먼저 할 것과 이 대화가 남긴 기록

- 출력 종류: 시작 훅이 넣는 글(Claude·Codex는 따로 나오는 recovery 출력, Antigravity는 시스템 메시지 한 덩어리). 0.9.19까지는 session 출력의 끝이었다
- 상태: Claude·Codex 사람 대화의 압축 뒤 시작(source compact), Claude 사람 대화의 /clear 뒤 시작, Antigravity 사람 대화의 새 CHECKPOINT 뒤 첫 단계와 터미널 /clear 뒤 첫 시작. 하위 에이전트(Codex agent_id)·Claude 프로그램 실행(sdk-*)·재개·처음 시작에는 없다
- 원문: R326(Claude 작업 브랜치 map-job), R327(Claude 메인), R329(Claude /clear), R331(/clear 뒤 압축 — 사슬), R332(sdk-cli — 없음), R336(Codex 메인), R337(Codex 하위 에이전트 — 없음), R338(Codex startup — 없음), R343(Antigravity 압축), R344(Antigravity /clear)
- 공통 영역: 없음
- 내는 기능: `hook:claude:SessionStart:recovery`, `hook:codex:SessionStart:recovery`, `hook:antigravity:PreInvocation`, `hook:antigravity:SessionStart`
- 그리는 코드: `code:core/conversation-map.mjs#recoveryBlock`, `code:core/conversation-map.mjs#renderConversationMap`

### 개요
압축이나 /clear 뒤 하던 일을 잇기 전에, 이 대화가 처음 무엇을 하려 했는지와 지금 할 일을 먼저 되찾게 한다(0.9.17). 0.9.20부터 이 대화(와 이어짐·/clear로 이어진 앞 대화)가 저장한 기록만 모은 지도를 함께 보여, 여러 대화가 함께 쓰는 메인에서도 남의 기록을 자기 일로 잇지 않게 한다. 모델은 도구를 부르지 않고 훅이 넣는다.

### 화면 흐름
agent는 이 블록대로 작업 브랜치를 시작한 목적을 `read entry`로 읽고, 마지막 기록의 다음이 사람이 정한 일인지 최근 대화에서 확인한 뒤 잇는다. 메인이면 할 일을 지도와 최근 대화에서 찾는다. 지도 줄의 짧은 ID로 `read entry`를 부르면 그 기록의 본문을 읽는다.

### 화면요소
1. **머리** — `## 컴팩트 뒤 먼저 할 것`(압축) 또는 `## /clear 뒤 먼저 할 것`(/clear)과 그 아래 한 줄. 압축은 복원을 먼저 하라는 줄, /clear는 '사용자가 하던 일을 이으라고 하면 복원부터, 새 일을 말하면 그 일'이다. ← `hook:claude:SessionStart:recovery` ← `hook:codex:SessionStart:recovery` ← `hook:antigravity:PreInvocation` ← `hook:antigravity:SessionStart` 문구: `하던 일을 잇기 전에 복원부터 한다`
2. **최초 목적** — 작업 브랜치면 read entry와 첫 기록 짧은 ID, 첫 기록 요약. 메인이면 '메인은 여러 대화가 함께 쓰므로, 메인의 다른 기록은 다른 대화 것일 수 있다'와 할 일을 이 대화가 남긴 기록과 최근 대화에서 찾으라는 말(0.9.20, read recent 권유는 뺌). 연결이 없으면 최근 대화에서 사람이 정한 일. ← `hook:claude:SessionStart:recovery` ← `hook:codex:SessionStart:recovery` → `tool:read` 문구: `로 이 작업 브랜치를 시작한 목적(문제·목표·조건)을 읽는다`
3. **지금 할 일** — 경우마다 다르다. 작업 브랜치: 마지막 기록의 다음과 '사람이 정한 일인지 최근 대화에서 확인한 뒤 잇는다'(다음이 없으면 최근 대화에서 사람이 마지막으로 정한 일). 메인: '위에서 찾은 일이다. 사람이 정하지 않은 계획은 잇기 전에 확인한다'(R327). 연결 없음: 이 줄이 따로 없고 #2 자리 한 줄('최초 목적과 지금 할 일')에 합쳐 나온다. ← `hook:claude:SessionStart:recovery` ← `hook:codex:SessionStart:recovery` 문구: `이 다음은 기록을 남긴 대화가 적은 계획이다`
4. **기록 지도 머리** — `## 이 대화가 남긴 기록 (최신이 위)`와 이 대화·앞 대화가 저장한 기록이라는 설명, 본문은 read entry로 읽는다는 줄(0.9.20). 기록이 없으면 `(이 대화가 저장한 기록은 아직 없다)`. ← `hook:claude:SessionStart:recovery` ← `hook:codex:SessionStart:recovery` ← `hook:antigravity:PreInvocation` ← `hook:antigravity:SessionStart` → `tool:read` 문구: `이 대화와 /clear·이어짐으로 이어진 앞 대화가 저장한 기록이다`
5. **기록 지도 줄** — `- <짧은 ID> <MM-DD HH:MM> [<다른 작업 세션>] <작업 브랜치 또는 메인>( (끝남)·(중단)) · <요약>`. 최신 15줄, 요약 120자, 더 있으면 `(그 앞 n개 — 흐름 지도에 있다)`. 짧은 ID는 흐름 지도와 같다. 대화 줄로 찾은 기록과, 대화 기록 파일의 save 호출로 맞춘 옛 기록(R326의 A0, R343의 G0)이 함께 시각 순으로 나온다. ← `hook:claude:SessionStart:recovery` ← `hook:codex:SessionStart:recovery` ← `hook:antigravity:PreInvocation` ← `hook:antigravity:SessionStart` 문구: `— 흐름 지도에 있다`

### 화면 정책
- `pol.compact-recovery`

## SRV-01 서버 안내문

- 출력 종류: 도구 서버 안내문(MCP initialize의 instructions). Codex는 시작 훅으로 넣는다. Antigravity는 도구 서버 안내문과 함께 시작 훅으로도 넣는다
- 상태: 도구 서버가 뜰 때
- 원문: R6(Claude), R66(Codex 시작 훅), R70(Codex 서버), R159(Antigravity 시작 훅), R170(Antigravity 서버)
- 내는 기능: `mcp:initialize`, `hook:codex:SessionStart:instructions`, `hook:antigravity:SessionStart`
- 그리는 코드: `code:core/mcp.mjs#instructionsFor`

### 개요
agent에게 이 플러그인의 개념(작업 세션, 작업 브랜치, 저장, 읽기, 할 일, 다른 대화)과 언제 무엇을 부르는지를 한 번 알려 준다.

### 화면 흐름
agent는 일을 시작할 때 start-job을 부른다. 시작 때 연결 안 됨 안내를 받은 대화는 첫 말을 받을 때도 부르고, 첫 말에 답하면서 남길 작업 세션을 제안한다(0.9.17). 지금 하는 일이나 지난 일을 찾을 때는 read부터 쓰고, 착수할 때 이어서 할 일이면 작업 브랜치를 열고, 결과가 생기면 저장한다.

### 화면요소
1. **첫 줄** — `일을 시작할 때는 먼저 start-job 스킬을 불러옵니다.` 0.9.17부터 같은 줄에 연결 안 됨 안내를 받은 대화는 첫 말을 받을 때도 부른다는 말이 붙는다. 문구: `첫 말을 받을 때도 불러옵니다` ← `mcp:initialize` → `skill:start-job` ← `hook:antigravity:SessionStart`
2. **작업 세션** — 무엇(다음 대화에서 이어 가거나 계속 쓰일 일의 묶음, 0.9.17)·언제. 시작 때 연결 안 됨 안내를 받은 대화는 첫 말에 답하면서 남길 작업 세션을 제안한다(목록에 맞는 것이 있으면 그 이름, 없으면 새 이름). 이어 갈 일인지는 사람이 정하고, 받으면 불러오거나 만든다. context.md는 사람이 동의한 뒤에 고친다. → `tool:list` → `tool:load` → `tool:create` 문구: `다음 대화에서 이어 가거나 계속 쓰일 일의 묶음입니다`
3. **작업 브랜치** — 무엇·언제. 문제·목표·조건을 맞춘 일에 착수할 때 이어서 할 일이면 열고, 짧게 끝날 일이면 열지 않아도 된다(0.9.17). 이어 갈 것이 있으면 골라 잇는다. → `tool:branch` 문구: `작업 세션 안에서 열리고 닫히는 한 번의 일입니다`
4. **저장** — 무엇(다음에 이 일을 이어 갈 대화가 읽는 기록, 무엇을 남길지는 그 대화에 필요할 것으로 정함)·언제, 다음/정리, 참조파일(기록이 기대는 파일은 save의 files에, 경로는 `~/` 전체 경로로), 작업 파일 자리(작업 맥락 맨 위 '작업 세션 폴더' 줄의 `work/YYYY-MM/YYYY-MM-DD-<이름>.md`, 작업 브랜치 이름 폴더는 기록 자리라 그 밖에). → `tool:save` 문구: `작업 브랜치에 남기는 기록 한 번입니다`
5. **읽기** — 무엇(연결을 바꾸지 않고 기록을 읽음)·언제: 지금 하는 일이나 지난 일을 찾을 때는 무조건 read부터, 물음의 낱말로 read find, 없으면 read recent, 파일·코드는 그다음(0.9.17). → `tool:read` 문구: `작업 세션의 기록을 연결을 바꾸지 않고 읽습니다`
6. **할 일** — 무엇·언제(todo add/done). → `tool:todo` 문구: `작업 세션에 남는 나중에 할 일입니다`
7. **다른 대화** — 먼저 목록(conversations)을 보고, 목록의 보낼 곳을 이 앱의 보내기 도구에 그대로 준다. → `tool:conversations` 문구: `이 프로젝트에서 살아 있는 대화와`
8. **이 앱에서 부르는 도구** — Claude: SendMessage(to), Agent 도구 fork / 다른 subagent_type. Codex: 이 플러그인의 send(threadId, prompt), spawn_agent fork_turns "all"/"none". Antigravity: 기록 도구는 플러그인 MCP 서버 head-context_session의 도구를 call_mcp_tool로, 보내기는 이 플러그인의 send, delivery는 started·queued(0.9.11~). started는 살아 있는 ACP 대화나 깨우기 등록을 마친 터미널 대화(0.9.18), 등록 안 된 터미널 대화와 데스크톱 앱은 queued. OpenCode에는 없다. → `tool:send` → `tool:send@antigravity` 문구: `이 앱(<앱>)에서 부르는 도구`

### 화면 정책
- `pol.no-host-tool-names`
- `pol.ask-before-load`
- `pol.save-when-result`
- `pol.start-job-agree`
- `pol.read-first`
- `pol.first-word-session`

## SRV-02 도구 목록

- 출력 종류: 도구 서버의 도구 설명(MCP tools/list)
- 상태: 도구 서버가 뜰 때
- 원문: R7(Claude), R71(Codex), R171(Antigravity)
- 내는 기능: `mcp:tools/list`
- 그리는 코드: `code:core/mcp.mjs#DEFINITIONS`

### 개요
도구마다 무엇을 하고 언제 부르는지, 인자가 무엇인지 적은 설명. agent가 도구를 고를 때 읽는다. conversation_id·agent_id는 "호스트 연결 전용"이라고 적혀 있다.

### 화면요소
1. **list** — 작업 세션 목록. ← `mcp:tools/list` → `tool:list` 문구: `작업 세션 목록을 읽습니다`
2. **load** — 불러와 연결, branch로 잇기, branch=main은 메인. → `tool:load` 문구: `작업 세션을 불러와 이 대화를 연결하고 작업 맥락을 돌려줍니다`
3. **create** — context 필수, context.md 첫 줄·첫 문장 쓰는 법. → `tool:create` 문구: `새 작업 세션을 만들고 이 대화를 그 메인에 연결합니다`
4. **save** — 요약(흐름 지도에는 이 줄만)·본문·다음, files(참조파일, `~/` 전체 경로 목록), 본문에 파일을 적을 때의 꼴(마크다운 링크나 백틱 경로여야 찾기·파일 나무에 나옴), 작업 맥락에는 최근 기록 3개만 본문까지 나온다는 것, 다음 없이 저장하면 recap 필수·작업 브랜치 닫힘. 0.9.5에서 빠졌던 파일 꼴 안내는 0.9.6에 들어갔다. 인자에 files가 더해졌다(0.9.7). → `tool:save` 문구: `이 대화가 일하는 작업 브랜치(없으면 메인)에 기록 하나를 남깁니다`
5. **branch** — create/attach/abandon. → `tool:branch` 문구: `작업 브랜치 다루기`
6. **read** — overview/map/recent/entry/find/files. → `tool:read` 문구: `연결을 바꾸지 않고 기록을 읽습니다`
7. **todo** — add/list/done, 기한은 실제 날짜로. → `tool:todo` 문구: `작업 세션의 할 일(todo.md)`
8. **conversations** — 받을 대화 고르는 법 세 단계. 0.9.15부터 "Claude Code·Codex·Antigravity 대화가 한 목록에 함께 나옵니다"(0.9.14까지는 Claude Code와 Codex만 적혀 있었다). → `tool:conversations` 문구: `다른 대화에 말을 전하기 전에 받을 대화를 고르는 목록입니다`
9. **setup** — 동의했을 때만, 하는 일, never_ask·survey_done. 0.9.19부터 method_on(방법론 애드온 켜기: Claude Code는 프로젝트 설정 한 줄, Codex·Antigravity는 설치 명령을 돌려줌)과 never_ask의 step=method가 더해졌다(R7·R71·R130·R171). → `tool:setup` 문구: `프로젝트 첫 실행의 유일한 쓰기 도구`
10. **send** — Codex 도구 서버에만. 받는 쪽마다 delivery 값. 0.9.11부터 Antigravity 대화로도 간다. 0.9.18부터 Antigravity는 살아 있는 ACP 대화와 깨우기 등록을 마친 터미널 대화를 바로 깨우고, 등록 안 된 터미널·화면에서 떠난 대화·데스크톱 앱·깨우기 실패는 다음 입력 때 받는다. → `tool:send` 문구: `다른 대화에 메시지를 보냅니다`
11. **send(Antigravity)** — Antigravity 도구 서버에만. threadId는 conversations의 보낼 곳 그대로, delivery는 started(살아 있는 ACP 대화나 깨우기 등록을 마친 터미널 대화, 0.9.18)·queued(등록 안 된 터미널 대화·화면에서 떠난 대화·데스크톱 앱·깨우기 실패)(R171). → `tool:send@antigravity` 문구: `started는 처리가 끝났다는 확인이 아닙니다`

### 화면 정책
- `pol.no-host-tool-names`
- `pol.pick-one-conversation`

## SRV-03 일 시작 절차

- 출력 종류: skill 본문(start-job). agent가 skill을 부르면 들어오는 글
- 상태: agent가 일을 시작하기 전에 skill을 부름
- 원문: a3 ua.start-job·ua.record·ua.pick-session의 skill 호출 결과(`# 일 시작하기`로 시작)
- 내는 기능: `skill:start-job`
- 그리는 코드: `code:skills/start-job/SKILL.md`

### 개요
일을 받으면 만들기 전에 거칠 차례를 agent에게 준다. 코드가 검사하지 않고 글로만 지킨다.

### 화면 흐름
agent는 이 차례대로 문제를 파악하고, 기존 기록을 read로 먼저 찾고, 사람과 문제·목표·조건을 맞춘 뒤 작업 세션·작업 브랜치와 진행 방식을 정한다. 연결 안 된 대화는 첫 말에 답하면서 남길 작업 세션을 제안한다(0.9.17). 기존 자료를 찾을 때와 판단에 쓸 사실을 읽을 때는 research 스킬(SRV-04)로 간다(0.9.19).

### 화면요소
1. **연결되지 않은 대화의 첫 말** — 시작 때 연결 안 됨 안내를 받았으면 첫 말에 답하면서 남길 작업 세션을 제안한다. 물음이면 답 먼저·제안은 끝에 한 줄, 일을 맡기는 말이면 이해한 목적 한 줄과 제안. 목록에 맞는 것이 있으면 그 이름, 없으면 새 이름. 사람이 받으면 불러오거나 확인한 목적으로 만들고, 받지 않으면 작업 세션 없이 잇는다(0.9.17). ← `skill:start-job` → `tool:list` → `tool:load` → `tool:create` 문구: `## 연결되지 않은 대화의 첫 말`
2. **문제 파악** — 요청과 대화에서 문제와 원하는 결과, 이미 정해진 것과 조건을 확인하고 뜻이 흐리면 묻는다. 고를 것이 여럿이면 결과를 바꾸는 것만 추천과 함께 묻고 나머지는 정해서 알린다(0.9.17). ← `skill:start-job` 문구: `## 1. 문제를 파악한다`
3. **기존 자료 먼저** — 작업 세션 기록은 read로 먼저 찾고(find, 없으면 recent), 그다음 프로젝트 자료에서 관련된 내용·결정·도구를 찾는다. 프로젝트가 정한 조사 시작점(제품 그래프 같은 것)이 있으면 거기서 시작하고, 직접 읽을지 맡길지와 받은 결과 확인은 조사 스킬을 따른다(0.9.19, SRV-04). 찾은 것은 지금 일에 맞는 근거인지 읽어서 확인한 뒤 쓴다(0.9.17). ← `skill:start-job` → `tool:list` → `tool:read` 문구: `## 2. 기존 자료를 먼저 찾는다`
4. **문제·목표·조건 맞추기** — 짧은 불릿으로 보이고 사람과 맞춘다. 맞춰졌는데 연결 안 된 대화면 첫 말 절처럼 작업 세션을 제안하고, 착수할 때 이어서 할 일이면 작업 브랜치를 열어 첫 기록으로 남긴다. 짧게 끝날 일이면 작업 브랜치는 열지 않아도 된다. ← `skill:start-job` → `tool:load` → `tool:create` → `tool:branch` → `tool:save` 문구: `## 3. 문제·목표·조건을 맞춘다`
5. **진행 방식 고르기** — 직접 / 기본 포크 / 사이드 포크 / 에이전트 표. 기본 포크는 이 대화가 세부에 깊이 들어가 있으면 그 상태로 시작하고, 에이전트에는 해석 없는 관측을 브리프로 준다. 자기 결과의 검수는 에이전트에, 맡긴 결과는 받은 쪽이 확인한다. 0.9.17부터 애매하면 맡기고(전에는 직접), 맡긴 일은 결과와 판단을 바꿀 수 있는 제약·예외·불확실한 것, 근거 자리로 돌려받는다. 0.9.19부터 에이전트 줄은 사실 조사 대신 무엇이 나올지 모르는 탐색(여럿에게 따로)과 분량이 많은 자료 조사를 들고, '애매하면 맡긴다'는 만들기·검수에만 걸리며 사실 읽기는 조사 스킬을 따른다. 조사로 모은 사실과 찾은 안은 항목마다 확인한 위치를 달아 받는다. ← `skill:start-job` 문구: `## 4. 진행 방식을 고른다`

### 화면 정책
- `pol.start-job-agree`
- `pol.delegate-check`
- `pol.read-first`
- `pol.first-word-session`
- `pol.research-read-split`
- `pol.research-trace`

## SRV-04 조사 절차

- 출력 종류: skill 본문(research). agent가 skill을 부르면 들어오는 글
- 상태: agent가 판단에 쓸 사실을 모으거나 만드는 법·원인·해결책을 찾기 시작함. 코어 지침 'Use separate contexts for detailed work'(STA-01)와 start-job 2·4절(SRV-03#3·#5)이 가리킨다
- 원문: 실행 기록 없음(0.9.19에서 새로 생겼고, skill 본문은 앱이 `skills/research/SKILL.md`를 그대로 싣는다)
- 내는 기능: `skill:research`
- 그리는 코드: `code:skills/research/SKILL.md`

### 개요
조사를 찾을 것이 정해져 있는지로 두 갈래로 나누고, 갈래마다 직접 읽을지·누구에게 맡길지와 받은 결과를 확인하는 법을 agent에게 준다. 코드가 검사하지 않고 글로만 지킨다(0.9.19).

### 화면 흐름
agent는 찾을 것이 정해진 조사면 작업 기록 → 프로젝트 조사 시작점 → 원본 차례로 직접 읽고(양이 많으면 에이전트 하나), 무엇이 나올지 모르는 탐색이면 서로 모르는 여러 에이전트에게 따로 맡긴다. 받은 결과는 항목마다 적힌 위치를 원본과 대조한 뒤 판단에 쓴다.

### 화면요소
1. **두 갈래** — 무엇을 찾는지 말할 수 있고 답이 있는 곳을 짐작할 수 있으면 찾을 것이 정해진 조사, 찾아봐야 후보가 생기면 무엇이 나올지 모르는 탐색. 어느 쪽이든 결과는 항목마다 출처를 달아 받는다(코드). ← `skill:research` 문구: `조사는 찾을 것이 정해져 있는지에 따라 두 가지로 한다.`
2. **정해진 조사는 직접 읽기** — 판단에 쓸 원본은 직접 읽는다: 작업 기록부터, 그다음 프로젝트가 정한 조사 시작점(제품 그래프 같은 것)에서 원본을 좁혀 읽는다. 읽기 전에 읽을 곳의 목록과 크기를 보고, 맥락을 유지하기 어려울 만큼 많으면 에이전트 하나에게 물음과 읽을 곳을 정해 맡긴다. 구현·검수·산출물 만들기는 이 절이 아니라 start-job 진행 방식(코드). ← `skill:research` → `tool:read` 문구: `## 1. 찾을 것이 정해진 조사는 직접 읽는 것이 기본이다`
3. **탐색은 여럿에게 따로** — 같은 물음을 서로 모르는 여러 에이전트에게 새 컨텍스트로(쓸 수 있으면 모델도 다르게) 맡긴다. 브리프에는 문제·목표·조건과 확인된 사실만 주고 미리 생각한 안은 적지 않는다. 돌아온 안은 여럿이 같이 낸 것·하나만 낸 것·부딪히는 것으로 나누고, 결론이 달라지는 안만 추천과 함께 사람에게 보인다(코드). ← `skill:research` 문구: `## 2. 무엇이 나올지 모르는 탐색은 여럿에게 따로 맡긴다`
4. **출처와 대조** — 맡길 때 항목마다 확인한 위치를 달고 본 것·추론한 것·찾지 못한 것을 나눠 받는다. 안에는 출처·동작하는 예시·확인 못 한 점을 함께 받는다. 판단에 영향을 주는 항목은 원본과 대조한 뒤 쓰고, 틀린 곳이 나오면 같은 결과의 다른 항목도 더 대조한다. 직접 조사한 것을 넘길 때도 위치를 단다. 맡겨서 만든 산출물에는 쓰지 않는다(코드). ← `skill:research` 문구: `## 3. 받은 결과는 출처와 대조해 확인한다`

### 화면 정책
- `pol.research-read-split`
- `pol.research-trace`
- `pol.no-host-tool-names`

## TOL-01 작업 세션 목록

- 출력 종류: tool 결과(list)
- 상태: 작업 세션이 없음 / 있음
- 원문: R8(없음)
- 내는 기능: `tool:list`
- 그리는 코드: `code:core/sessions.mjs#sessions.list`

### 화면요소
1. **작업 세션 줄** — 작업 세션마다 이름, context.md 첫 문장, 메인 최신 요약, 열린 작업 브랜치 수, 최근 기록 순(코드·도구 설명). ← `tool:list` → `tool:load` 문구: `# 작업 세션 목록 (최근 기록 순)`
2. **없음** — `아직 작업 세션이 없습니다.` ← `tool:list` → `tool:create`
3. **읽기 실패 줄** — `<이름>: 읽기 실패 — <오류>`(코드). 0.9.9부터 기록 사이 관계 오류(갈래의 기준 기록 없음, 작업 브랜치 부모 순환 등)는 그 작업 세션을 색인에 다시 반영하는 호출(그 세션 파일이 바뀌었거나 색인을 새로 만들 때)의 목록에 한 번만 이 줄로 나온다(core/graph.mjs sync, 코드).

## TOL-02 불러온 작업 맥락

- 출력 종류: tool 결과(load, create, branch create/attach)
- 상태: 연결이 생기거나 바뀐 직후
- 원문: R14(create), R16(branch create), R25(attach), R37(load), R72(Codex load)
- 공통 영역: CMN-01, CMN-02
- 내는 기능: `tool:load`, `tool:create`, `tool:branch`
- 그리는 코드: `code:core/sessions.mjs#sessions.work`, `code:core/recovery.mjs#identity`

### 화면요소
1. **작업 세션 머리와 작업 맥락** — CMN-01 + CMN-02. 도구 결과는 줄이지 않는다. ← `tool:load` ← `tool:create` ← `tool:branch` → `tool:save`
2. **이미 있는 이름** — create에서 같은 이름이 있으면 `작업 세션 '<이름>'이 이미 있습니다. 덮어쓰지 않았습니다.` 한 줄만 돌려주고 대화를 연결하지 않는다(코드). ← `tool:create` → `tool:load`

## TOL-03 저장·닫힘·중단 결과

- 출력 종류: tool 결과(save, branch abandon)
- 상태: 메인 / 작업 브랜치(다음 있음) / 작업 브랜치 닫힘 / 작업 브랜치 중단
- 원문: R15, R17, R24, R34, R113(참조파일), R151(폴더 참조)
- 내는 기능: `tool:save`, `tool:branch`
- 그리는 코드: `code:core/sessions.mjs#sessions.save`, `code:core/sessions.mjs#sessions.abandon`

### 화면요소
1. **기록한 자리** — `작업 세션 '<이름>' 메인에 기록했습니다.` 또는 `… 작업 브랜치 '<이름>'에 기록했습니다.` ← `tool:save`
2. **요약** — `요약: <summary>`. ← `tool:save` 문구: `기록했습니다.…요약: <summary>`
3. **다음** — `다음: <next>`(다음이 있을 때). ← `tool:save` 문구: `기록했습니다.…다음: <next>`
4. **닫힘 안내** — `…다음이 없어 작업 브랜치를 닫아 메인에 합쳤습니다.`와 `이 대화는 이제 메인에 기록합니다.` ← `tool:save`
5. **중단 한 줄** — `작업 브랜치 '<이름>'을 중단했습니다. 메인에 중단 항목 1개와 기록: work/<이름>/history.md.` 중단한 대화는 메인으로 돌아간다. ← `tool:branch`
6. **찾지 못한 참조파일** — files 중 파일로 풀리지 않은 경로를 적은 그대로 남겼다는 한 줄. 저장은 한다. 문구: `참조파일 중 찾지 못한 경로(적은 그대로 남김): <경로>`. 기록에는 `참조파일:` 줄로 쓴다. 파일로 풀린 경로는 절대경로로 바꾸고, 홈 아래면 `~/`로 줄인다. R113에서 홈 아래 파일은 `~/notes/login-plan.md`로, 작업 세션 폴더 기준으로 준 `work/2026-11/…`는 홈 밖이라 `/tmp/hc-demo/…` 절대경로로 써졌다(R122의 최근 기록 본문). 파일 나무(R116)가 `work/2026-11/…`로 보인 것은 나무가 작업 세션 폴더 기준으로 줄여 보이기 때문이다. ← `tool:save`
7. **폴더 참조파일** — files 중 폴더인 것은 그 폴더 경로로 남기되 기록에서 파일 찾기에는 걸리지 않는다고 알린다(R151). 문구: `참조파일 중 폴더(기록에서 파일 찾기에는 걸리지 않음): <경로>` ← `tool:save`

## TOL-05 할 일

- 출력 종류: tool 결과(todo add/list/done)
- 원문: R20, R21, R35
- 내는 기능: `tool:todo`
- 그리는 코드: `code:core/sessions.mjs#sessions.todo`, `code:core/todo.mjs`

### 화면요소
1. **더함** — `작업 세션 '<이름>' 할 일에 더했습니다.`와 todo.md에 쓴 줄 그대로(`- [ ] <날짜> 기한 <날짜>(요일) "원문"`). 원문의 큰따옴표는 작은따옴표로 바뀐다. ← `tool:todo` 고치는 동작은 없어, 기한을 바꾸려면 새로 더하고 옛 항목을 끝내야 한다(C-3에서 agent가 그렇게 해 끝나지 않은 일이 끝냄으로 남음).
2. **목록** — `# 할 일: <이름> (열린 n개)`, 줄마다 기한 · 내용. 기한 있는 것은 기한 순, 없는 것은 최신 순. name을 주면 연결 없이도 볼 수 있다(a3 ua.todo). ← `tool:todo`
3. **끝냄** — `끝냄: <내용>`. 체크만 바꾸고 할 일 글은 그대로 둔다. 무엇으로 끝났는지는 작업 세션 기록으로 남긴다. ← `tool:todo` 문구: `끝냄: <내용>`

## TOL-06 흐름 지도

- 출력 종류: tool 결과(read map), CLI 출력(map.mjs)
- 원문: R26, R44, R82
- 내는 기능: `tool:read`, `cli:map`
- 그리는 코드: `code:core/map-view.mjs`

### 화면요소
1. **머리** — `# 지도: <이름>`. ← `tool:read` ← `cli:map`
2. **줄** — CMN-02#3과 같은 꼴, limit줄(기본 30, 0은 전체). → `tool:read`

## TOL-07 기록 본문

- 출력 종류: tool 결과(read recent, read entry)
- 원문: R27
- 내는 기능: `tool:read`
- 그리는 코드: `code:core/sessions.mjs#sessions.inspect`

### 화면요소
1. **기록** — 기록마다 `## <ISO 시각>`, `요약: …`, (0.9.20부터 save가 쓴 기록은 `대화: <앱>:<ID>`), 본문, `다음: …`. 원문이라 대화 줄도 그대로 보인다(R27). ← `tool:read` 문구: `## YYYY-MM-DDT<시각>`

## TOL-08 둘러보기

- 출력 종류: tool 결과(read overview)
- 원문: R28
- 공통 영역: CMN-02
- 내는 기능: `tool:read`
- 그리는 코드: `code:core/sessions.mjs#sessions.inspect`

### 개요
연결을 바꾸지 않고 다른 작업 세션(또는 이 작업 세션)을 불러올 때와 같은 모양으로 본다.

### 화면요소
1. **작업 세션 머리** — CMN-01#1·#2·#4(이 대화의 작업 브랜치 줄 없음). ← `tool:read`
2. **작업 맥락** — CMN-02#1~#3. ← `tool:read`
3. **최근 기록(작업 세션 전체)** — `## 최근 기록 (작업 세션 전체, n개)`, 기록마다 `### <짧은 ID> <시각> <요약>`과 본문. ← `tool:read` → `tool:read`

## TOL-09 찾기 결과

- 출력 종류: tool 결과(read find)
- 원문: R29(낱말), R32(파일), R115(참조파일)
- 내는 기능: `tool:read`
- 그리는 코드: `code:core/sessions.mjs#sessions.inspect`

### 화면요소
1. **기록 줄** — `<작업 세션>/<자리>@<ISO 시각> · <요약>`. 작업 브랜치의 기록은 메인 색인 줄로도 한 번 더 나온다(R29). 최근 기록이 위이고, 같은 시각이면 작업 세션·작업 브랜치·차례 순이다(0.9.9부터, core/graph.mjs find). ← `tool:read` → `tool:read` 파일로 찾을 때는 기록의 참조파일(0.9.7부터, R115)과 본문에 마크다운 링크·백틱 경로로 적은 파일이 맞는다. 평문 경로만 적은 기록은 '(없음)'(C-3, 0.9.5).
2. **없음** — `(없음)`. ← `tool:read`

## TOL-10 가리킨 파일 나무

- 출력 종류: tool 결과(read files)
- 원문: R31, R116(참조파일)
- 내는 기능: `tool:read`
- 그리는 코드: `code:core/sessions.mjs#sessions.inspect`

### 화면요소
1. **머리** — `# 파일: 작업 브랜치 <이름> (기록 n개)` 또는 기록 하나. ← `tool:read`
2. **나무** — 기록의 참조파일과 본문에 마크다운 링크·백틱 경로로 적은 파일, 그 파일들이 가리킨 파일, depth 1~3, 50개까지. 없으면 `(가리킨 파일 없음)`. ← `tool:read` 평문 경로만 적은 기록은 '(가리킨 파일 없음)'(C-3, 0.9.5).

## TOL-11 살아 있는 대화 목록

- 출력 종류: tool 결과(conversations)
- 원문: R33(Claude), R73(Codex) — 둘 다 살아 있는 대화 없음. R184(Claude)·R185(Codex)·R186(Antigravity) — 살아 있는 Antigravity 대화와 0.9.14가 남긴 서브에이전트 줄, R205·R206 — 서브에이전트 정리 뒤. 0.9.16 짧은 말: R246은 이 목록의 출력이 아니라 R245(Antigravity PreInvocation, 사람이 '응') 뒤 presence를 읽은 측정값(said="응")이다. 짧은 말이 '최근 지시'로 나온 목록 실행은 없다
- 내는 기능: `tool:conversations`
- 그리는 코드: `code:core/sessions.mjs#sessions.conversations`

### 화면요소
1. **머리와 보내기 안내** — `# 살아 있는 대화 (작업 세션 → 작업 브랜치 → 대화)`와 그 앱의 보내기 도구 한 줄(Claude: 'SendMessage(to: 보낼 곳)', Codex·Antigravity: 'send(threadId: 보낼 곳, prompt)'), 문구: `보내기: <도구>. 이름은 여러 대화가 같을 수 있어`. ← `tool:conversations`
2. **대화 줄** — 작업 세션 → 작업 브랜치 → 대화, 대화마다 이름·보낼 곳·종류(사람/포크·워커)·마지막 활동·하는 일, 포크·워커는 띄운 대화 아래 들여씀(코드·도구 설명). ← `tool:conversations` → `tool:send` → `tool:send@antigravity` 문구: `하는 일: <일>` Antigravity 대화는 보낼 곳 `antigravity:<ID>`, 앱 표시 ` · antigravity`로 나온다. 살아 있음은 presence의 pid·시작 식별값으로 본다(`pol.agy-alive`). 하는 일의 `최근 지시`는 사람이 마지막으로 친 말의 첫 줄이고, 0.9.16부터 길이와 상관없이 고른다(전에는 10자 이하를 버려 '그래. 그렇게 하자' 대신 앞의 긴 지시가 보였다. 처리 정책 `pol.said-any-length`). Antigravity 서브에이전트 줄은 없다(`pol.task-not-listed`). 0.9.14가 남긴 서브에이전트 presence는 그 서브에이전트가 다시 모델을 부를 때까지 남을 수 있다(R184 → R205).
3. **안 붙은 대화** — 작업 세션에 안 붙은 대화 묶음(코드). 문구: `## 작업 세션 없음`
4. **없음** — `(살아 있는 대화 없음)`. ← `tool:conversations`

### 화면 정책
- `pol.forks-under-parent`
- `pol.task-not-listed`

## TOL-12 초기설정 결과

- 출력 종류: tool 결과(setup)
- 원문: R11(setup), R12(survey_done), R91·R119(이미 초기설정된 프로젝트), R301·R303·R304·R306·R309·R311(0.9.19 method_on 결과), R313(never_ask step=method), 측정값 R300·R302·R305·R310·R312·R314(설정 파일·.head/config.json). R307·R308은 단계를 끝낸 뒤 시작 훅 출력이라 STA-03 원문이다
- 내는 기능: `tool:setup`
- 그리는 코드: `code:core/project.mjs#setupTool`

### 화면요소
1. **바꾼 것** — `초기설정을 마쳤습니다.`와 코어 지침·env·마켓/플러그인 켜기마다 무엇을 했는지(새로 만들었습니다/더했습니다/그대로). ← `tool:setup`
2. **다음 시작부터** — 시작·/clear·압축 때 코어 지침, 기본 포크, 새 판 받기. Codex에서는 Codex 설정을 바꾸지 않았다는 말. ← `tool:setup` 문구: `다음 시작부터는 시작·/clear·압축 때 코어 지침이 들어가`
3. **코어 지침 본문** — STA-01과 같은 본문과 꼬리표. "이 대화부터 따르세요". ← `tool:setup` 문구: `이 대화에서는 아래 코어 지침을 지금부터 따르세요`
4. **한 줄 결과** — never_ask: `이 프로젝트에서는 … 다시 묻지 않습니다.`, survey_done: `프로젝트 조사를 끝남으로 기록했습니다.` ← `tool:setup`
5. **이미 초기설정됨** — 이미 초기설정된 프로젝트에서 다시 승인하면 맨 앞에 한 줄(0.9.6부터). 문구: `이 프로젝트는 이미 초기설정되어 있었습니다(다른 대화가 먼저 했을 수 있습니다). 이미 있던 값은 그대로 두었습니다.` 설정 파일은 잠그고 고친다. ← `tool:setup`
6. **Antigravity에서 부른 초기설정** — (코드) 설정 항목 끝에 `(Claude Code용, Antigravity에서는 쓰이지 않음)`, 다음 시작 줄은 `다음 시작부터는 시작·압축 뒤에 코어 지침이 들어갑니다. Antigravity 설정은 바꾸지 않았습니다.` ← `tool:setup` 0.9.19부터 Antigravity method_on 결과(TOL-12#8)도 'Antigravity 설정은 바꾸지 않았습니다'로 시작하므로, 이 요소는 초기설정 결과에만 있는 위 두 글로 잇는다.
7. **애드온 물음 이어서** — 초기설정 결과 끝(코어 본문 앞)에 `이어서 "방법론 애드온(head-method)도 켤까요? …`와 예·아니오일 때 부를 것. 이미 초기설정된 프로젝트에서 다시 승인해도 애드온 단계가 남았으면 붙는다(0.9.19, R11·R91·R119). ← `tool:setup` 문구: `이어서 "방법론 애드온(head-method)도 켤까요?`
8. **애드온 결과** — method_on: `방법론 애드온(head-method)을 끝남으로 기록했습니다.`와 앱별 한 줄. Claude Code는 프로젝트 `.claude/settings.json`의 enabledPlugins에 한 줄을 더하고 다른 키는 그대로 둔다(R304·R305 — 더했습니다, R306 — 이미 있어 그대로, R309·R311 — 파일이나 enabledPlugins가 JSON 객체가 아니면 고치지 않고 직접 넣으라고 알림, R310·R312 파일 그대로). Codex·Antigravity는 설정을 바꾸지 않고 사용자에게 알릴 설치 명령을 돌려준다(R301·R303, R302 settings.json 그대로). 어느 앱이든 first_run.method=done을 적는다(0.9.19, 처리 정책 `pol.method-on`). never_ask step=method는 #4 한 줄('이 프로젝트에서는 방법론 애드온을 다시 묻지 않습니다.', R313, 기록은 R314). ← `tool:setup` 문구: `방법론 애드온(head-method)을 끝남으로 기록했습니다.` 문구: `사용자에게 이 설치 명령을 알려 주세요`

### 화면 정책
- `pol.method-ask`

## TOL-13 보내기 결과

- 출력 종류: tool 결과(Codex send, Antigravity send)
- 원문: R74, R178·R179(Antigravity send → queued), R274·R275(0.9.18 등록된 터미널 대화 — Codex·Antigravity send started), R279(화면에서 떠난 대화 — queued), R281(쥔 agy가 꺼짐 — queued)
- 내는 기능: `tool:send`, `tool:send@antigravity`
- 그리는 코드: `code:hosts/codex/mcp.mjs#sendTool.call`, `code:hosts/antigravity/mcp.mjs#serveAntigravity.call`

### 화면요소
1. **JSON 한 줄** — `{"threadId":"<받는 곳>","delivery":"started|app-queued|queued|sent"}`. Antigravity 대상의 delivery는 `started`(살아 있는 ACP 대화나 깨우기 등록을 마친 터미널 대화 중 지금 화면의 대화를 바로 깨움, 일하는 중이면 다음 단계에서 받음, 처리 끝 확인은 아님, 0.9.18부터 터미널 포함)·`queued`(등록 안 된 터미널, 화면에서 떠난 대화, 데스크톱 앱, 깨우기 실패)다. ← `tool:send` ← `tool:send@antigravity` 문구: `{"threadId":"<받는 곳>","delivery":"<값>"}`

## ERR-01 도구 오류

- 출력 종류: tool 결과(isError)
- 원문: R9, R10, R13, R18, R19, R23, R30, R36, R38, R39, R75, R76, R114, R117, R118, R149, R150, R152, R175~R177·R180(Antigravity send)
- 내는 기능: `tool:list`, `tool:load`, `tool:create`, `tool:save`, `tool:branch`, `tool:read`, `tool:todo`, `tool:setup`, `tool:send`, `tool:send@antigravity`
- 그리는 코드: `code:core/mcp.mjs#callTool`

### 개요
무엇이 잘못됐고 무엇을 주면 되는지를 한 문장으로 돌려준다. agent는 고쳐서 다시 부른다.

### 화면요소
1. **인자 오류** — `알 수 없는 도구: <이름>`, `유효하지 않은 인자: <이름>`, `필수 인자: <이름>`. files에 목록이 아닌 값을 주어도 이것이다(R114). ← `tool:read`
2. **context 없는 create** — `방향(context)이 필요합니다. 목적 없는 작업 세션은 만들지 않습니다. …` ← `tool:create`
3. **저장 규칙** — 다음·정리 없이 저장(`…recap으로 주세요. 이어 갈 일이 남았다면 next를 주세요.`), 다음과 정리를 함께(`다음이 있는 저장에는 recap을 받지 않습니다. …`). 0.9.7부터 본문에 기록 제목이나 예약 줄(`요약:`·`다음:`·`참조파일:` 등)이 있으면 거절하고(R149), files 경로에 백틱·줄바꿈이 있으면 거절한다(R150). 문구: `본문에 기록 제목 또는 예약 줄을 넣을 수 없습니다. 참조파일은 files로 줍니다.` 문구: `files의 경로에는 백틱이나 줄바꿈을 넣을 수 없습니다.` ← `tool:save`
4. **없는 대상** — `세션 '<이름>'이 없습니다.`, `작업 브랜치가 없습니다: <이름>`. ← `tool:load` ← `tool:read`
5. **branch 규칙** — `reason는 비어 있지 않은 한 줄이어야 합니다.`, `작업 브랜치 '<이름>'이 이미 있습니다. 이어 가려면 attach하세요.`(코드) ← `tool:branch`
6. **setup 규칙** — `never_ask에는 step(setup, survey, method 중 하나)이 필요합니다.` 0.9.19에서 step에 method가 더해져 문구가 바뀌었다(R13). 잘못된 action은 `action은 setup, never_ask, survey_done, method_on 중 하나입니다.`(코드). ← `tool:setup`
7. **send 규칙** — `이 대화 자신에게는 보낼 수 없습니다.`, `받는 Claude 대화가 지금 실행 중이 아닙니다: <보낼 곳>` ← `tool:send` Antigravity send: `이 대화 자신에게는 보낼 수 없습니다.`, `보낼 곳을 알 수 없습니다: <보낼 곳>`, `받는 Antigravity 대화를 찾을 수 없습니다: <보낼 곳>`, `threadId와 비어 있지 않은 prompt가 필요합니다.` ← `tool:send@antigravity`
8. **이름 규칙** — `이름은 영문·숫자·한글·._-만 허용하며 ..와 경로 구분자는 금지합니다.` 띄어쓰기가 있는 이름은 거절된다(a3 ua.branch·ua.record·ua.todo·ua.resume). 이름을 받는 도구(create·branch·load, name을 준 read·todo)만 이 오류를 낸다(core/sessions.mjs directory, core/graph.mjs Graph.session). ← `tool:create` ← `tool:branch` ← `tool:load` ← `tool:read` ← `tool:todo`
9. **중단한 작업 브랜치 불러오기** — `중단한 작업 브랜치입니다. 기록은 read로 읽으세요.`(코드) ← `tool:load` ← `tool:branch` → `tool:read`
10. **짧은 ID** — 꼴이 틀림(`지도 ID는 짧은 ID(16진수 4자 이상) 또는 전체 ID입니다.` — 0.9.5는 '5자 이상'이라 적었으나 검사는 4자부터였고, 0.9.6에서 문구를 검사에 맞춤, R36·R118), 세션 없음, 없는 ID, 여럿에 겹침(후보를 담은 오류)(코드). ← `tool:read`
11. **연결 안 된 대화의 쓰기** — 작업 세션에 붙지 않은 대화가 save·branch 등을 부르면 문구: `이 대화는 아직 작업 세션에 연결되지 않았습니다. 먼저 작업 세션을 불러오거나 만드세요.`
13. **잠금을 얻지 못함** — 색인·기록·설정 파일의 잠금을 다른 살아 있는 프로세스가 10초 넘게 쥐고 있으면 그 호출이 실패한다(R152: 색인 잠금을 쥔 채 read). 0.9.8 전에는 저장이 색인 잠금을 10초 넘게 쥐어 다른 대화가 이 오류를 받았다(README). 잠금을 쥐는 도구(`impact core/lock.mjs#locked`) 어디서나 날 수 있다. 문구: `잠금을 얻지 못했습니다: <파일>` ← `tool:list` ← `tool:load` ← `tool:create` ← `tool:save` ← `tool:branch` ← `tool:read` ← `tool:todo` ← `tool:conversations` ← `tool:setup`
12. **달 꼴 작업 브랜치 이름** — 새 작업 브랜치 이름이 `YYYY-MM` 꼴이면 거절한다(0.9.6부터, R117). 전에 만든 달 꼴 작업 브랜치는 그대로 읽는다(코드). 문구: `'<이름>'는 작업 파일의 달 폴더(work/YYYY-MM) 꼴이라 작업 브랜치 이름으로 쓸 수 없습니다. 그 일을 나타내는 이름을 주세요.` ← `tool:branch`

## ERR-02 쓰기 거절

- 출력 종류: tool 결과(isError)
- 상태: 대화 안 작업(agent_id) 또는 프로그램이 돌리는 대화(claude -p)가 쓰기 도구를 부름. Antigravity: 도구 호출 `_meta`의 root가 그 대화와 다름(서브에이전트·하위 대화, setup 포함)
- 원문: R43, R45, R77, R173(Antigravity 하위 대화의 save), R208·R209(Antigravity 서브에이전트의 todo add·setup)
- 내는 기능: `tool:load`, `tool:create`, `tool:save`, `tool:branch`, `tool:todo`, `tool:setup`
- 그리는 코드: `code:core/mcp.mjs#callTool`

### 화면요소
1. **거절 문구** — `이 작업에서는 작업 기록을 쓰지 않습니다(읽기만 됩니다). 결과를 돌려주면 부른 대화가 확인하고 저장합니다.` ← `tool:save` ← `tool:todo` ← `tool:setup`

## ERR-03 프로젝트를 알 수 없음

- 출력 종류: tool 결과(isError, Codex·Antigravity)
- 상태: Codex 대화의 시작 훅이 돌지 않아 등록이 없음(대개 훅 신뢰 전). Antigravity: 대화의 훅이 아직 돌지 않아 등록 파일에 작업 폴더가 없음
- 원문: R78, R174·R221~R230(Antigravity, 등록 안 된 대화의 도구 10개)
- 내는 기능: `tool:list`, `tool:load`, `tool:read`(Codex). Antigravity: core 도구 9개(`tool:list`·`tool:load`·`tool:create`·`tool:save`·`tool:branch`·`tool:read`·`tool:todo`·`tool:conversations`·`tool:setup`)와 `tool:send@antigravity` — 도구를 고르기 전에 같은 오류로 멈춘다(`core/mcp.mjs` serve tools/call, R174·R221~R230)
- 그리는 코드: `code:hosts/codex/register.mjs`, `code:core/mcp.mjs#PROJECT_UNKNOWN`, `code:hosts/antigravity/mcp.mjs#serveAntigravity.projectOf`

### 화면요소
1. **이유** — `이 대화의 프로젝트를 알 수 없습니다. head-context의 시작 훅이 이 대화에서 돌지 않았습니다. …` ← `tool:list`
2. **사람에게 전할 신뢰 경로** — 터미널 Codex: Hooks need review → Trust all and continue. Codex 앱: 설정 → 코딩 → Hook → 플러그인에서 제공 → Head Context → 모두 신뢰. 그 뒤 새 대화. 문구: `Trust all and continue`
3. **Antigravity 이유** — `이 대화의 프로젝트를 알 수 없습니다. 대화를 새로 시작하거나 다시 열어 주세요(시작할 때 프로젝트를 등록합니다).` 문구: `대화를 새로 시작하거나 다시 열어 주세요` ← `tool:list` ← `tool:load` ← `tool:create` ← `tool:save` ← `tool:branch` ← `tool:read` ← `tool:todo` ← `tool:conversations` ← `tool:setup` ← `tool:send@antigravity` 정책: `pol.agy-needs-hook-first`

## ERR-04 훅 실패 한 줄

- 출력 종류: 시작·입력 훅이 넣는 글
- 상태: 훅 실행 중 오류. Antigravity 도구 전 훅(PreToolUse)은 실패해도 이 줄을 내지 않는다. 입력 오류(R271)와 진입 스크립트가 뜨지 못할 때(R272, 셸 대체)는 허락(allow)이 나가지만, 10초 시간 초과에는 agy가 그 셸 명령을 거절한다(`pol.hook-failure-says`, `pol.agy-wake-register-approve`)
- 원문: R64(.head/config.json이 깨짐), R163(Antigravity 시작 파일의 없는 작업 세션), R231(Antigravity 편지함 폴더를 읽을 수 없음)
- 내는 기능: `hook:claude:SessionStart:session`, `hook:codex:SessionStart:session`, `hook:codex:UserPromptSubmit:inbox`, `hook:antigravity:SessionStart`, `hook:antigravity:PreInvocation`
- 그리는 코드: `code:hosts/claude/hook.mjs`, `code:hosts/codex/hook.mjs`, `code:hosts/antigravity/hook.mjs#runHook`

### 화면요소
1. **실패 한 줄** — `head-context: 이 훅(<부분>)이 작업 맥락을 넣지 못했습니다: <이유>`. Claude는 시작·하위 에이전트 훅, Codex는 시작·입력·하위 에이전트 훅이 실패하면 낸다(각 훅의 catch). ← `hook:claude:SessionStart:session` ← `hook:claude:SessionStart:context` ← `hook:claude:SessionStart:core` ← `hook:claude:SessionStart:recent` ← `hook:claude:SubagentStart` ← `hook:codex:SessionStart:session` ← `hook:codex:SessionStart:context` ← `hook:codex:SessionStart:core` ← `hook:codex:SessionStart:instructions` ← `hook:codex:UserPromptSubmit:inbox` ← `hook:codex:SubagentStart:subagent`
2. **설정 파일 이유** — `설정 파일을 읽을 수 없습니다(JSON 오류). 고치기 전에는 기록 위치를 알 수 없어 기록을 읽거나 쓰지 않습니다: <경로> …` 기록 위치를 읽는 훅이 낸다. ← `hook:claude:SessionStart:session` ← `hook:claude:SessionStart:context` ← `hook:codex:SessionStart:session` ← `hook:codex:SessionStart:context` ← `hook:codex:UserPromptSubmit:inbox`
3. **Antigravity 실패 한 줄** — 부분 이름 없이 `head-context: 작업 맥락을 넣지 못했습니다: <이유>`. 시작 파일 오류(`시작 파일의 session은 …`, `작업 세션 '<이름>'이 없습니다.`)와 읽을 수 없는 편지함 폴더도 이 꼴이다(R231. Codex는 같은 경우 빈 편지함으로 보아 아무것도 내지 않는다 R232, `pol.inbox-unreadable-per-app`). 서브에이전트 판정은 실패해도 이 줄을 내지 않는다(R218). ← `hook:antigravity:SessionStart` ← `hook:antigravity:PreInvocation`

### 화면 정책
- `pol.hook-failure-says`

## ERR-05 node:sqlite 없는 Node

- 출력 종류: tool 결과(isError)와 시작 훅이 넣는 글
- 상태: PATH에서 먼저 잡히는 node가 node:sqlite를 불러오지 못함(22.13 미만, 플래그 없는 23.0~23.3) — 실행은 f2의 `/usr/bin/node` v18.19.1로 했다
- 원문: R129·R130(도구 서버 시작 — initialize·tools/list는 그대로 답함), R131·R140~R147(Claude 도구 서버의 도구 아홉), R132·R148(Codex 도구 서버의 list·send), R134(Claude 시작 훅 session), R138(Codex 시작 훅 session), R135·R137·R139(빈 출력), R187·R188(Antigravity 시작·압축 뒤 복원 — 이유 한 줄), R189(일반 단계 — 이유 없음, 편지함은 들어감), R190(`/compact` — 압축 지시 없음), R191(Antigravity send), R211·R212(서브에이전트 — AGT-01만)
- 내는 기능: `tool:list`, `tool:load`, `tool:create`, `tool:save`, `tool:branch`, `tool:read`, `tool:todo`, `tool:conversations`, `tool:setup`, `tool:send`, `hook:claude:SessionStart:session`, `hook:codex:SessionStart:session`, `tool:send@antigravity`, `hook:antigravity:SessionStart`, `hook:antigravity:PreInvocation`
- 그리는 코드: `code:core/platform.mjs#runtimeProblem`

### 개요
0.9.7부터 옛 Node로 띄워도 도구 서버와 훅이 죽지 않고, 무엇이 필요한지 한 줄로 알린다. 전에는 도구 서버가 시작하다 죽었다(README).

### 화면 흐름
agent는 이 줄을 사람에게 전한다. 사람이 node를 바꾸고 대화를 다시 연다.

### 화면요소
1. **이유 한 줄** — 모든 도구 호출의 오류와, 시작 훅 session 부분에 한 번. 문구: `head-context는 node:sqlite를 쓸 수 있는 Node(22.13 이상)가 필요합니다. 지금 node(<버전>, <실행 파일>)는 node:sqlite를 불러오지 못합니다. PATH에서 먼저 잡히는 node를 바꾼 뒤 대화를 다시 여세요.` ← `tool:list` ← `tool:load` ← `tool:create` ← `tool:save` ← `tool:branch` ← `tool:read` ← `tool:todo` ← `tool:conversations` ← `tool:setup` ← `tool:send` ← `hook:claude:SessionStart:session` ← `hook:codex:SessionStart:session` ← `tool:send@antigravity` ← `hook:antigravity:SessionStart` ← `hook:antigravity:PreInvocation`
2. **빠지는 것** — 시작 훅의 작업 맥락(context)은 비고, 압축 직전 훅은 아무것도 내지 않는다(호스트 요약이 남음). 코어 지침(R133)과 압축·/clear 뒤 최근 대화 원문(R136), Codex 안내문은 node:sqlite가 필요 없어 그대로 들어간다. Antigravity: 이유 한 줄은 시작과 압축 뒤 복원 때만(사람 대화) 나오고, 일반 단계는 이유 없이 편지함 메시지를 넣으며, `/compact` 단계는 압축 지시를 내지 않는다. 서브에이전트에는 이유 줄 없이 AGT-01만 들어간다.

### 화면 정책
- `pol.old-node-says`

## AGT-01 대화 안 작업 안내

- 출력 종류: 하위 에이전트 시작 훅이 넣는 글(Antigravity는 시작 훅·매 단계 훅이 시스템 메시지로)
- 상태: 대화 안에서 포크·하위 에이전트가 시작. Antigravity `invoke_subagent` 서브에이전트의 시작과 압축 뒤 첫 단계(옛 Node에서도 같음, 0.9.15~)
- 원문: R42(Claude), R81(Codex), R193(Antigravity 서브에이전트 시작), R198(압축 뒤), R210(초기설정 전), R211·R212(node:sqlite 없는 Node), R213(시작 파일·HEAD_CONTEXT_SESSION이 있어도), R217(깨진 메시지 파일 옆)
- 내는 기능: `hook:claude:SubagentStart`, `hook:codex:SubagentStart:subagent`, `hook:antigravity:SessionStart`, `hook:antigravity:PreInvocation`
- 그리는 코드: `code:core/mcp.mjs#SUBAGENT_NOTICE`

### 화면요소
1. **안내 한 덩어리** — `이 작업은 부른 대화 안에서 맡은 일 하나를 합니다. 끝나면 결과를 돌려주세요. 부른 대화가 결과를 확인하고 저장합니다. 작업 기록 도구(load, save 등)는 읽기만 됩니다.` ← `hook:claude:SubagentStart` ← `hook:codex:SubagentStart:subagent` ← `hook:antigravity:SessionStart` ← `hook:antigravity:PreInvocation`

### 화면 정책
- `pol.subagent-notice`

## MSG-01 받은 메시지

- 출력 종류: 입력 훅(Codex)·매 단계 훅(Antigravity)이 넣는 글
- 상태: 바로 깨우지 못한 동안 이 대화로 온 메시지가 편지함에 있음. Antigravity: 편지함에 메시지가 있음(깨우기로 열린 턴, 서브에이전트 포함)
- 원문: R79(있음), R80(빈 편지함 — 출력 없음), R166·R183(Antigravity), R189(Antigravity, node:sqlite 없는 Node), R277·R282(0.9.18 깨어난 터미널 대화 — 세 앱이 보낸 원문이 한 번씩)
- 내는 기능: `hook:codex:UserPromptSubmit:inbox`, `hook:antigravity:PreInvocation`
- 그리는 코드: `code:core/inbox.mjs#asMessage`(0.9.15부터 Codex·Antigravity가 같이 쓴다)

### 화면요소
1. **메시지** — `<cross-session-message from="<보낸 곳>">` 본문 `</cross-session-message>`. ← `hook:codex:UserPromptSubmit:inbox` ← `hook:antigravity:PreInvocation` → `tool:send` → `tool:send@antigravity` 문구: `cross-session-message from=`
2. **못 읽은 메시지 알림** — `head-context: 이 대화로 온 메시지 n개를 읽을 수 없어 전하지 못하고 따로 두었습니다: …`(코드). 문구: `이 대화로 온 메시지 <n>개를 읽을 수 없어` Codex만 이 문구다.
3. **Antigravity 못 읽은 메시지 알림** — `head-context: 읽을 수 없는 메시지를 따로 두었습니다: <경로>`(R166). 편지함 폴더가 있는데 읽지 못하면 Antigravity는 ERR-04 한 줄을, Codex는 빈 편지함으로 본다(`pol.inbox-unreadable-per-app`, R231·R232). 문구: `읽을 수 없는 메시지를 따로 두었습니다` ← `hook:antigravity:PreInvocation`

## MSG-02 Claude에서 Codex·Antigravity로 보낸 결과

- 출력 종류: Claude의 SendMessage 결과(호스트가 보여 줌), 그 안의 판정은 중계 출력
- 상태: Claude 대화가 `codex:<ID>`·`antigravity:<ID>`로 SendMessage
- 원문: R86(이 프로젝트의 대화가 아님), R87(편지함에 둠) — 중계 스크립트 출력. R181(Antigravity 편지함에 둠), R182(없는 Antigravity 대화), R273(0.9.18 등록된 터미널 Antigravity 대화 — started)
- 내는 기능: `hook:claude:session.send`
- 그리는 코드: `code:hooks/conversations.mjs#register`, `code:scripts/relay.mjs`

### 화면요소
1. **보냄** — 호스트에 `isDelivered: true`(중계 출력 `{"delivered":true,"how":"started|app-queued|queued"}`, Antigravity는 started·queued, started는 ACP 대화와 등록된 터미널 대화 0.9.18). ← `hook:claude:session.send`
2. **못 보낸 이유** — `isDelivered: false`와 reason(예: `이 프로젝트에서 연 Codex 대화가 아닙니다: codex:<ID>`, `Codex로 보내는 중 플러그인 오류가 났습니다`). ← `hook:claude:session.send` Antigravity: `받는 Antigravity 대화를 찾을 수 없습니다: antigravity:<ID>`, `Antigravity로 보내지 못했습니다`, `Antigravity로 보내는 중 플러그인 오류가 났습니다`(코드). 문구: `받는 Antigravity 대화를 찾을 수 없습니다`

## MSG-03 깨우기 등록 지시

- 출력 종류: Antigravity 매 턴 훅이 넣는 시스템 메시지
- 상태: 터미널 agy 프로세스의 사람 대화에서, 그 프로세스에 처음 요청하는 모델 호출(프로세스마다 한 번, 0.9.18). ACP·print 모드(-p·--print·--prompt)·--remote-agent·서브에이전트·/compact 단계·agy를 못 찾은 대화(데스크톱 앱 등)에는 없다. 옛 Node에서도 나온다
- 원문: R256(가짜 터미널 agy 첫 호출), R282(다시 띄운 agy), R293(옛 Node). 없는 경우 R258·R259·R284·R286·R288·R290·R292
- 내는 기능: `hook:antigravity:PreInvocation`
- 그리는 코드: `code:hosts/antigravity/hook.mjs#WAKE_ASK`, 명령 글 `code:hosts/antigravity/wake-command.mjs#registerCommand`

### 개요
이 agy 프로세스로 오는 다른 대화의 메시지에 이 대화가 깨어나도록, 사람 물음에 답하기 전에 등록 명령을 한 번 돌리게 한다.

### 화면 흐름
agent는 이 지시대로 run_command로 명령을 글자 그대로 한 번 돌린다(도구 전 훅이 자동 승인해 허락 창이 뜨지 않는다). 출력 한 줄(CLI-02)을 받은 뒤 사람 물음에 답한다. 못 돌렸거나 거절되면 다시 시도하지 않는다.

### 화면요소
1. **무엇을 위한 지시인지** — `head-context 깨우기 등록:` 머리와 아직 등록되지 않아 깨울 수 없다는 한 줄. ← `hook:antigravity:PreInvocation` 문구: `이 agy 프로세스는 아직 등록되지 않아, 다른 대화가 보낸 메시지로 이 대화를 깨울 수 없습니다`
2. **실행 지시** — 답하기 전에 run_command로 글자 그대로 한 번, 인자·따옴표·경로를 고치지 말 것, 출력은 한 줄. ← `hook:antigravity:PreInvocation` 문구: `사용자 물음에 답하기 전에 run_command로 아래 명령을 글자 그대로 한 번만 실행하세요`
3. **등록 명령 한 줄** — 인자 없는 `node "<플러그인 폴더>/scripts/antigravity-wake-register.mjs"`. 도구 전 훅이 이 글과 글자까지 같은 명령에만 자동 승인을 준다. ← `hook:antigravity:PreInvocation` → `cli:antigravity-wake-register` 문구: `scripts/antigravity-wake-register.mjs"`
4. **실패 때** — 못 돌렸거나 거절되면 다시 시도하지 말고 답한다. ← `hook:antigravity:PreInvocation` 문구: `실행하지 못했거나 거절되면 다시 시도하지 말고 사용자 물음에 답하세요`

## CMP-01 압축 요약 지시

- 출력 종류: 압축 직전 훅(Claude)·`/compact` 단계의 매 단계 훅(Antigravity) 출력(호스트의 요약 모델이 읽음)
- 상태: Claude 대화 압축 직전(node:sqlite를 쓸 수 있는 Node일 때만 — 옛 Node에서는 빈 출력, R137). Antigravity: `/compact` 입력의 단계(사람 대화만, node:sqlite 없는 Node에서는 내지 않음 R190). 서브에이전트에는 넣지 않아 agy 요약이 그대로 남는다(R197)
- 원문: R51, R167(Antigravity)
- 내는 기능: `hook:claude:PreCompact`, `hook:antigravity:PreInvocation`
- 그리는 코드: `code:hosts/claude/compact.mjs#compactInstruction`

관찰(0.9.14 README에서 옮김): agy 1.5.13 실제 시험에서 `<summary>` 본문은 한 줄 포인터가 됐다. 호스트가 그 바깥에 붙이는 `User Requests`(이전 사용자 입력)와 `Conversation Logs` 경로 안내는 남는다.

### 화면요소
1. **덮어쓰기 지시** — 번호 절 요약 대신 `<summary>`에 한 줄만, `<analysis>`도 한 줄, 대화 반복·다음 할 일 금지(영어). ← `hook:claude:PreCompact` 문구: `OVERRIDE FOR THIS SUMMARY` ← `hook:antigravity:PreInvocation`
2. **포인터 한 줄** — `이전 대화는 요약하지 않는다. 압축 직전의 최근 대화(원문)와 작업 세션·작업 맥락은 이 메시지 뒤의 자동 컨텍스트에 있고, 전체 기록은 대화 기록 파일에 있다.` ← `hook:claude:PreCompact` ← `hook:antigravity:PreInvocation`

## CLI-01 0.7 정리

- 출력 종류: CLI 출력(migrate-0.7.mjs)
- 상태: 0.6에서 올리는 프로젝트(미리 보기가 기본, `--apply`로 적용)
- 원문: R83(미리 보기), R84(경로 없음)
- 내는 기능: `cli:migrate-0.7`
- 그리는 코드: `code:core/migrate.mjs#describe`

### 화면요소
1. **머리** — `# 0.6 → 0.7 맞추기 (미리 보기 — --apply로 적용)`. ← `cli:migrate-0.7`
2. **옛 상태 파일** — `.head/state/_0.6/`으로 옮길 것, `subtasks/`는 그대로. ← `cli:migrate-0.7` 문구: `## 옛 상태 파일 → .head/state/_0.6/`
3. **저장 없는 0.6 자동 브랜치** — 옮길 것 n개. ← `cli:migrate-0.7` 문구: `## 저장 없는 0.6 자동 브랜치`
4. **그 브랜치를 가리키던 대화** — 메인으로 n개. ← `cli:migrate-0.7` 문구: `## 이 브랜치를 가리키던 대화 → 메인`
5. **반복 이름표** — `"(fork)"` 반복을 하나로 n개. ← `cli:migrate-0.7` 문구: `반복 이름표 → 하나로`
6. **경로 없음** — stderr `프로젝트 경로가 필요합니다: node scripts/migrate-0.7.mjs <프로젝트> [--apply]`, 종료 코드 1. ← `cli:migrate-0.7`

## CLI-02 깨우기 등록 명령 출력

- 출력 종류: CLI 출력(scripts/antigravity-wake-register.mjs, 모델이 터미널 agy 셸에서 run_command로 돌림)
- 상태: 등록 지시(MSG-03)를 받은 모델이 명령을 돌림(0.9.18)
- 원문: R260(등록됨), R262(주소를 넘기지 않음), R263(쓸 수 없는 주소), R264(agy 조상 없음), R265(기록 폴더에 쓸 수 없음)
- 내는 기능: `cli:antigravity-wake-register`
- 그리는 코드: `code:scripts/antigravity-wake-register.mjs#registerWake`

### 화면요소
1. **등록됨** — 성공 한 줄. 열쇠·주소를 내지 않는다(R261). ← `cli:antigravity-wake-register` 문구: `head-context: 깨우기 등록됨`
2. **등록 안 됨과 이유** — `head-context: 깨우기 등록 안 됨 — <이유>` 한 줄. 이유는 `agy가 깨울 주소를 넘기지 않았습니다.` / `agy가 넘긴 주소를 쓸 수 없습니다.` / `agy 프로세스를 찾지 못했습니다.` / `기록을 쓰지 못했습니다(<오류 코드>).` 넷이다. ← `cli:antigravity-wake-register` 문구: `head-context: 깨우기 등록 안 됨 — <이유>`
