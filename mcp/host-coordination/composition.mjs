import { createHostBindingRegistry } from "../agent-task/runtime-context.mjs";
import { HostAgentTaskService } from "../agent-task/host-service.mjs";
import { HostAgentCommService } from "../agent-comm/host-service.mjs";
import { createHostCoordinationTransport, createHostHttpServer } from "./transport.mjs";
/** Non-listening production composition root. Deployment alone decides listen(). */
export function createHostDaemon({ hostStateRoot, herdr, launcher, resolveExecution, preflightExecution, resolveOverlay, resolveRole, verifyTarget, nativeDeliver, terminalDeliver, discoverTools, hostIdentity, wait, now } = {}) {
  if (!herdr || typeof herdr.validateCaller !== "function" || typeof launcher !== "function" || typeof resolveExecution !== "function" || typeof resolveOverlay !== "function" || typeof resolveRole !== "function" || typeof verifyTarget !== "function") throw new TypeError("Herdr, launcher, policy, overlay, role, and target adapters are required.");
  const bindingRegistry = createHostBindingRegistry({ hostStateRoot });
  const taskService = new HostAgentTaskService({ bindingRegistry, validateCaller: herdr.validateCaller, runtime: herdr, launcher, resolveExecution, preflightExecution, resolveOverlay });
  const commService = new HostAgentCommService({ bindingRegistry, validateCaller: herdr.validateCaller, resolveRole, verifyTarget, nativeDeliver, terminalDeliver, wait, now });
  const transport = createHostCoordinationTransport({ taskService, commService, bindingRegistry, validateCaller: herdr.validateCaller, discoverTools, hostIdentity });
  return Object.freeze({ bindingRegistry, taskService, commService, transport, createServer: (options) => createHostHttpServer({ transport, ...options }) });
}
