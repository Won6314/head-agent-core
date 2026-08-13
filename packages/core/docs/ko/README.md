# HEAD Core 한국어 개요

이 문서 세트는 제품과 무관하게 재사용되는 HEAD Core의 주요 작업 구조를 처음 접하는 사람에게 설명한다.

구현 명세나 설치 가이드가 아니라, 각 요소가 **왜 존재하고 어떻게 함께 작동하는지** 이해하기 위한 개요다. 현재 동작과 세부 계약은 연결된 영문 Core 문서와 실제 프로젝트 소스가 기준이다.

## 읽는 순서

1. [HEAD Core란 무엇인가](01-WHAT-IS-HEAD-CORE.md)
   - 해결하려는 문제, HEAD의 책임, 사용자 경험과 권한 경계
2. [HEAD가 일하는 세 가지 방식](02-WORKING-MODES.md)
   - 직접 작업, Delegate와 Run의 차이 및 선택 기준
3. [HEAD 시스템의 구성 요소](03-SYSTEM-CONCEPTS.md)
   - User, HEAD, Session, Run, Agent, Skill, Procedure와 Host
4. [컨텍스트, 연속성과 검증](04-CONTEXT-CONTINUITY-AND-EVIDENCE.md)
   - 권위 있는 맥락, Canon, 복구, 근거와 완료 판단

## 프로젝트 확장

NoahChat 프로젝트의 HEAD 그래프와 제품 그래프는 Core의 보편 기능이 아니라 프로젝트 소유 확장이다. 현재 NoahChat 작업공간에서는 `docs/system/head-core-overview/README.md`에서 두 그래프의 설명을 이어서 읽을 수 있다.

## 현재 권위 문서

- [Foundations](../FOUNDATIONS.md) — 권한, 컨텍스트, Canon, 위임과 근거
- [User Guide](../USER_GUIDE.md) — 설치 후 사용 방식과 Core 제공 범위
- [Technical Architecture](../TECHNICAL_ARCHITECTURE.md) — 현재 배포·런타임·상태·조정 구조
- [Simple Theory](../../theory/README.md) — 컨텍스트 관리와 설계 배경

이 개요와 실제 동작이 어긋나면 현재 소스와 실행 결과를 확인하고 개요를 갱신한다.
