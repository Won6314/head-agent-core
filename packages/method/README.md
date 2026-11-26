# head-method

HEAD가 일하는 방식을 더하는 애드온 플러그인이다. 코어 플러그인 `head-context` 위에 얹어 쓴다. 애드온은 코어의 `research`(조사) 스킬을 가리키고, 코어는 이 애드온에 기대지 않는다.

강제 장치(훅·통과 검사)는 없다. 일의 방향이 정해졌을 때 모델이 읽는 스킬 둘이고, 항목마다 배경(왜)·지침(무엇을)·적용 범위(어디에 쓰고 안 쓰나)를 둔다. 상황에 따른 분기는 스킬을 부르는 설명(description)에만 있다.

| 스킬 | 언제 읽나 | 담은 것 |
|---|---|---|
| `development` | 코드를 쓰거나 고치기 전, 개발을 계획하거나 맡기기 전, 개발 결과를 검수할 때 | 필요한 것만 만든다 / 업무 규칙과 검사는 한곳에서 / 같은 데이터는 한 곳에만 저장 / 결정과 미룬 이유는 주석이 아니라 정본에 / 되풀이되는 실수는 자동 검사나 구조로 / 실제 환경 증거로 완료 확인 / 개발 방향에는 미리 합의할 것만 / 같은 기준으로 검수 |
| `product-graph` | 제품 그래프가 있는 앱에서 기획을 시작하거나 내부를 조사할 때 | 제품 그래프의 의의, 기획 흐름이 곧 그래프라는 것, 정의(노드), 그래프로 시작하고 원본으로 확인하는 법 |

포장은 head-context와 같다. Claude Code는 `.claude-plugin/plugin.json`, Codex는 `.codex-plugin/plugin.json`(`skills: ./skills`), Antigravity는 루트 `plugin.json`을 읽고 셋이 `skills/`를 같이 쓴다. 도구 서버와 훅은 없다.

이번 판은 제품 그래프를 '먼저 보라'까지만 담는다. 그래프를 만들고 작업과 함께 갱신하는 방식은 다음 판에서 다룬다.

## 설치

head-context와 같은 마켓(`Won6314/head-agent-core`)에 있다.

```
/plugin install head-method --marketplace Won6314/head-agent-core
agy plugin install https://github.com/Won6314/head-agent-core/tree/main/packages/method
```
