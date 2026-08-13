# agent-task

`runtime-context.mjs` resolves a bound project and supplies request-scoped paths. `host-service.mjs` executes the direct one-shot task operation under the active authority generation. `candidate-handler.mjs` exposes only that operation on the Core MCP path. `coordination-kernel.mjs` is an inactive, product-neutral six-tool registry and injected-capability dispatch seam.

## Host composition

Register projects through the host administration interface, inject the project overlay resolver and launcher into `HostAgentTaskService`, and route `/agent-task` calls through the shared transport. Calls derive caller identity and storage paths from host state; request arguments do not supply them. The exposed task endpoint contains only `quick_task`; control and wave operations are not part of this lifecycle.

## Inactive kernel

`CoordinationKernel` is not connected to transport or the current service. A host creates its immutable context with `createCoordinationContext`, including a nonempty explicit set of validated direct worker-role directories (never `head`) and optional bounded policy guidance, then supplies all six explicit handler capabilities.
