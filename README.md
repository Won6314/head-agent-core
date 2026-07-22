# HEAD Agent Core

HEAD Agent Core is the project-independent layer of a HEAD system. It separates portable reasoning and execution infrastructure from the facts, policies, integrations, and specialists owned by an individual project.

This repository explains why each layer exists and links to its canonical implementation. It does not copy or publish a project's internal context.

## Architecture

```text
HEAD
├─ Shared
│  ├─ Core
│  ├─ MCP
│  │  └─ agent-task
│  ├─ Skills
│  │  ├─ agent-reply
│  │  ├─ browser-query
│  │  ├─ delegate-task
│  │  ├─ restore-session
│  │  ├─ start-dev-work
│  │  └─ start-work
│  └─ Agents
│     ├─ Developer Core
│     └─ Validator Core
└─ Project Layer
   ├─ Core
   ├─ Additional Context
   ├─ MCP
   ├─ Skills
   └─ Agents
```

## Navigate

| Layer | Purpose |
| --- | --- |
| [Shared Core](head/README.md) | Stable HEAD ownership, reasoning, and context principles. |
| [Shared MCP](mcp/README.md) | Project-independent callable coordination interfaces. |
| [Shared Skills](skills/README.md) | Procedures that remain valid across projects. |
| [Shared Agents](agents/README.md) | Reusable worker roles and authority boundaries. |
| [Project Layer](projects/README.md) | Extension points for project-owned rules, knowledge, integrations, and specialists. |

## Reading Model

Every level in this repository is a page. Category pages explain why the category exists and how it is separated from neighboring layers. Item pages explain the item's architectural role, delivery model, ownership boundary, and canonical source.

The documentation deliberately avoids duplicating instruction bodies or project context. Follow the canonical-source links only when the current task requires implementation detail.

## Shared Or Project-Owned

An element is shared when its purpose, authority boundary, inputs, and success criteria remain valid after removing project names, paths, domain facts, credentials, and specialist routing. Everything else belongs to the project layer.
