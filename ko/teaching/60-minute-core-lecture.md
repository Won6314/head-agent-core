# 60분 핵심 강의

[HEAD Agent Core (영문)](../../README.md) / [교육](README.md) / 60분 핵심 강의

## 결과

참가자는 시스템의 기원, LLM 문제 모델, 오너십 모델, 컨텍스트 권위, 오래 유지되는 정본, 운영 루프를 연결할 수 있습니다. 이후의 해석으로 쓰이는 `Related theory(관련 이론)`와 `Historical record(역사적 기록)`, `Operational observation(운영 관찰)`을 구분할 수 있습니다.

## 준비

- [통제된 확장 루프](diagrams.md#통제된-확장-루프), [오너십별 컨텍스트](diagrams.md#오너십별-컨텍스트), [오래 유지되는 작업 합의](diagrams.md#오래-유지되는-작업-합의)를 엽니다.
- [도서관 키오스크 파일럿](../learn/08-operation/end-to-end-example.md)은 가상 예시로만 사용합니다.

## 진행 순서

| 시간 | 구간 | 핵심 요점 | 출처 |
| --- | --- | --- | --- |
| 0-5분 | 설정 | HEAD는 자율 스웜이 아니라 통제된 확장을 위한 오너십 모델이다. | [과정 논지 (영문)](../../learn/README.md#course-thesis) |
| 5-12분 | 기원 | 아키텍처는 관찰된 실패를 거치며 진화했으며, 현재 형태가 필연적이었던 것은 아니다. | [기원](../learn/01-origin/README.md) 및 [진화 타임라인](../learn/01-origin/evolution-timeline.md) |
| 12-22분 | 문제 모델 | 검증되지 않은 생성 결과물은 누락과 추측을 이후 단계에서 누적시킬 수 있다. | [한 단계 확장](../learn/02-llm-problem/the-one-step-expansion-rule.md) 및 [통제된 확장 루프](diagrams.md#통제된-확장-루프) |
| 22-32분 | 오너십 | 사용자는 중요한 방향을, HEAD는 전체 결과의 계획과 통합을, 에이전트는 경계가 정해진 로컬 실행을 책임진다. | [의사결정 권한](../learn/03-ownership/decision-rights.md) 및 [사용자는 HEAD하고만 대화한다](../learn/03-ownership/user-talks-only-to-head.md) |
| 32-40분 | 컨텍스트 | 컨텍스트는 양이 아니라 권위, 관련성, 시점, 오너십으로 관리된다. | [오너십별 컨텍스트](../learn/04-context/context-by-ownership.md) 및 [컨텍스트 다이어그램](diagrams.md#오너십별-컨텍스트) |
| 40-48분 | 정본 | 세션 정체성과 전체 런은 역할이 다른 별개의 정본 복구 기록이다. 진행 상황과 이력은 검색을 도울 수 있지만 이를 대체하거나 사용자-HEAD 합의를 덮어쓸 수 없다. | [컨텍스트와 런](../learn/06-canon/context-and-run.md), [취약한 진행 상황과 이력](../learn/06-canon/fragile-progress-and-history.md), [오래 유지되는 작업 합의](diagrams.md#오래-유지되는-작업-합의) |
| 48-56분 | 운영 루프 | HEAD는 근거를 검색하고, 유용할 때 관찰 가능한 결과 하나를 위임하며, 검증하고 통합한 다음 확장한다. | [구성 요소가 함께 작동하는 방식](../learn/07-components/how-the-parts-compose.md) |
| 56-60분 | 성찰 | 참가자는 일반적인 작업 항목 하나의 경계, 근거 게이트, 복구 기록을 식별한다. | [토론 프롬프트](discussion-questions.md#전체-그룹-마무리) |

총 시간: 60분.

## 교육 노트

기원을 설명할 때 과정의 근거 레이블을 유지하세요. `Historical record(역사적 기록)`와 `Operational observation(운영 관찰)`은 뒷받침되었거나 관찰된 것을 설명합니다. `Related theory(관련 이론)`는 원래 의도의 증명이 아니라 사후적인 설명 렌즈입니다.

컨텍스트 구간을 더 많은 자료를 미리 적재하라는 요청으로 바꾸지 마세요. 프로젝트 정본, HEAD의 작업 모델, 워커가 받은 경계가 정해진 과제는 소유자도 다르고 필요한 범위도 다르다는 점이 핵심입니다.

## 권장 슬라이드 순서

1. 과정 논지와 통제된 확장 루프.
2. 하나의 세션에서 전문 역할로 전환되는 짧은 `Historical record(역사적 기록)`.
3. 의사결정 권한과 오너십별 컨텍스트 다이어그램.
4. 오래 유지되는 작업 합의와 구성 요소 루프.
5. 성찰 프롬프트 하나와 최소 다음 행동.

## 토론

[아키텍처와 엔지니어링](discussion-questions.md#아키텍처와-엔지니어링)에서 프롬프트 하나와 [AI 운영](discussion-questions.md#ai-운영)에서 하나를 고르세요. 적용을 위해서는 [120분 워크숍](120-minute-workshop.md)으로 이어가세요.
