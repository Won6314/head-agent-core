# Host coordination

Production host modules for project binding, MCP transport, lifecycle control, and Herdr/OpenCode integration.

## Compose and operate

Use `composition.mjs` to assemble a non-listening host with injected Herdr, policy, launcher, role, target, and delivery adapters. `transport.mjs` exposes `/agent-task` and `/agent-comm`; `stdio-bridge.mjs` connects agent runtimes. `daemon-entry.mjs` and `daemon-control.mjs` run the detached loopback process. `admin.mjs` and `admin-cli.mjs` register, inspect, and rotate project bindings.

`herdr-adapter.mjs`, `real-herdr-cli-adapter.mjs`, `worker-launcher.mjs`, `isolated-opencode-runtime.mjs`, and `policy-adapters.mjs` are the production integration boundaries. Supply absolute host configuration and trusted adapters; the modules fail closed when required authority is absent.
