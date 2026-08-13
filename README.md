# HEAD Agent Core

Reusable prompts, procedures, runtime recovery, and host-coordination modules for a HEAD-led agent installation. Canonical distributable source is under `packages/`.

## Read first

- [User Guide](packages/core/docs/USER_GUIDE.md) — install, onboard, and use a project.
- [Technical Architecture](packages/core/docs/TECHNICAL_ARCHITECTURE.md) — runtime, state, coordination, and source boundaries.
- [Foundations](packages/core/docs/FOUNDATIONS.md) — the authority, context, continuity, delegation, and evidence model from first principles.

## Install and compose

From an extracted generated release, run `node ./packages/project-init/public-entry.mjs init <target>` to ensure the user-scoped coordination host, initialize the project, and start its onboarding conversation. This is the single public install/init/runtime composition command. OpenCode authentication/model choice, Herdr, and its socket must already exist. The base-release package selection is machine-readable in [release-manifest.json](release-manifest.json).

After the host is healthy, the installed stable command's internal file-only phase `head project init <target> [--project-id <id>]` creates and registers a launch-ready generic project without starting onboarding or a live runtime. It is the public command's phase boundary, not a second public installer.

## Runtime operation

The public composition command installs the required OpenCode integration. The installed host daemon uses the released coordination modules; runtime session helpers in the released `packages/opencode-runtime/runtime/` recover Session/Run context from the initialized project.

### Work items

From a project root, `node ./packages/opencode-runtime/runtime/opencode/bin/work-items.mjs open <id> <title> [--source <reference>]` creates a durable item. Use `focus <id> <session>` to preserve that session's latest checkpoint return reference, `complete` to return it, and `list` to view the compact portfolio. The project-local wrapper is `.claude/agents/head/opencode/bin/work-items.mjs`.

## Components

- [Connected documentation](packages/core/docs/README.md)
- [HEAD core](packages/core/head/README.md)
- [Agents](packages/agents/README.md)
- [Skills](packages/skills/README.md)
- [Procedures](packages/procedures/README.md)
- [MCP services](packages/coordination/mcp/README.md)
