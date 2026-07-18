# HEAD Agent Core

Canonical, project-independent operating policy and workflow skills for the HEAD-agent system.

Projects add their own repository boundaries, domain policy, context, specialist skills, MCP capabilities, credentials, and session state. Shared files must not contain project names, project paths, product facts, or project-specific worker routing.

## Shared Surface

```text
head/HEAD_CORE.md
agents/developer/DEVELOPER_CORE.md
agents/validator/VALIDATOR_CORE.md
skills/agent-reply/SKILL.md
skills/delegate-task/SKILL.md
skills/delegate-task/workflow/delegate-task.md
skills/restore-session/SKILL.md
skills/start-work/SKILL.md
```

## Extension Rule

Remove the project name. If purpose, authority boundary, inputs, and success criteria remain the same, the element is shared. Otherwise it belongs in the project overlay.

Same-name skill inheritance is not used. Add small project preconditions through project instructions and use a distinct project skill when the workflow meaning changes.

## Update Contract

Projects tracking `main` receive shared changes on their next fresh runtime after this checkout is updated. Existing processes are not assumed to hot-reload startup instructions or skills.

## Native Installation

Claude loads the HEAD core through a project HEAD rules symlink. OpenCode loads the same file through its `instructions` list. Claude and OpenCode discover shared skills through user-level skill symlinks.

```bash
ln -s "$HOME/.local/share/head-agent-core/head/HEAD_CORE.md" \
  "<HEAD_ROOT>/.claude/rules/head-core.md"

ln -s "$HOME/.local/share/head-agent-core/skills/agent-reply" \
  "$HOME/.claude/skills/agent-reply"
ln -s "$HOME/.local/share/head-agent-core/skills/delegate-task" \
  "$HOME/.claude/skills/delegate-task"
ln -s "$HOME/.local/share/head-agent-core/skills/restore-session" \
  "$HOME/.claude/skills/restore-session"
ln -s "$HOME/.local/share/head-agent-core/skills/start-work" \
  "$HOME/.claude/skills/start-work"
```

Add this OpenCode instruction before the local project instructions:

```json
"~/.local/share/head-agent-core/head/HEAD_CORE.md"
```

Project-local same-name skill copies must be absent or they may shadow the user-level canon.

Developer and validator agent directories use the same native pattern: a role-specific `.claude/rules/*-core.md` symlink for Claude and the corresponding shared file in local OpenCode `instructions`.
