import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CANONICAL_QUICK_TERMINAL, CanonicalQuickStore } from "./canonical-quick-store.mjs";
import { superviseCanonicalQuick } from "./canonical-quick-supervisor.mjs";

const tupleKeys = ["socket", "workspaceId", "tabId", "paneId", "terminalId"];
const sameTuple = (left, right) => tupleKeys.every((key) => left?.[key] === right?.[key]);
const required = (value, message) => { if (!value) throw new TypeError(message); return value; };

/** Creates the host-owned envelope accepted by the inactive quick capability. */
export function createCanonicalQuickContext({ projectRoot, generation, caller, stateRoot, workers } = {}) {
  if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot) || typeof stateRoot !== "string" || !path.isAbsolute(stateRoot)) throw new TypeError("Host project and state roots are required.");
  if (typeof generation !== "string" || !generation || !caller || !tupleKeys.every((key) => typeof caller[key] === "string" && caller[key])) throw new TypeError("A validated host caller and generation are required.");
  if (!workers || Object.getPrototypeOf(workers) !== Object.prototype || !Object.keys(workers).length || !Object.values(workers).every((worker) => typeof worker === "string" && path.isAbsolute(worker))) throw new TypeError("Host worker directories are required.");
  return Object.freeze({ projectRoot: fs.realpathSync(projectRoot), generation, caller: Object.freeze({ ...caller }), stateRoot: path.resolve(stateRoot), workers: Object.freeze({ ...workers }) });
}

export class CanonicalQuickLifecycle {
  constructor({ context, effects, store = new CanonicalQuickStore({ stateRoot: context?.stateRoot }) } = {}) {
    required(context, "A host-created quick context is required.");
    for (const name of ["resolveWorker", "resolveExecution", "launch", "schedule", "wait", "read", "notify", "close"]) required(typeof effects?.[name] === "function", `Host effect ${name} is required.`);
    this.context = context;
    this.effects = effects;
    this.store = store;
    this.supervising = new Set();
  }

  launch({ agent, command, taskId = `qt-${crypto.randomUUID()}` } = {}) {
    if (typeof agent !== "string" || !agent || typeof command !== "string" || !command.trim()) throw new TypeError("A worker and command are required.");
    const agentDir = this.effects.resolveWorker({ agent, context: this.context });
    if (agentDir !== this.context.workers[agent]) throw new TypeError("Host worker resolution is not exact.");
    const execution = this.effects.resolveExecution({ agent, command, context: this.context });
    if (!execution || Object.getPrototypeOf(execution) !== Object.prototype) throw new TypeError("Host execution plan is required.");
    let task = this.store.reserve({ taskId, projectRoot: this.context.projectRoot, generation: this.context.generation, caller: this.context.caller, agent, agentDir, command, execution, status: "reserved", notification: { state: "pending" }, cleanup: { state: "pending" }, createdAt: this.store.clock() });
    try {
      const provenance = this.effects.launch({ task, context: this.context, workerCommand: `${command}\n\nRuntime handoff: write your role-natural completed result and supporting evidence to this exact regular file before finishing: \`${task.handoffFile}\`.` });
      if (!provenance || !tupleKeys.every((key) => typeof provenance[key] === "string" && provenance[key]) || !sameTuple(provenance, { ...this.context.caller, ...provenance }) || provenance.workspaceId !== this.context.caller.workspaceId || typeof provenance.runtimeSessionId !== "string" || !provenance.runtimeSessionId) throw new TypeError("Launch did not return exact task provenance.");
      task = this.store.save({ ...task, status: "running", provenance: { ...provenance, agentDir, launchedAt: this.store.clock() } });
      this.start(task.stateFile);
      return this.result(task);
    } catch (error) {
      task = this.store.save({ ...task, status: "launch_failed", launchError: error.message || String(error), endedAt: this.store.clock() });
      return this.result(task);
    }
  }

  start(stateFile) {
    if (this.supervising.has(stateFile)) return;
    this.supervising.add(stateFile);
    this.effects.schedule(() => Promise.resolve(superviseCanonicalQuick(this, stateFile)).finally(() => this.supervising.delete(stateFile)));
  }

  result(task) { return { taskId: task.taskId, task: task.taskId, status: task.status, stateFile: task.stateFile, handoffFile: task.handoffFile, logFile: task.logFile }; }
  terminal(task, status, patch = {}) {
    // Completion records validated output before delivery. Delivery/cleanup may
    // still replace that provisional terminal status with their durable failure.
    return CANONICAL_QUICK_TERMINAL.has(task.status) && task.status !== "completed"
      ? task
      : this.store.save({ ...task, ...patch, status, endedAt: this.store.clock() });
  }
}
