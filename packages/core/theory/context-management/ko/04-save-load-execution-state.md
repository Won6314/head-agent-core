# Semantic Run 복구와 Checkpoint 판단

[목차](README.md) · [English](../04-save-load-execution-state.md)

semantic Run은 canonical execution-state snapshot이나 complete change ledger를 만들지 않고 정확한 위치를 복구한다.

`run.json`은 machine-only pointer file이다. format/identity와 사람이 읽는 `run.md`, 최신 Checkpoint, 현재 Execution Contract 경로만 담는다. 복구는 이 regular file만 정확히 해석하며 invalid pointer, path escape, malformed content에서 fail closed한다.

```text
pointer-only run.json
→ run.md + 최신 Checkpoint + 현재 Contract
→ 정확한 다음 Execution Contract
```

Runner는 dispatch 전에 Execution Contract를 작성한다. frozen Contract는 Worker에게 Result의 authoritative input, output, consumer, mutation/preservation boundary, representative proof를 준다. Worker는 Produced Result와 Worker Report/Evidence를 반환한다.

저장된 Planner는 Checkpoint 검토에서 `runPointerFile`, frozen Contract, Worker Report/Evidence를 받는다. Planner는 이미 Accepted Plan Baseline을 소유하므로 Plan file을 받지 않는다. Evidence는 Plan-level 판단을 지원하며 artifact, Git, log 검사는 근거가 부족하거나 모순되거나 현재 상태 확인이 필요할 때만 한다.

Checkpoint 적용은 pointer를 다음 Contract, correction delta 또는 terminal `DONE`/`FAILED`로 전진시킨다. grandfathered legacy Run은 automatic migration 없이 기존 recovery로 유지된다.
