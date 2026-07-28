# agent-task

`runtime-context.mjs` resolves a bound project and supplies request-scoped paths. `host-service.mjs` executes task operations under the active authority generation. `candidate-handler.mjs` adapts MCP calls to the service. `coordination-kernel.mjs` is an inactive, product-neutral six-tool registry and injected-capability dispatch seam.

## Host composition

Register projects through the host administration interface, inject the project overlay resolver and launcher into `HostAgentTaskService`, and route `/agent-task` calls through the shared transport. Calls derive caller identity and storage paths from host state; request arguments do not supply them.

## Inactive kernel

`CoordinationKernel` is not connected to transport or the current service. A host creates its immutable context with `createCoordinationContext`, including a nonempty explicit set of validated direct worker-role directories (never `head`) and optional bounded policy guidance, then supplies all six explicit handler capabilities.

## Inactive canonical quick lifecycle

`canonical-quick-lifecycle.mjs`, `canonical-quick-store.mjs`, and `canonical-quick-supervisor.mjs` are a separate host-scoped capability. A host supplies a validated context, worker/execution resolution, state root, and launch/wait/read/notify/close effects. The capability reserves contained state, diagnostic, and handoff paths; records exact running provenance; and asynchronously delivers a validated direct handoff once before closing only the proven task location. It is not wired into the kernel, transport, or active service.
