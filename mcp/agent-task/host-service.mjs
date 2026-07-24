import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { RuntimeContextError, requireRuntimeContext, resolveProjectRuntimeContext, runWithRuntimeContext, assertNoSymlinkAncestors } from "./runtime-context.mjs";

const TASK_ID = /^[A-Za-z0-9_-]{1,128}$/;
const TERMINAL = new Set(["completed", "failed", "interrupted", "output_failed", "launch_failed"]);
const fail = (code, message) => { throw new RuntimeContextError(code, message); };
const id = (item) => item?.id || item?.pane_id || item?.tab_id || "";
const snapshotOf = (result) => result?.result?.snapshot || result?.snapshot || result;
const sameCaller = (live, supplied) => ["socket", "workspaceId", "tabId", "paneId"].every((key) => live?.[key] === supplied?.[key]) && (!supplied?.terminalId || live?.terminalId === supplied.terminalId);
export function validateAtomicTemp(temp, root) { assertNoSymlinkAncestors(temp, { trustedRoot: root }); let entry; try { entry = fs.lstatSync(temp); } catch { fail("PATH_ESCAPE", "Atomic temporary file disappeared before rename."); } if (!entry.isFile() || entry.isSymbolicLink() || (entry.mode & 0o777) !== 0o600 || entry.nlink !== 1 || (typeof process.getuid === "function" && entry.uid !== process.getuid())) fail("PATH_ESCAPE", "Atomic temporary file was replaced or has unsafe ownership/mode."); }
function writeAtomic(file, value) { const root = requireRuntimeContext().paths.hostStateRoot; assertNoSymlinkAncestors(file, { trustedRoot: root }); assertNoSymlinkAncestors(path.dirname(file), { trustedRoot: root }); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`; assertNoSymlinkAncestors(temp, { trustedRoot: root }); fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" }); assertNoSymlinkAncestors(file, { trustedRoot: root }); validateAtomicTemp(temp, root); fs.renameSync(temp, file); }
function inside(root, candidate) { const rel = path.relative(root, candidate); return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".."); }
function noSymlink(absolute) { let current = path.parse(absolute).root; for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) { current = path.join(current, segment); if (!fs.existsSync(current)) break; if (fs.lstatSync(current).isSymbolicLink()) fail("PATH_ESCAPE", "Managed paths may not traverse symlinks."); } }

/** Shared candidate lifecycle. It accepts project policy only for agent selection. */
export class HostAgentTaskService {
  constructor({ bindingRegistry, validateCaller, runtime, resolveOverlay, resolveExecution, preflightExecution = () => {}, launcher, clock = () => new Date().toISOString(), write = writeAtomic } = {}) {
    if (!bindingRegistry || typeof bindingRegistry.withActiveAuthority !== "function") fail("MISSING_BINDING_REGISTRY", "A locking generation-aware binding registry is required.");
    if (typeof validateCaller !== "function" || !runtime || typeof resolveOverlay !== "function" || typeof resolveExecution !== "function" || typeof launcher !== "function") fail("INVALID_HOST_SERVICE", "Caller validation, runtime, agent/execution policy, and a host launcher are required.");
    if (typeof preflightExecution !== "function") fail("INVALID_HOST_SERVICE", "Execution preflight must be host-owned."); Object.assign(this, { bindingRegistry, validateCaller, runtime, resolveOverlay, resolveExecution, preflightExecution, launcher, clock, write });
  }
  #withRequest(request, fn) {
    // Absolutely no project/state read occurs before this live Herdr validation.
    const live = this.validateCaller(request?.caller);
    if (!live || !sameCaller(live, request?.caller)) fail("STALE_CALLER", "The supplied Herdr caller is no longer the exact live pane.");
    // Context discovery has no side effect. The re-check below, under the
    // durable lock, fences an old registry/service instance and rotation race.
    const initial = resolveProjectRuntimeContext({ caller: live, cwd: live.cwd, bindingRegistry: this.bindingRegistry });
    return this.bindingRegistry.withActiveAuthority({ ...initial.binding, authorityGeneration: request?.authorityGeneration }, () => {
      const context = resolveProjectRuntimeContext({ caller: live, cwd: live.cwd, bindingRegistry: this.bindingRegistry });
      return runWithRuntimeContext(context, () => fn({ context, live, authorityGeneration: request.authorityGeneration, overlay: this.#overlay(context) }));
    });
  }
  #overlay(context) {
    const candidate = this.resolveOverlay(requireRuntimeContext());
    if (!candidate || typeof candidate.resolveAgent !== "function" || Object.keys(candidate).some((key) => ["taskDir", "logDir", "resultDir", "paths"].includes(key))) fail("INVALID_PROJECT_OVERLAY", "Project overlays may select agents only; state paths are host-derived.");
    const root = context.paths.agentTaskStateDir;
    // Re-check every existing descendant on every request, not only when the
    // host-state root was first registered.
    assertNoSymlinkAncestors(root, { trustedRoot: context.paths.hostStateRoot });
    return Object.freeze({ resolveAgent: candidate.resolveAgent, stateRoot: context.paths.hostStateRoot, taskDir: path.join(root, "quick-tasks"), logDir: path.join(root, "quick-tasks", "logs"), resultDir: path.join(root, "quick-tasks", "results"), journalDir: path.join(root, "quick-tasks", "continuations") });
  }
  #agent(context, overlay, agent) {
    const selected = overlay.resolveAgent(agent, context);
    if (typeof selected !== "string" || !path.isAbsolute(selected)) fail("UNKNOWN_AGENT", "The requested agent is unavailable in this project overlay.");
    const agents = path.join(context.projectRoot, ".claude", "agents");
    noSymlink(agents); noSymlink(selected);
    let canonical; try { canonical = fs.realpathSync(selected); } catch { fail("UNKNOWN_AGENT", "The requested agent directory is unavailable."); }
    if (!inside(fs.realpathSync(agents), canonical) || path.dirname(canonical) !== fs.realpathSync(agents) || !fs.lstatSync(canonical).isDirectory()) fail("AGENT_PATH_ESCAPE", "Agent CWD must be a direct project-owned agent directory.");
    if (fs.statSync(canonical).uid !== fs.statSync(context.projectRoot).uid) fail("AMBIGUOUS_OWNERSHIP", "Agent CWD has unexpected ownership.");
    return canonical;
  }
  #safe(overlay, file) { assertNoSymlinkAncestors(file, { trustedRoot: overlay.stateRoot }); }
  #file(overlay, taskId) { if (!TASK_ID.test(String(taskId || ""))) fail("INVALID_TASK_ID", "A valid exact task ID is required."); const file = path.join(overlay.taskDir, `${taskId}.json`); this.#safe(overlay, file); return file; }
  #load(overlay, taskId) { const stateFile = this.#file(overlay, taskId); this.#safe(overlay, stateFile); let task; try { task = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { fail("TASK_NOT_FOUND", "No exact task state exists in this project."); } if (task.taskId !== taskId || task.stateFile !== stateFile) fail("TASK_STATE_MISMATCH", "Task state is not canonical."); return task; }
  #owned(task, context, generation) { if (task.projectId !== context.manifest.projectId || task.projectRoot !== context.projectRoot || task.workspaceId !== context.workspace.id || task.authorityGeneration !== generation) fail("CROSS_PROJECT_TASK", "Task state is not owned by this active binding."); }
  #ownedReservation(reservation, context, generation, overlay) {
    if (!reservation || reservation.projectId !== context.manifest.projectId || reservation.projectRoot !== context.projectRoot || reservation.workspaceId !== context.workspace.id || reservation.authorityGeneration !== generation || !TASK_ID.test(String(reservation.parentId || "")) || !TASK_ID.test(String(reservation.childId || "")) || reservation.parentFile !== this.#file(overlay, reservation.parentId) || reservation.childFile !== this.#file(overlay, reservation.childId) || !["reserved", "committed"].includes(reservation.status)) fail("CROSS_PROJECT_TASK", "Continuation reservation is not owned by this active binding.");
  }
  #tabPanes(task) { const snapshot = snapshotOf(this.runtime.invoke(task.caller.socket, ["api", "snapshot"])); return (snapshot?.panes || []).filter((pane) => pane.workspace_id === task.workspaceId && pane.tab_id === task.tabId); }
  #onePane(task) { const panes = this.#tabPanes(task); if (panes.length !== 1 || id(panes[0]) !== task.paneId) fail("ONE_PANE_VIOLATION", "Managed task tab does not have exactly its recorded root pane."); }
  #cleanup(task) { try { const panes = this.#tabPanes(task); if (!task.tabId || !task.paneId || !panes.some((pane) => id(pane) === task.paneId)) return false; this.runtime.invokeVoid(task.caller.socket, ["tab", "close", task.tabId]); return true; } catch { return false; } }
  #store(task) { const overlay = { stateRoot: requireRuntimeContext().paths.hostStateRoot }; this.#safe(overlay, task.stateFile); this.write(task.stateFile, task); return task; }
  #execution(input, context, continuation = null) {
    const plan = this.resolveExecution({ agent: input.agent, command: input.command, runtime: input.runtime, model: input.model, reviewMode: input.reviewMode || "", continuation, context });
    if (!plan || !["opencode", "claude"].includes(plan.runtime) || typeof plan.model !== "string" || typeof plan.variant !== "string" || typeof plan.reviewMode !== "string" || plan.rootSessionId != null) fail("INVALID_EXECUTION_POLICY", "Execution policy may not supply a runtime session identity.");
    return Object.freeze({ runtime: plan.runtime, model: plan.model, variant: plan.variant, reviewMode: plan.reviewMode, ...(continuation ? { continuation } : {}) });
  }
  #create(env, input = {}, provenance = {}) {
    const { taskId = `qt-${crypto.randomUUID()}`, agent, command } = input;
    if (!TASK_ID.test(taskId) || typeof command !== "string" || !command.trim()) fail("INVALID_TASK", "A valid task ID and command are required.");
    const agentDir = this.#agent(env.context, env.overlay, agent); const execution = provenance.execution || this.#execution(input, env.context, provenance.continuation || null); this.preflightExecution({ execution, input, context: env.context }); const stateFile = this.#file(env.overlay, taskId);
    this.#safe(env.overlay, stateFile); if (fs.existsSync(stateFile)) fail("DUPLICATE_TASK_ID", "This task ID already exists in the project.");
    const created = this.runtime.invoke(env.live.socket, ["tab", "create", "--workspace", env.context.workspace.id, "--cwd", agentDir, "--label", taskId, "--no-focus"]);
    const tab = created?.result?.tab || created?.tab, pane = created?.result?.root_pane || created?.root_pane;
    const task = { taskId, stateFile, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.authorityGeneration, caller: env.live, tabId: id(tab), paneId: id(pane), terminalId: pane?.terminal_id || pane?.terminalId || "", agent, agentDir, command, execution, status: "submitted", logFile: path.join(env.overlay.logDir, `${taskId}.log`), outputFile: path.join(env.overlay.resultDir, `${taskId}.out`), createdAt: this.clock(), ...provenance };
    const tuple = [task.tabId, task.paneId, task.terminalId].every(Boolean);
    try { if (!tuple) fail("INCOMPLETE_TASK_TAB", "Herdr returned an incomplete task tab tuple."); this.#onePane(task); this.#store(task); const launched = this.launcher({ task, execution, context: env.context, rootPane: { socket: task.caller.socket, workspaceId: task.workspaceId, tabId: task.tabId, paneId: task.paneId, terminalId: task.terminalId } }); if (!launched || !["tabId", "paneId", "terminalId"].every((key) => launched[key] === task[key]) || typeof launched.runtimeRootSessionId !== "string" || !launched.runtimeRootSessionId || (execution.runtime === "opencode" && !/^ses_[A-Za-z0-9_-]+$/.test(launched.runtimeRootSessionId))) fail("INVALID_LAUNCH_IDENTITY", "Launcher did not return exact pane and trusted runtime-session evidence."); this.#onePane(task); return this.#store({ ...task, status: "running", runtimeRootSessionId: launched.runtimeRootSessionId, launch: { ...launched, launchedAt: this.clock() } }); }
    catch (error) {
      const cleanup = task.tabId && task.paneId ? this.#cleanup(task) : false;
      const failure = { ...task, status: "launch_failed", launchError: error.message || String(error), cleanup: cleanup ? "closed" : "incomplete", failedAt: this.clock() };
      if (tuple) { try { this.#store(failure); } catch {} }
      if (!cleanup) fail("CLEANUP_INCOMPLETE", `Launch failed and exact tab cleanup was not provable: ${error.message || error}`);
      throw error;
    }
  }
  create(request, input) { return this.#withRequest(request, (env) => this.#create(env, input)); }
  interrupt(request, taskId) { return this.#withRequest(request, (env) => { const task = this.#load(env.overlay, taskId); this.#owned(task, env.context, env.authorityGeneration); if (TERMINAL.has(task.status) || !["running", "submitted"].includes(task.status)) fail("TASK_NOT_RUNNING", "Only a nonterminal task can be interrupted."); this.#onePane(task); this.runtime.invokeVoid(task.caller.socket, ["pane", "send-keys", task.paneId, "C-c"]); return this.#store({ ...task, status: "interrupted", interruptedAt: this.clock() }); }); }
  complete(request, taskId, { status = "completed" } = {}) { return this.#withRequest(request, (env) => { const task = this.#load(env.overlay, taskId); this.#owned(task, env.context, env.authorityGeneration); if (TERMINAL.has(task.status)) fail("TERMINAL_IMMUTABLE", "Terminal task state cannot be rewritten."); if (!TERMINAL.has(status)) fail("INVALID_TERMINAL_STATUS", "Completion requires a terminal status."); this.#onePane(task); return this.#store({ ...task, status, completedAt: this.clock() }); }); }
  continue(request, parentId, input = {}) { return this.#withRequest(request, (env) => {
    const parent = this.#load(env.overlay, parentId); this.#owned(parent, env.context, env.authorityGeneration); if (!TERMINAL.has(parent.status) || parent.continuationTaskId || parent.continuationReservation) fail("INVALID_CONTINUATION", "Only an uncontinued terminal task may continue.");
    if (["agent", "runtime", "model", "reviewMode", "variant"].some((key) => Object.hasOwn(input, key))) fail("CONTINUATION_OVERRIDE_FORBIDDEN", "Continuation may provide only strategy, command, and child task ID.");
    const strategy = input.strategy; if (!["resume", "fork", "new"].includes(strategy)) fail("INVALID_CONTINUATION", "Continuation strategy must be resume, fork, or new.");
    const prior = parent.execution || {}; if (prior.runtime === "claude" && strategy !== "new") fail("INVALID_CONTINUATION", "Claude permits only strategy=new."); if (["resume", "fork"].includes(strategy) && (!parent.runtimeRootSessionId || prior.runtime !== "opencode" || !/^ses_[A-Za-z0-9_-]+$/.test(parent.runtimeRootSessionId))) fail("INVALID_CONTINUATION", "OpenCode resume/fork require trusted prior root-session evidence.");
    const childId = input.taskId || `qt-${crypto.randomUUID()}`; const journal = path.join(env.overlay.journalDir, `${parentId}--${childId}.json`);
    const reservation = { projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.authorityGeneration, parentId, childId, parentFile: parent.stateFile, childFile: this.#file(env.overlay, childId), status: "reserved", createdAt: this.clock() };
    this.#safe(env.overlay, journal); this.write(journal, reservation); this.#store({ ...parent, continuationReservation: childId });
    const continuation = { strategy, parentTaskId: parentId, sourceRootSessionId: strategy === "new" ? null : parent.runtimeRootSessionId, fork: strategy === "fork" };
    const execution = Object.freeze({ runtime: prior.runtime, model: prior.model, variant: prior.variant, reviewMode: prior.reviewMode, continuation });
    const child = this.#create(env, { taskId: childId, agent: parent.agent, command: input.command || parent.command }, { parentTaskId: parentId, continuationStrategy: strategy, continuation, execution });
    this.#store({ ...parent, continuationTaskId: childId, continuationReservation: null, continuedAt: this.clock() });
    this.#safe(env.overlay, journal); this.write(journal, { ...reservation, status: "committed", committedAt: this.clock() });
    return this.#load(env.overlay, childId);
  }); }
  reconcile(request) { return this.#withRequest(request, (env) => {
    this.#safe(env.overlay, env.overlay.journalDir); let journals = []; try { journals = fs.readdirSync(env.overlay.journalDir).filter((name) => name.endsWith(".json")); } catch {}
    for (const name of journals) { const file = path.join(env.overlay.journalDir, name); this.#safe(env.overlay, file); let j; try { j = JSON.parse(fs.readFileSync(file)); } catch { fail("MALFORMED_CONTINUATION_JOURNAL", "Continuation journal is invalid."); } this.#ownedReservation(j, env.context, env.authorityGeneration, env.overlay); const parent = this.#load(env.overlay, j.parentId); this.#owned(parent, env.context, env.authorityGeneration); this.#safe(env.overlay, j.childFile); const childExists = fs.existsSync(j.childFile); const child = childExists ? this.#load(env.overlay, j.childId) : null; if (child) this.#owned(child, env.context, env.authorityGeneration); if (j.status === "committed") continue; if (!child) this.#store({ ...parent, continuationReservation: null, continuationRepair: { state: "child_missing", childId: j.childId, reconciledAt: this.clock() } }); else { this.#store({ ...parent, continuationTaskId: j.childId, continuationReservation: null, continuedAt: parent.continuedAt || this.clock() }); this.#store({ ...child, parentTaskId: j.parentId }); this.#safe(env.overlay, file); this.write(file, { ...j, status: "committed", repairedAt: this.clock() }); } }
    this.#safe(env.overlay, env.overlay.taskDir); let files = []; try { files = fs.readdirSync(env.overlay.taskDir).filter((name) => name.endsWith(".json")); } catch { return []; }
    return files.map((name) => this.#load(env.overlay, name.slice(0, -5))).map((task) => { this.#owned(task, env.context, env.authorityGeneration); if (!TERMINAL.has(task.status)) { try { this.#onePane(task); } catch { this.#store({ ...task, status: "launch_failed", reconciledAt: this.clock() }); } } return task; });
  }); }
}
