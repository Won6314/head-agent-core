# HEAD Agent Core

Reusable prompts, procedures, runtime recovery, and host-coordination modules for a HEAD-led agent installation. Canonical distributable source is under `packages/`; legacy component paths remain compatibility links.

## Install and compose

From an extracted generated release, run `./head init <target>` to ensure the user-scoped coordination host, initialize the project, and start its onboarding conversation. OpenCode authentication/model choice, Herdr, and its socket must already exist. The base-release package selection is machine-readable in [release-manifest.json](release-manifest.json).

After the host is healthy, the internal file-only command `head project init <target> [--project-id <id>]` creates and registers a launch-ready generic project without starting onboarding or a live runtime.

## Runtime operation

Install the OpenCode integration with `herdr integration install opencode`. Configure the host daemon with the modules in `mcp/host-coordination/`; expose project agents through the `agent-task` and `agent-comm` MCP paths. Runtime session helpers are in `runtime/`.

### Work items

From a project root, `node runtime/opencode/bin/work-items.mjs open <id> <title> [--source <reference>]` creates a durable item. Use `focus <id> <session>` to preserve that session's latest checkpoint return reference, `complete` to return it, and `list` to view the compact portfolio. The project-local wrapper is `.claude/agents/head/opencode/bin/work-items.mjs`.

## Components

- [HEAD core](head/README.md)
- [Agents](agents/README.md)
- [Skills](skills/README.md)
- [MCP services](mcp/README.md)
