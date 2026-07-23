# Learn HEAD

[HEAD Agent Core](../README.md) / Learn | [한국어](../ko/learn/README.md)

This course explains why HEAD Agent Core exists, how its design changed through operational failure, and how its parts compose into a controlled way of working with LLMs.

It is written for developers, product managers, designers, and AI operators who need to coordinate work that is too long, consequential, or context-heavy for a single unstructured conversation.

## Choose A Depth

This is a course, not a prerequisite checklist. Use the route that matches your current question:

| Need | Route |
| --- | --- |
| A quick mental model | Use the [20-Minute Introduction](../teaching/20-minute-introduction.md). |
| The core operating model | Read `02` LLM Problem, `03` Ownership, `04` Context, `06` Canon, then `08` Operation. |
| The complete design story | Read all 11 chapters in order, including history, rejected alternatives, evolution, and adoption limits. |
| Exact current contracts | Leave the course and use the [implementation reference](../head/README.md). |

## Course Thesis

The whole course can be read as one design question: **how should context be assembled for the owner making the next decision?** Roles, Core principles, project indexes, Skills, MCP contracts, bounded Agent briefs, and runtime canon are not separate inventions. They are different answers to that context-control problem.

Context control does not mean supplying the most material. It means making the right authority available to the right owner at the right time, while keeping irrelevant history and accidental assumptions out.

HEAD is not an attempt to make an autonomous swarm. It is an ownership model for controlled expansion:

```text
User fixes direction and material decisions
                    |
                    v
HEAD builds the work model and preserves the whole outcome
                    |
                    v
One bounded Agent owns one coherent result
                    |
                    v
HEAD verifies and integrates before the result expands further
```

The system rests on four claims:

1. An LLM can elaborate one clear step well, but unchecked outputs become unstable inputs when expansion continues downstream.
2. Context quality depends on authority, relevance, timing, and ownership, not maximum volume.
3. The user's problem, goal, scope, and success conditions must remain canonical outside lossy model summaries.
4. Portable behavior should come from generative principles; detailed procedures and project facts should load only when they are relevant.

## Full Course

- `01` [Origin: How The System Grew](01-origin/README.md)
- `02` [The LLM Problem Model](02-llm-problem/README.md)
- `03` [Ownership: User, HEAD, and Bounded Agents](03-ownership/README.md)
- `04` [Context: A Governed Working Set](04-context/README.md)
- `05` [General Rules: Principles Instead Of An Endless Deny List](05-general-rules/README.md)
- `06` [Canon: Preserving The Work Agreement](06-canon/README.md)
- `07` [Components: The Parts Of A Controlled System](07-components/README.md)
- `08` [Operation: From Request To Verified Result](08-operation/README.md)
- `09` [Decisions: Rejected Alternatives And Trade-Offs](09-decisions/README.md)
- `10` [Evolution: What Evidence Changed](10-evolution/README.md)
- `11` [Adoption: Use Only What The Work Needs](11-adoption/README.md)

## Two Documentation Paths

The learning path explains design intent and reasoning. The existing repository pages are the reference path for current shared contracts:

- [Shared Core](../head/README.md)
- [Shared MCP](../mcp/README.md)
- [Shared Skills](../skills/README.md)
- [Shared Agents](../agents/README.md)
- [Project Layer](../projects/README.md)

The learning pages do not copy private project context or reproduce full instruction bodies. They explain why a layer exists, what problem it addresses, and how it relates to the rest of the system.

## Evidence Labels

The course separates four kinds of claim:

| Label | Meaning |
| --- | --- |
| Historical record | Supported by repository history or archived system documents. |
| Operational observation | Repeatedly observed while running the system, but not claimed as a universal law. |
| Generalized failure | A public-safe reconstruction with project identity and internal details removed. |
| Related theory | An established idea that helps explain the design, sometimes identified retrospectively. |

This distinction matters. The current architecture was not inevitable, and a useful theory should clarify the evidence rather than rewrite the history.

## Start

Begin with [From One Session To Many Roles](01-origin/from-one-session-to-many-roles.md).
