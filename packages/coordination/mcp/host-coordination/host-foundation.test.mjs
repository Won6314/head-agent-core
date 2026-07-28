import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHostDaemon } from "./composition.mjs";
import { createRealHerdrCliAdapter } from "./real-herdr-cli-adapter.mjs";
import { createExactHeadTaskNotifier } from "./task-notifier.mjs";
import { resolveConfiguredOpenCodeBinary } from "./worker-launcher.mjs";
import { RuntimeContextError } from "../agent-task/runtime-context.mjs";

function project(root, projectId) {
  for (const role of ["head", "developer"]) fs.mkdirSync(path.join(root, ".claude", "agents", role), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(root, ".claude", "head-runtime.json"), `${JSON.stringify({ version: 1, projectId })}\n`, { mode: 0o600 });
}
function location(root, role, workspaceId) { return { socket: "fake-socket", workspaceId, tabId: `${workspaceId}-${role}-tab`, paneId: `${workspaceId}-${role}-pane` }; }
function headers(value, extra = {}) { return { "x-head-herdr-socket": value.socket, "x-head-herdr-workspace-id": value.workspaceId, "x-head-herdr-tab-id": value.tabId, "x-head-herdr-pane-id": value.paneId, ...extra }; }
function initialize(handler, value, extra) { return handler({ jsonrpc: "2.0", id: 1, method: "initialize" }, headers(value, extra)); }

test("project-only registration derives and fences host authority through both production endpoint transports", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "head-host-foundation-"));
  const hostStateRoot = path.join(temporary, "host-state"); fs.mkdirSync(hostStateRoot, { mode: 0o700 });
  const one = path.join(temporary, "one"), two = path.join(temporary, "two"); project(one, "one"); project(two, "two");
  const panes = new Map(), head = location(path.join(one, ".claude", "agents", "head"), "head", "head-workspace"), worker = location(path.join(one, ".claude", "agents", "developer"), "developer", "worker-workspace"), competing = location(path.join(one, ".claude", "agents", "head"), "head", "other-head-workspace"), foreign = location(path.join(two, ".claude", "agents", "head"), "head", "foreign-workspace");
  for (const [value, cwd] of [[head, path.join(one, ".claude", "agents", "head")], [worker, path.join(one, ".claude", "agents", "developer")], [competing, path.join(one, ".claude", "agents", "head")], [foreign, path.join(two, ".claude", "agents", "head")]]) panes.set(value.paneId, { ...value, terminalId: `${value.paneId}-terminal`, cwd });
  let launches = 0, validations = 0;
  const herdr = { validateCaller: (value) => { validations += 1; const pane = panes.get(value?.paneId); return pane ? { socket: pane.socket, workspaceId: pane.workspaceId, tabId: pane.tabId, paneId: pane.paneId, terminalId: pane.terminalId, cwd: pane.cwd } : null; } };
  const daemon = createHostDaemon({ hostStateRoot, herdr, launcher: () => { launches += 1; }, resolveExecution: () => ({}), resolveOverlay: () => ({ resolveAgent: () => "" }), resolveRole: ({ live }) => path.basename(live.cwd), verifyTarget: () => null });
  const registration = daemon.registerProject({ projectId: "one", projectRoot: one });
  assert.deepEqual(Object.keys(registration).sort(), ["projectId", "projectRoot"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(hostStateRoot, "bindings.json"), "utf8")), [registration]);

  const taskInit = await initialize(daemon.transport.task, head, { role: "developer", authorityGeneration: "caller-controlled" });
  assert.ok(taskInit.result, JSON.stringify(taskInit));
  const taskSession = taskInit.result.sessionId;
  const commInit = await initialize(daemon.transport.comm, head);
  const commSession = commInit.result.sessionId;
  const taskRecord = daemon.transport.task({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { "mcp-session-id": taskSession });
  const commRecord = daemon.transport.comm({ jsonrpc: "2.0", id: 3, method: "tools/list" }, { "mcp-session-id": commSession });
  assert.ok((await taskRecord).result.tools.length && (await commRecord).result.tools.length);
  const generation = daemon.bindingRegistry.resolve({ workspaceId: head.workspaceId, projectId: "one", projectRoot: one }).authorityGeneration;
  assert.match(generation, /^[A-Za-z0-9_-]{32,}$/);
  const workerInit = await initialize(daemon.transport.comm, worker, { role: "head", authorityGeneration: "forged" });
  const workerGeneration = daemon.bindingRegistry.resolve({ workspaceId: worker.workspaceId, projectId: "one", projectRoot: one }).authorityGeneration;
  assert.equal(workerGeneration, generation); assert.ok(workerInit.result.sessionId);
  const competingInit = await initialize(daemon.transport.task, competing);
  assert.equal(competingInit.error.data.code, "COMPETING_AUTHORITY");
  const foreignInit = await initialize(daemon.transport.task, foreign);
  assert.equal(foreignInit.error.data.code, "UNREGISTERED_PROJECT");
  panes.delete(head.paneId);
  const rotated = await initialize(daemon.transport.task, competing);
  const nextGeneration = daemon.bindingRegistry.resolve({ workspaceId: competing.workspaceId, projectId: "one", projectRoot: one }).authorityGeneration;
  assert.notEqual(nextGeneration, generation); assert.ok(rotated.result.sessionId);
  panes.set(head.paneId, { ...head, terminalId: `${head.paneId}-terminal`, cwd: path.join(one, ".claude", "agents", "head") });
  const stale = await daemon.transport.task({ jsonrpc: "2.0", id: 4, method: "tools/list" }, { "mcp-session-id": taskSession });
  assert.equal(stale.error.data.code, "STALE_AUTHORITY_GENERATION");
  assert.equal(launches, 0); assert.ok(validations > 0);
});

test("configured realpaths prove OpenCode and Herdr consumed capabilities without prefix or version pins", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "head-runtime-capability-"));
  const supported = path.join(temporary, "custom-runtime"); fs.writeFileSync(supported, "#!/bin/sh\nprintf '{\\\"ok\\\":true}\\n'\n", { mode: 0o700 });
  assert.equal(resolveConfiguredOpenCodeBinary({ executable: supported }), fs.realpathSync(supported));
  const incomplete = path.join(temporary, "incomplete-runtime"); fs.writeFileSync(incomplete, "#!/bin/sh\n[ \"$2\" = config ] && exit 1\nprintf '{\\\"ok\\\":true}\\n'\n", { mode: 0o700 });
  assert.throws(() => resolveConfiguredOpenCodeBinary({ executable: incomplete, execFileSync: childProcess.execFileSync }), (error) => error instanceof RuntimeContextError && error.code === "MISSING_RUNTIME_CAPABILITY");
  const socket = path.join(temporary, "configured-herdr.sock"), server = net.createServer(); await new Promise((resolve) => server.listen(socket, resolve));
  const herdr = path.join(temporary, "outside-any-prefix"); fs.writeFileSync(herdr, "#!/bin/sh\n", { mode: 0o700 });
  const snapshot = { protocol: 17, version: "any-unpinned-version", workspaces: [{ workspace_id: "workspace" }], tabs: [{ workspace_id: "workspace", tab_id: "tab" }], panes: [{ workspace_id: "workspace", tab_id: "tab", pane_id: "pane", terminal_id: "terminal", cwd: temporary }] };
  const exec = () => JSON.stringify({ result: { snapshot } });
  assert.equal(createRealHerdrCliAdapter({ socketPath: socket, herdrPath: herdr, execFileSync: exec }).socket, fs.realpathSync(socket));
  assert.throws(() => createRealHerdrCliAdapter({ socketPath: socket, herdrPath: herdr, execFileSync: () => JSON.stringify({ result: { snapshot: { ...snapshot, protocol: 99 } } }) }), (error) => error instanceof RuntimeContextError && error.code === "INVALID_HERDR_SNAPSHOT");
  await new Promise((resolve) => server.close(resolve));
});

test("production Herdr waiting yields to timer and tool work before exact done observation", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "head-herdr-wait-"));
  const socket = path.join(temporary, "configured-herdr.sock"), server = net.createServer(); await new Promise((resolve) => server.listen(socket, resolve));
  const herdr = path.join(temporary, "herdr"); fs.writeFileSync(herdr, "#!/bin/sh\n", { mode: 0o700 });
  let done = false;
  const snapshot = () => ({ protocol: 17, workspaces: [{ workspace_id: "workspace" }], tabs: [{ workspace_id: "workspace", tab_id: "tab" }], panes: [{ workspace_id: "workspace", tab_id: "tab", pane_id: "pane", terminal_id: "terminal", cwd: temporary, agent: "opencode", agent_session: { source: "herdr:opencode", value: "ses_worker" }, agent_status: done ? "done" : "working" }] });
  const adapter = createRealHerdrCliAdapter({ socketPath: socket, herdrPath: herdr, execFileSync: () => JSON.stringify({ result: { snapshot: snapshot() } }) });
  let settled = false;
  const waiting = adapter.waitDone({ socket: adapter.socket, workspaceId: "workspace", tabId: "tab", paneId: "pane", terminalId: "terminal", sessionId: "ses_worker" }, { timeoutMs: 100, pollMs: 10 }).then(() => { settled = true; });
  const timer = new Promise((resolve) => setTimeout(resolve, 0));
  const tool = new Promise((resolve) => setImmediate(() => resolve(adapter.snapshot())));
  await Promise.all([timer, tool]); assert.equal(settled, false); done = true; await waiting;
  await new Promise((resolve) => server.close(resolve));
});

test("default notifier revalidates the exact caller and sends text before Enter", async () => {
  const caller = { socket: "socket", workspaceId: "workspace", tabId: "tab", paneId: "pane", terminalId: "terminal", cwd: "/head" }, calls = [];
  const notifier = createExactHeadTaskNotifier({ runtime: { validateCaller: () => caller, invokeVoid: (socket, argv) => calls.push([socket, argv]) } });
  assert.equal(await notifier({ task: { taskId: "task", caller }, handoff: "complete" }), "delivered");
  assert.deepEqual(calls, [["socket", ["pane", "send-text", "pane", "agent-task task completed\ncomplete"]], ["socket", ["pane", "send-keys", "pane", "Enter"]]]);
  const stale = createExactHeadTaskNotifier({ runtime: { validateCaller: () => ({ ...caller, paneId: "other" }), invokeVoid: () => { throw new Error("must not send"); } } });
  assert.equal(await stale({ task: { taskId: "task", caller } }), "unavailable");
  const textFailureCalls = [];
  const textFailure = createExactHeadTaskNotifier({ runtime: { validateCaller: () => caller, invokeVoid: (_socket, argv) => { textFailureCalls.push(argv); throw new Error("text unknown"); } } });
  assert.equal(await textFailure({ task: { taskId: "task", caller } }), "ambiguous"); assert.equal(textFailureCalls.length, 1);
  const failedCalls = [];
  const ambiguous = createExactHeadTaskNotifier({ runtime: { validateCaller: () => caller, invokeVoid: (_socket, argv) => { failedCalls.push(argv); if (argv[1] === "send-keys") throw new Error("Enter unknown"); } } });
  assert.equal(await ambiguous({ task: { taskId: "task", caller } }), "ambiguous"); assert.equal(failedCalls.length, 2);
});
