# HEAD Agent Core

Reusable prompts, procedures, runtime recovery, and host-coordination modules for a HEAD-led agent installation.

## Install and compose

Keep this repository available to the project that supplies its own `CLAUDE.md`, agent overlays, and host configuration. Load `head/HEAD_CORE.md` for HEAD, select an agent prompt from `agents/`, and load a matching procedure from `skills/` on demand.

## Runtime operation

Install the OpenCode integration with `herdr integration install opencode`. Configure the host daemon with the modules in `mcp/host-coordination/`; expose project agents through the `agent-task` and `agent-comm` MCP paths. Runtime session helpers are in `runtime/`.

## Components

- [HEAD core](head/README.md)
- [Agents](agents/README.md)
- [Skills](skills/README.md)
- [MCP services](mcp/README.md)
