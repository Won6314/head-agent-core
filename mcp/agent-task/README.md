# agent-task

`runtime-context.mjs` resolves a bound project and supplies request-scoped paths. `host-service.mjs` executes task operations under the active authority generation. `candidate-handler.mjs` adapts MCP calls to the service.

## Host composition

Register projects through the host administration interface, inject the project overlay resolver and launcher into `HostAgentTaskService`, and route `/agent-task` calls through the shared transport. Calls derive caller identity and storage paths from host state; request arguments do not supply them.
