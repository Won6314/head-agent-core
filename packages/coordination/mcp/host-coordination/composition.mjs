import fs from "node:fs";
import path from "node:path";
import { createHostBindingRegistry, findCanonicalProjectRoot } from "../agent-task/runtime-context.mjs";
import { HostAgentTaskService } from "../agent-task/host-service.mjs";
import { HostAgentCommService } from "../agent-comm/host-service.mjs";
import { createHostCoordinationTransport, createHostHttpServer } from "./transport.mjs";
import { createExactHeadTaskNotifier } from "./task-notifier.mjs";
/** Non-listening production composition root. Deployment alone decides listen(). */
export function createHostDaemon({ hostStateRoot, herdr, launcher, resolveExecution, preflightExecution, resolveOverlay, resolveRole, notifyTask, discoverTools, hostIdentity, wait, now } = {}) {
  if (!herdr || typeof herdr.validateCaller !== "function" || typeof launcher !== "function" || typeof resolveExecution !== "function" || typeof resolveOverlay !== "function" || typeof resolveRole !== "function") throw new TypeError("Herdr, launcher, policy, overlay, and role adapters are required.");
  const bindingRegistry = createHostBindingRegistry({ hostStateRoot });
  const taskService = new HostAgentTaskService({ bindingRegistry, validateCaller: herdr.validateCaller, runtime: herdr, launcher, resolveExecution, preflightExecution, resolveOverlay, notify: notifyTask || ((notice) => createExactHeadTaskNotifier({ runtime: herdr })(notice)) });
  const commService = new HostAgentCommService({ bindingRegistry, validateCaller: herdr.validateCaller, resolveRole, runtime: herdr, wait, now });
  const deriveRole = (live) => {
    const projectRoot = findCanonicalProjectRoot(live.cwd);
    const agents = fs.realpathSync(path.join(projectRoot, ".claude", "agents"));
    const cwd = fs.realpathSync(live.cwd);
    const role = path.basename(cwd), entry = fs.lstatSync(cwd);
    if (path.dirname(cwd) !== agents || !/^[a-z][a-z0-9_]{0,63}$/.test(role) || !entry.isDirectory() || entry.isSymbolicLink() || (typeof process.getuid === "function" && entry.uid !== process.getuid())) throw new TypeError("The live CWD is not a direct project agent boundary.");
    return role;
  };
  const attachLiveCaller = (caller) => {
    const live = herdr.validateCaller(caller);
    if (!live || ["socket", "workspaceId", "tabId", "paneId"].some((key) => live[key] !== caller?.[key])) throw new TypeError("The caller is not the exact validated Herdr caller.");
    const hostCaller = Object.freeze({ ...live, role: deriveRole(live) });
    return hostCaller.role === "head" ? bindingRegistry.attachHead(hostCaller, { isLive: (active) => {
      const current = herdr.validateCaller(active);
      return !!current && ["socket", "workspaceId", "tabId", "paneId", "terminalId", "cwd"].every((key) => current[key] === active[key]);
    } }) : bindingRegistry.attachRole(hostCaller);
  };
  const transport = createHostCoordinationTransport({ taskService, commService, bindingRegistry, validateCaller: herdr.validateCaller, attachLiveCaller, discoverTools, hostIdentity });
  return Object.freeze({
    bindingRegistry, taskService, commService, transport,
    registerProject: (input) => bindingRegistry.register(input),
    attachLiveCaller,
    initializeEndpoint: (endpoint, caller) => {
      if (!["agent-task", "agent-comm"].includes(endpoint)) throw new TypeError("Only agent-task and agent-comm endpoints exist.");
      const authority = attachLiveCaller(caller);
      return Object.freeze({ endpoint, projectId: authority.projectId, projectRoot: authority.projectRoot, authorityGeneration: authority.authorityGeneration });
    },
    createServer: (options) => createHostHttpServer({ transport, ...options }),
  });
}
