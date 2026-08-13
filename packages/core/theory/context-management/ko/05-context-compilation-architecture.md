# Context Compilation Architecture — 전체 이론 정리

## 1. 문제 정의

현재 일반적인 HEAD 작업 흐름은 다음과 같습니다.

```text
사용자 요청
→ HEAD가 필요한 정보 조사
→ 도구 호출과 원문 열람
→ 관계와 현재 상태 해석
→ 컨텍스트 구성
→ 플래닝
→ 실행
```

이 구조에서는 조사와 판단이 같은 세션에서 일어나므로 다음이 누적됩니다.

1. 의도하지 않았거나 관련성이 낮은 정보
2. Tool 호출문과 대량 반환값
3. 올바른 정보에 도달하기까지 거친 중간 단계
4. 폐기된 가설과 검색 경로
5. 오래된 설명과 중복
6. 조사 과정 뒤로 밀려난 사용자 요청·지침·플랜

따라서 문제는 정보 부족만이 아닙니다.

> **최종 판단을 담당하는 HEAD가 정보 획득 과정까지 함께 기억한다는 것**이 문제입니다.

---

## 2. 핵심 명제

### 기존 방식

```text
HEAD = 조사자 + 컨텍스트 구성자 + 계획자 + 실행자
```

### 제안 방식

```text
Compiler = 조사 + 선택 + 검증 + 조립 명세 생성
Task HEAD = 판단 + 계획 + 실행
```

즉, 정보 획득과 최종 판단을 서로 다른 컨텍스트에서 수행합니다.

Compiler가 조사 과정의 모든 노이즈를 감당하고, 최종 HEAD에는 채택된 작업용 컨텍스트만 주입합니다.

---

## 3. 전체 아키텍처

```text
프로젝트의 실제 정보
- 수만 개 파일
- 그래프
- 문서
- DB
- 런타임 상태
- 과거 세션
        ↑
        │ 필요한 부분만 조회
        │
Project Compiler Image
- 프로젝트 고해상도 구조 지도
- 권위 지도
- 탐색 규칙
- 관계 확장 규칙
- 조립 규칙
        ↓
Disposable Compiler Session
- 사용자 요청 해석
- 검색 및 도구 호출
- 현재 상태 확인
- 관련 정보 선택
        ↓
Context Assembly JSON
- 포함할 fragment
- 배치 순서
- 렌더링 방식
- raw text
        ↓
Deterministic Resolver / Renderer
        ↓
Compiled Task Context
        ↓
Fresh OpenCode Task HEAD
        ↓
Planning / Execution
```

---

## 4. Project Compiler Image

### 4.1 컴파일러가 보유하는 것

Compiler Image는 프로젝트의 모든 실제 내용을 들고 있지 않습니다.

다음과 같은 **프로젝트 의미 구조**를 고해상도로 보유합니다.

- 프로젝트의 주요 도메인
- 시스템과 서비스의 경계
- 기능·정책·구현·데이터 사이의 관계
- 각 디렉터리와 파일 유형의 역할
- 권위 있는 정보가 있는 위치
- 질문 유형별 조회 경로
- 그래프, 파일, DB, 런타임의 역할 분담
- 현재성을 확인해야 하는 정보
- 관련 정보를 어디까지 확장할지에 대한 규칙
- 충돌하는 정보의 우선순위
- Context Assembly JSON 생성 규칙

요약하면:

```text
Compiler Image
≠ 프로젝트 전체 내용

Compiler Image
= 프로젝트 전체를 정확히 읽고 조립하는 방법
```

컴파일러는 프로젝트의 백과사전이 아니라 **지도, 쿼리 플래너, 링커**에 가깝습니다.

### 4.2 왜 프로젝트 버전별로 고정하는가

Project Compiler Image는 프로젝트의 의미 구조가 유지되는 동안 고정됩니다.

버전이 바뀌어야 하는 사례:

- 주요 디렉터리 역할 변경
- 서비스 경계 변경
- 권위 문서 변경
- 그래프 스키마 변경
- 기능과 구현의 연결 방식 변경
- 조회 도구나 조립 규칙 변경

버전이 바뀔 필요가 없는 사례:

- 일반 코드 수정
- 개별 문서 문구 변경
- 새 로그 생성
- 런타임 값 변경
- 대부분의 일상적인 파일 변경

따라서 관리 비용은 수만 개 파일의 변경 빈도가 아니라 **프로젝트 의미 구조의 변경 빈도**에 비례합니다.

---

## 5. Disposable Compiler Session

고정 컴파일러를 하나의 장기 대화 세션으로 운용하면 그 컴파일러도 오염됩니다.

따라서 고정되어야 하는 것은 세션이 아니라 **Compiler Image**입니다.

```text
Immutable Compiler Image v12
├─ 작업 A용 Compiler Session → JSON 생성 → 폐기
├─ 작업 B용 Compiler Session → JSON 생성 → 폐기
└─ 작업 C용 Compiler Session → JSON 생성 → 폐기
```

각 작업용 Compiler Session은 다음을 수행합니다.

1. 사용자 요청 해석
2. 필요한 정보 종류 결정
3. 프로젝트 지도에 따라 조회 경로 선택
4. 파일·그래프·DB·런타임 조사
5. 정보의 현재성과 권위 확인
6. 필요한 관계 범위 확장
7. 포함할 fragment 결정
8. 최종 Assembly JSON 생성
9. 자신의 조사 과정은 폐기

검색 실패, 잘못 읽은 자료, 도구 출력, 중간 추론은 Compiler Session 안에서 끝납니다.

---

## 6. Context Assembly JSON

### 6.1 정의

Assembly JSON은 실제 작업 컨텍스트 자체라기보다 다음을 선언하는 **조립 명세**입니다.

> 이번 Task HEAD에 어떤 정보를, 어느 위치에서 가져와, 어떤 순서와 형식으로 넣을 것인가.

예시:

```json
{
  "schemaVersion": "1",
  "compilerImage": "noahchat-project-model:v12",
  "task": {
    "rawRequest": "사용자 요청 원문",
    "mode": "planning"
  },
  "sections": [
    {
      "order": 10,
      "role": "user_request",
      "source": {
        "type": "raw",
        "text": "사용자 요청 원문"
      }
    },
    {
      "order": 20,
      "role": "product_policy",
      "source": {
        "type": "file_fragment",
        "path": "docs/product/policy.md",
        "selector": {
          "heading": "캐릭터 공개 정책"
        }
      },
      "render": "verbatim"
    },
    {
      "order": 30,
      "role": "implementation",
      "source": {
        "type": "symbol",
        "path": "backend/services/character.py",
        "selector": {
          "symbol": "publish_character"
        }
      },
      "render": "code"
    }
  ]
}
```

### 6.2 JSON에 들어가는 것

대부분:

- 파일 경로
- 문단 또는 heading
- 코드 symbol
- 그래프 entity
- DB query/result reference
- 저장된 세션 fragment
- 배치 순서
- 표시 방식
- 역할과 의미

필요한 경우에만:

- 사용자 원문
- 이번 작업에서 새롭게 결정된 사실
- 외부에서 들어와 참조할 곳이 없는 자료
- 짧은 연결 설명
- 컴파일러가 만든 구조화된 결론

즉, 기본은 인덱스이고 raw text는 예외적으로 들어갑니다.

---

## 7. Resolver와 Renderer

Assembly JSON 자체는 모델에 바로 넣을 전체 문맥이 아닙니다.

### Resolve

```text
JSON의 source reference
→ 실제 파일·문단·symbol·그래프 결과 해석
→ 정확한 fragment 획득
```

### Render

```text
해석된 fragment
→ JSON에 지정된 순서로 배열
→ 제목과 경계 삽입
→ raw/code/verbatim 형식 적용
→ 하나의 Task Context 생성
```

따라서:

```text
Assembly JSON
+ Resolver
+ Renderer
+ 현재 Source State
= Compiled Task Context
```

---

## 8. 컨텍스트 배치 순서

컴파일 결과는 원하는 순서로 설계할 수 있습니다.

예시:

```text
1. 사용자 요청 원문
2. 이번 작업의 목표
3. 실제 결과 소비자
4. 절대 지침과 권한 경계
5. 현재 문제 상황
6. 프로젝트의 관련 구조
7. 적용되는 정책
8. 관련 구현과 의존 관계
9. 이미 확정된 결정
10. 승인된 플랜
11. 지금 실행할 작업
12. 성공 조건
13. 검증 방법
14. 출처와 불확실성
```

이를 통해 중요한 요청·제약·플랜이 우연한 Tool 결과 뒤로 밀리는 문제를 크게 줄일 수 있습니다.

다만 배치 순서는 **어텐션과 해석의 우선도를 조정**하는 것이지, 플랫폼의 시스템·개발자 지침보다 높은 권한을 만드는 것은 아닙니다.

---

## 9. Fresh Task HEAD

컴파일된 컨텍스트는 기존 Compiler Session에서 계속 사용하는 것이 아니라 새로운 OpenCode 세션에 최초 입력으로 주입합니다.

```text
Compiler의 조사 대화
        ✕ 전달하지 않음

Assembly JSON으로 렌더링한 Context
        ✓ 새 세션에만 전달
```

새 Task HEAD는 처음부터 다음을 갖습니다.

- 사용자 요청
- 현재 문제의 완결된 모델
- 필요한 프로젝트 지식
- 관련 정책과 구현
- 확정된 결정
- 성공 조건
- 필요한 경우 승인된 플랜

따라서 별도 조사 없이 바로 플래닝이나 실행을 시작할 수 있습니다.

---

## 10. Planning과 Execution의 분리

가장 깨끗한 구조는 한 번만 컴파일하는 것이 아니라 단계마다 새로운 컨텍스트를 만드는 것입니다.

### Planning Context

```text
사용자 요청
+ 문제 구조
+ 관련 프로젝트 정보
+ 정책과 제약
+ 현재 상태
→ Fresh Planning HEAD
```

Planning HEAD는 후보를 비교하고 플랜을 만듭니다. 이 과정에도 반론, 폐기안, 수정 이력이 누적됩니다.

### Execution Context

플랜이 승인되면 Planning Session을 그대로 실행에 사용하지 않습니다.

```text
원래의 깨끗한 문제 컨텍스트
+ 승인된 플랜
+ 실행 시작 시점의 최신 상태
→ Fresh Execution HEAD
```

즉:

```text
Compiler noise
≠ Planning context

Planning noise
≠ Execution context
```

실행 HEAD는 플랜 생성 과정이 아니라 승인된 플랜만 받습니다.

---

## 11. 실행 도중 다시 오염될 때

실행 중에도 Tool 출력과 수정 과정이 쌓입니다. 장기 작업에서는 두 방법을 사용할 수 있습니다.

### Context Patch

정보 하나가 부족한 경우:

```text
Task HEAD
→ 필요한 정보 요청
→ 새 Disposable Compiler
→ 추가 Assembly Fragment 생성
→ 정제된 Context Patch만 삽입
```

### Context Rebuild

컨텍스트가 많이 오염됐거나 방향이 크게 바뀐 경우:

```text
깨끗한 실행 기준선
+ 승인된 변경사항
+ 현재 실제 상태
+ 남은 작업
→ 새로운 Assembly JSON
→ Fresh Execution HEAD
```

중요한 작업에서는 계속 기억하는 것보다 **현재 필요한 판단 상태를 다시 컴파일하는 것**이 더 안정적입니다.

---

## 12. OpenCode SQLite의 역할

OpenCode SQLite DB가 세션 메시지를 보존한다면, 별도 `context-image.md`를 항상 저장할 필요는 없습니다.

```text
Assembly JSON
→ Context 렌더링 및 주입
→ 실제 주입 결과는 OpenCode SQLite에 저장
```

역할은 다음과 같이 나뉩니다.

| 구성요소 | 역할 |
|---|---|
| Compiler Image | 프로젝트를 읽고 탐색하는 구조 지도 |
| Assembly JSON | 무엇을 어떻게 조립할지 선언 |
| Renderer | 실제 Task Context 생성 |
| OpenCode SQLite | 실제로 주입되고 실행된 세션 기록 |
| Hash | 동일성 또는 무결성 확인 |

최소 연결 정보는 남길 수 있습니다.

```json
{
  "compilerImage": "noahchat:v12",
  "assemblyId": "task-20260812-001",
  "openCodeSessionId": "ses_...",
  "injectedMessageId": "msg_...",
  "renderedContextHash": "sha256:..."
}
```

단, SQLite가 정확히 무엇을 저장하는지는 확인해야 합니다.

- 컴파일된 최초 메시지
- 시스템·개발자 지침
- Tool schema
- 런타임 동적 입력
- compaction 전후 메시지

핵심 목적에는 최소한 **우리가 컴파일해 주입한 Task Context 원문**이 보존되면 충분합니다.

---

## 13. Git과 전체 파일 버전 추적을 포기한 경우

수만 개 파일 전체의 과거 버전을 추적하지 않는다면 재현성을 세 종류로 구분해야 합니다.

### 13.1 조립 방법의 재현

```text
같은 Assembly JSON
+ 같은 Compiler Image
→ 같은 위치와 선택 규칙으로 재조립
```

가능합니다.

### 13.2 현재 상태 기준 재조립

원본 파일이 변경됐다면 같은 JSON이 최신 내용을 가져옵니다.

```text
같은 조립 의도
+ 현재 파일 상태
→ 최신 Task Context
```

이것은 과거 입력 복원이 아니라 **현재 상태에 대한 동일 레시피 재실행**입니다.

### 13.3 과거의 정확한 입력 복원

파일이 변경됐고 과거 snapshot이 없다면 Assembly JSON만으로는 불가능합니다.

대신 OpenCode SQLite에 실제 주입된 Context가 남아 있다면 거기서 복원할 수 있습니다.

```text
Assembly JSON
→ 조립 의도와 출처

OpenCode SQLite
→ 당시 실제 입력
```

따라서 Git 없이도 실용적으로 운영할 수 있습니다. 다만 정본의 역할이 분리됩니다.

---

## 14. 무엇이 재현되고 무엇이 재현되지 않는가

### 재현 가능한 것

조건이 갖춰지면 다음을 재현할 수 있습니다.

- 어떤 자료를 선택했는가
- 어떤 순서로 배치했는가
- 어떤 형식으로 렌더링했는가
- Task HEAD가 실제로 받은 최초 컨텍스트
- 같은 최초 컨텍스트에서 새 세션을 시작하는 것

### 자동으로 재현되지 않는 것

동일한 입력이 동일한 출력을 보장하지는 않습니다.

영향 요소:

- 모델과 모델 버전
- 시스템·개발자 지침
- Tool schema
- 샘플링과 추론 설정
- 런타임 환경
- 모델의 비결정성

따라서 이 시스템의 일차 목표는 **동일한 사고 결과**가 아니라 **동일하고 통제된 판단 출발점**입니다.

---

## 15. 이론적 장점

### 15.1 탐색 오염 격리

검색과 도구 사용 과정이 Task HEAD에 전달되지 않습니다.

### 15.2 높은 정보 밀도

현재 판단을 바꾸는 정보만 포함할 수 있습니다.

### 15.3 컨텍스트 순서 통제

사용자 요청, 정책, 플랜, 실행 지침의 배치를 명시적으로 설계할 수 있습니다.

### 15.4 세션의 소모품화

세션이 기억의 정본이 아닙니다.

```text
Project Model
+ Assembly JSON
+ OpenCode DB
```

가 지속되고 HEAD 세션은 필요할 때 새로 만들 수 있습니다.

### 15.5 비교 실험

동일한 Assembly JSON을 기반으로:

- 다른 모델 사용
- 정보 순서 변경
- 특정 문단 추가·제거
- 여러 플랜 생성
- 서로 다른 실행 전략 비교

가 가능합니다.

### 15.6 장기 작업의 재정렬

오염된 세션을 억지로 이어가지 않고 현재 상태를 새 컨텍스트로 다시 컴파일할 수 있습니다.

---

## 16. 핵심 위험

### 16.1 누락 위험

Compiler가 중요한 정보를 선택하지 않으면 Task HEAD는 그 정보가 존재하는지도 모를 수 있습니다.

따라서 가장 큰 위험은 노이즈가 아니라:

> **깨끗하지만 불완전한 컨텍스트**

입니다.

### 16.2 잘못된 구조 지도

Project Compiler Image가 오래되면 잘못된 경로와 권위를 사용할 수 있습니다.

### 16.3 과도한 압축

출처의 미묘한 조건이나 예외가 사라질 수 있습니다. 중요한 부분은 요약보다 원문 fragment를 사용하는 편이 안전합니다.

### 16.4 수백 K 자체의 어텐션 경쟁

모든 내용이 깨끗해도 너무 많으면 서로 경쟁합니다. 목표는 최대 크기가 아니라:

> **작업을 독립적으로 판단할 수 있는 최소 완결 컨텍스트**

여야 합니다.

### 16.5 새 실행 노이즈

초기 조사 노이즈는 없앨 수 있지만 Task HEAD가 실행 중 사용하는 Tool 결과까지 영구히 없앨 수는 없습니다. 장기 작업에서는 patch나 rebuild가 필요합니다.

---

## 17. Compiler 출력 품질 조건

좋은 Assembly JSON은 다음을 만족해야 합니다.

### 완결성

현재 작업을 판단하는 데 필요한 주요 정책, 구현, 의존성, 성공 조건을 포함합니다.

### 관련성

단순히 연관된 정보가 아니라 현재 판단을 바꿀 수 있는 정보만 선택합니다.

### 권위성

주장별로 적절한 정본에서 가져옵니다.

### 현재성

변동 가능성이 있는 것은 live source에서 확인합니다.

### 관계 보존

독립 문단을 나열하는 데 그치지 않고 왜 함께 필요한지 구조적으로 배치합니다.

### 의도 보존

사용자 요청을 요약으로 대체하지 않고 원문을 유지합니다.

### 불확실성 보존

충돌·미확정·누락 가능성을 거짓 확신으로 지우지 않습니다.

### 순서 명시

중요한 판단 기준이 부록이나 도구 출력 뒤로 밀리지 않습니다.

---

## 18. 최소 구현 단위

초기 버전에는 거대한 인프라가 필요하지 않습니다.

```text
1. Project Compiler Image 문서
2. Assembly JSON schema
3. 파일 문단/symbol resolver
4. deterministic renderer
5. Fresh OpenCode session launcher
6. session ID와 assembly ID 연결 기록
```

최초 구현 흐름:

```text
사용자 요청
→ Compiler Session
→ assembly.json
→ render
→ 새 OpenCode 세션 최초 입력으로 주입
→ SQLite session ID 기록
```

그 후 필요에 따라 추가합니다.

- 그래프 fragment resolver
- DB 결과 reference
- 컨텍스트 hash
- Planning/Execution 템플릿
- Context Patch
- Context Rebuild
- compiler-version migration
- 누락 검토기

---

## 19. 이론의 최종 정식화

### 입력

```text
R = 사용자 요청
M = 버전 고정된 프로젝트 구조 모델
S = 현재 접근 가능한 실제 정보
P = 컨텍스트 조립 정책
```

### 컴파일

```text
C(R, M, S, P) → Assembly JSON J
```

### 렌더링

```text
Render(J, S) → Task Context T
```

### 실행

```text
Fresh HEAD(T) → Plan 또는 Execution Result
```

Planning 이후에는:

```text
T
+ 승인된 Plan G
+ 현재 상태 Δ
→ 새로운 Execution Context T′
→ Fresh Execution HEAD
```

---

## 20. 한 문장 정의

> **프로젝트 전체를 읽는 방법을 아는 버전 고정 Compiler가, 작업마다 필요한 실제 정보만 인덱스로 선택한 Assembly JSON을 만들고, 이를 원하는 순서로 렌더링하여 조사 흔적이 없는 fresh HEAD의 초기 판단 상태로 주입하는 아키텍처다.**

더 짧게 말하면:

> **세션 속에서 컨텍스트를 우연히 축적하지 않고, 작업 전에 컨텍스트를 컴파일한다.**

이 이론에서 가장 중요한 산출물은 대용량 프롬프트 자체가 아니라, **그 프롬프트를 의도적으로 조립하는 Assembly JSON**입니다.
