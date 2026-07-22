# Canonical Teaching Diagrams

[HEAD Agent Core](../README.md) / [Teach](README.md) / Canonical Teaching Diagrams

Use these diagrams as the single canonical versions for teaching routes. Link to an anchored diagram instead of copying its Mermaid source into a route or slide notes. The learning pages provide their chapter-specific explanatory diagrams.

## Controlled Expansion Loop

```mermaid
flowchart LR
    U[User direction] --> H[HEAD work model]
    H --> D{Material choice missing?}
    D -->|yes| U
    D -->|no| Q{Separate owner useful?}
    Q -->|yes| A[Bounded Agent outcome]
    Q -->|no| W[HEAD direct outcome]
    A --> E{Direct evidence passes?}
    W --> E
    E -->|no| H
    E -->|yes| I[HEAD verifies and integrates]
    I --> N{Expand further?}
    N -->|yes| H
    N -->|no| O[Verified outcome]
```

Use this to introduce the thesis: expand one coherent step, verify what changed, then make the result eligible to become input to later work. It is a relationship model, not a claim that every task needs an Agent or a formal gate.

Learning sources: [The One-Step Expansion Rule](../learn/02-llm-problem/the-one-step-expansion-rule.md), [Verification Before Expansion](../learn/02-llm-problem/verification-before-expansion.md).

## Decision-Rights Escalation

```mermaid
flowchart LR
    A[Agent encounters a choice] --> B{Within supplied boundary?}
    B -->|yes| L[Agent chooses local method]
    B -->|no| H[HEAD assesses scope]
    H -->|ordinary planning or integration| P[HEAD decides]
    H -->|material direction or policy| U[User decides]
    U --> H
```

Use this when participants confuse a capable Agent with an authorized decision-maker. The Agent makes local execution choices within the supplied boundary without seeking approval and escalates choices that cross it. HEAD owns ordinary planning and integration; the User owns material direction.

Learning source: [Decision Rights](../learn/03-ownership/decision-rights.md).

## Context By Ownership

```mermaid
flowchart TD
    P[Project-owned canon\nfacts, rules, evidence] --> H[HEAD\nwhole outcome and judgment]
    H --> A[Agent\none bounded result]
    A --> E[Execution evidence]
    E --> H
```

Use this to explain that context quality follows authority, relevance, timing, and ownership rather than maximum volume. Project canon remains with its change owner; HEAD composes what the whole outcome needs; an Agent receives the smallest complete context for its result.

Learning sources: [Context By Ownership](../learn/04-context/context-by-ownership.md), [Why More Context Is Not More Intelligence](../learn/02-llm-problem/why-more-context-is-not-more-intelligence.md).

## Durable Work Agreement

```mermaid
flowchart TD
    U[User-fixed direction] --> C[Session identity]
    U --> R[Full run agreement]
    R --> B[Problem, goal, scope, and success]
    R --> D[Decisions, checklist, and assumptions]
    R --> N[Current position, next action, and evidence]
    C --> H[HEAD resumes the whole outcome]
    B --> H
    D --> H
    N --> H
    P[Progress and history\nretrieval only, not authority] -. supports .-> H
```

Use this to distinguish the two canonical recovery records from subordinate retrieval records. Session identity preserves the stable topic and constraints; the full run preserves the user-HEAD work agreement and recovery state. Progress and history can support retrieval but cannot replace either record or override the agreement.

Learning sources: [Context And Run](../learn/06-canon/context-and-run.md), [Fixing The Problem And Goal](../learn/06-canon/fixing-the-problem-and-goal.md), [Fragile Progress And History](../learn/06-canon/fragile-progress-and-history.md).

## Component Composition

```mermaid
flowchart TD
    U[User direction] --> H[HEAD work model]
    C[Shared Core] --> H
    P[Project context and retrieved evidence] --> H
    R[Runtime canon] --> H
    H --> S[Load matching Skill when needed]
    H --> M[Call MCP when needed]
    H --> A[Assign bounded Agent outcome when needed]
    H --> D[Work directly when appropriate]
    S -. procedure guides .-> H
    M --> E[Result and direct evidence]
    A --> E
    D --> E
    E --> H
    H --> I[Verify, integrate, update canon]
```

Use this after the ownership and canon models. Component availability does not grant decision authority, and not every request needs every component.

Learning source: [How The Parts Compose](../learn/07-components/how-the-parts-compose.md).
