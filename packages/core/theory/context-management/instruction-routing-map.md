# HEAD Instruction Routing Map

[Back to task instructions](01-instructions-on-demand.md) · [한국어](ko/instruction-routing-map.md)

This map shows how advertised Skills select a top-level workflow and how that workflow reads one exact procedure for the current condition. `HEAD_CORE.md` supplies stable ownership and judgment principles; it is not a file or workflow router.

## Instruction Surfaces

```text
Always loaded principles
└── packages/core/head/HEAD_CORE.md

Advertised workflow surface
└── packages/skills/*/SKILL.md

Condition-selected procedure surface
└── packages/procedures/**/*.md
```

## Overall Routing

```mermaid
flowchart TD
    R["User request"] --> SJ["start-job/SKILL.md"]
    SJ --> S{"advertised Skill descriptions<br/>and current whole-outcome context"}
    S -->|"software or system behavior requires design judgment"| DS["dev-system-shaping/SKILL.md"]
    S -->|"context and result are already sufficient"| M{"select execution ownership"}
    DS --> M
    M -->|"execution remains connected to HEAD context"| DIRECT["Direct HEAD execution"]
    M -->|"one bounded result can return once"| ONCE["delegate-once/SKILL.md"]
    M -->|"accepted whole design needs dependent Results, checkpoints, or recovery"| PLAN["plan-run/SKILL.md"]
    PLAN --> PROCEDURE["one exact plan-run procedure"]
```

## Routing Inside `plan-run`

```mermaid
flowchart TD
    PLAN["plan-run/SKILL.md"] --> CONDITION{"current semantic condition"}
    CONDITION --> PB["Problem Baseline → Plan Draft → Result Graph → Accepted Plan Baseline"]
    PB --> RUNNER["Runner activation and Run initialization"]
    RUNNER --> CONTRACT["prepare-execution-contract.md"]
    CONTRACT --> DISPATCH["dispatch-horizon.md"]
    DISPATCH --> WORKER["Worker Produced Result + Worker Report/Evidence"]
    WORKER --> REVIEW["review-checkpoint.md<br/>saved-Planner Checkpoint review"]
    REVIEW --> APPLY["apply-checkpoint.md"]
    APPLY -->|"CONTINUE or LOCAL_CORRECTION"| CONTRACT
    APPLY -->|"PLAN_CHANGE_REQUIRED"| PLAN
    APPLY -->|"USER_DECISION"| USER["User"]
    APPLY -->|"DONE or FAILED"| FINISH["finish-run.md"]
```

The Accepted Plan Baseline selects Results and checkpoint meaning. The Runner authors Execution Contracts and dispatches only selected work. Workers produce Results and Report/Evidence; they do not supply planning authority. A local correction is an explicit delta against its original frozen Execution Contract.

## Role Index

| Instruction surface | Role | Selection condition |
|---|---|---|
| `packages/skills/start-job/SKILL.md` | Work-start card | Any new work |
| `packages/skills/plan-run/SKILL.md` | Route durable Plan production | Dependent Results, checkpoints, or recovery are needed |
| `packages/procedures/plan-run/planning/` | Planner: preserve Problem Baseline, form Plan Draft and Result Graph, accept Plan Baseline, activate Runner | Current planning transition |
| `packages/procedures/plan-run/results/` | Runner: select horizon, prepare Execution Contract, dispatch horizon | Selected Result or horizon operation |
| `packages/procedures/plan-run/workers/` | Worker readiness | Result selects a worker class |
| `packages/procedures/plan-run/run/` | Run initialization, saved-Planner checkpoint review, checkpoint application, recovery, stopping, and finishing | Current Run lifecycle transition |

## Loaded Volume

```text
Always loaded = Core and project base instructions
Advertised = genuine top-level Skills
Conditionally loaded = one Skill body + one exact procedure + only authority/evidence that can change it
```

Load `start-job` before any work. Then load the matching work-type skill for that class of work. Always-on Core is not a substitute once work context has grown. Do not re-inject Core into the system prefix.
