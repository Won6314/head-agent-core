# Problem Definition에서 Accepted Plan Baseline까지

[목차](README.md) · [English](../03-save-load-plan-context.md)

계획은 현재 상태, 필요한 상태, 실제 소비자와 권위 있는 사실을 담은 Problem Definition에서 시작한다. Planner는 Goal을 관찰 가능하게 만들고 그 소비자가 수용에 사용할 Evidence를 기록한다.

```text
Problem Definition
→ Goals/Evidence
→ material alternatives와 사용자 결정
→ Selected Solution
→ 소비 가능한 Result Graph
```

제품, 정책, 아키텍처, 비용, workflow 또는 외부 행동을 실질적으로 바꾸는 대안은 사용자에게 돌려보낸다. 선택된 Solution은 고정 결정과 보존 경계를 기록한다.

Result Graph는 다음 소비자가 출력을 독립적으로 사용할 수 있는 곳에서만 나눈다. 각 Result에는 authoritative input, observable output, consumer, acceptance/representative evidence, dependency, mutation/preservation boundary가 있다. HEAD 맥락과 proof가 연결되면 direct work, 한 번 독립 반환 가능하면 one-shot delegation, 의존 Result에 checkpoint/recovery가 필요하면 durable Run을 선택한다.

Accepted Plan Baseline은 이 관계와 material decision에 대한 Planner의 권위다. semantic Run에서 Runner는 선택된 Result의 Execution Contract를 작성하고 Worker는 Produced Result와 Worker Report/Evidence를 반환한다. Developer는 계약 안의 로컬 해결 방법을, Coder는 완전히 결정된 관찰 가능 계약을 구현한다.
