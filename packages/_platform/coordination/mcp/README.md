# MCP services

Host-coordinated MCP interfaces for task execution and agent communication.

## Composition

Create one host composition with `mcp/host-coordination/composition.mjs`, inject the Herdr, policy, launcher, role, target, and delivery adapters, then expose the transport's `/agent-task` and `/agent-comm` paths. Use `stdio-bridge.mjs` from an agent runtime when a local stdio connection is required.

## Interfaces

- [agent-task](agent-task/README.md) creates and controls bounded worker operations.
- [agent-comm](agent-comm/README.md) delivers role-scoped messages.
- [host-coordination](host-coordination/README.md) provides the production host process and administration modules.
