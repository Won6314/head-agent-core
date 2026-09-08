# agent-task

`runtime-context.mjs` resolves a bound project and supplies request-scoped paths. `host-service.mjs` executes direct one-shot work and Core-owned plan-run HEAD anchor operations under the active authority generation. `candidate-handler.mjs` exposes those operations on the Core MCP path. `coordination-kernel.mjs` is an inactive product-neutral registry and injected-capability dispatch seam.

## Host composition

Register projects through the host administration interface, inject the project overlay resolver and launcher into `HostAgentTaskService`, and route `/agent-task` calls through the shared transport. Calls derive caller identity and storage paths from host state; request arguments do not supply them. The exposed task endpoint contains `quick_task`, `save_head`, `load_head`, and `migrate_head`. Saved HEAD records and migration receipts live in owner-private host state; session IDs are never returned by the public operations.

## Inactive kernel

`CoordinationKernel` is not connected to transport or the current service. A host creates its immutable context with `createCoordinationContext`, including a nonempty explicit set of validated direct worker-role directories (never `head`) and optional bounded policy guidance, then supplies all six explicit handler capabilities.
