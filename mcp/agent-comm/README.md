# agent-comm

`host-service.mjs` provides project-scoped inbox, reply, wait, and delivery operations. `candidate-handler.mjs` adapts the MCP interface to that service.

## Host composition

Inject role resolution, recipient targets, and delivery adapters through the host composition, register project bindings, and route `/agent-comm` through the shared transport. Caller identity, target selection, and state paths are derived from host authority rather than MCP arguments.
