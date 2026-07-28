import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHostDaemon } from "../host-coordination/composition.mjs";

function project(root, projectId) {
  for (const role of ["head", "developer"]) fs.mkdirSync(path.join(root, ".claude", "agents", role), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(root, ".claude", "head-runtime.json"), `${JSON.stringify({ version: 1, projectId })}\n`, { mode: 0o600 });
}
function headers(caller, session = "") { return { "x-head-herdr-socket": caller.socket, "x-head-herdr-workspace-id": caller.workspaceId, "x-head-herdr-tab-id": caller.tabId, "x-head-herdr-pane-id": caller.paneId, ...(session ? { "mcp-session-id": session } : {}) }; }
async function initialize(handler, caller) { return handler({ jsonrpc: "2.0", id: 1, method: "initialize" }, headers(caller)); }
async function call(handler, session, id, name, arguments_) { return handler({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: arguments_ } }, headers({}, session)); }

test("agent comm is durable, host-targeted, generation-fenced, and asynchronous", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agent-comm-")), state = path.join(temporary, "state"), one = path.join(temporary, "one"), two = path.join(temporary, "two");
  fs.mkdirSync(state, { mode: 0o700 }); project(one, "one"); project(two, "two");
  const caller = (root, role, workspaceId) => ({ socket: "socket", workspaceId, tabId: `${role}-tab`, paneId: `${role}-pane`, terminalId: `${role}-terminal`, cwd: path.join(root, ".claude", "agents", role) });
  const head = caller(one, "head", "head-workspace"), developer = caller(one, "developer", "developer-workspace"), foreign = caller(two, "head", "foreign-workspace");
  const key = (value) => `${value.workspaceId}:${value.paneId}`, panes = new Map([[key(head), head], [key(developer), developer], [key(foreign), foreign]]), notifications = [];
  const herdr = { validateCaller(value) { const pane = panes.get(key(value || {})); return pane ? { ...pane } : null; }, invokeVoid(socket, argv) { notifications.push([socket, argv]); } };
  let wake;
  const daemon = createHostDaemon({ hostStateRoot: state, herdr, launcher: () => {}, resolveExecution: () => ({}), resolveOverlay: () => ({ resolveAgent: () => "" }), resolveRole: ({ live }) => path.basename(live.cwd), wait: () => new Promise((resolve) => { wake = resolve; }) });
  daemon.registerProject({ projectId: "one", projectRoot: one });
  const headInit = await initialize(daemon.transport.comm, head); assert.ok(headInit.result, JSON.stringify(headInit)); const developerInit = await initialize(daemon.transport.comm, developer); assert.ok(developerInit.result, JSON.stringify(developerInit));
  const headSession = headInit.result.sessionId, developerSession = developerInit.result.sessionId;
  const listed = await daemon.transport.comm({ jsonrpc: "2.0", id: 2, method: "tools/list" }, headers({}, headSession));
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["send_message", "read_inbox", "reply_message"]);
  assert.equal(fs.existsSync(path.join(state, "projects", "one", "agent-comm", "v1", "targets", "head.json")), true);
  assert.equal(fs.existsSync(path.join(state, "projects", "one", "agent-comm", "v1", "targets", "developer.json")), true);

  const waiting = call(daemon.transport.comm, developerSession, 3, "send_message", { to: "head", content: "need answer", wait_reply: true, timeout_sec: 2, idempotency_key: "question" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(notifications.length, 2); assert.deepEqual(notifications[0].slice(0, 1), ["socket"]); assert.deepEqual(notifications[0][1].slice(0, 3), ["pane", "send-text", head.paneId]); assert.match(notifications[0][1][3], /^\[from developer msg:/); assert.deepEqual(notifications[1], ["socket", ["pane", "send-keys", head.paneId, "Enter"]]);
  const health = await daemon.transport.comm({ jsonrpc: "2.0", id: 4, method: "health" }, {}); assert.equal(health.result.endpoint, "comm");
  const inbox = await call(daemon.transport.comm, headSession, 5, "read_inbox", {}); const message = inbox.result.structuredContent[0]; assert.equal(message.from, "developer"); assert.equal(message.read, false);
  const reply = await call(daemon.transport.comm, headSession, 6, "reply_message", { in_reply_to: message.id, content: "approved" }); assert.equal(reply.result.structuredContent.content, "approved");
  wake(); const answered = await waiting; assert.equal(answered.result.structuredContent.reply, "approved");
  const replay = await call(daemon.transport.comm, developerSession, 7, "send_message", { to: "head", content: "need answer", wait_reply: true, timeout_sec: 2, idempotency_key: "question" }); assert.equal(replay.result.structuredContent.reply, "approved");
  const conflict = await call(daemon.transport.comm, headSession, 8, "reply_message", { in_reply_to: message.id, content: "different" }); assert.equal(conflict.error.data.code, "REPLY_IMMUTABLE");
  panes.delete(key(head)); const unavailable = await call(daemon.transport.comm, developerSession, 81, "send_message", { to: "head", content: "durable despite stale target", idempotency_key: "stale-target" }); assert.ok(unavailable.result); assert.equal(notifications.length, 2); panes.set(key(head), head); const retained = await call(daemon.transport.comm, headSession, 82, "read_inbox", {}); assert.equal(retained.result.structuredContent[0].content, "durable despite stale target");
  const spoof = await call(daemon.transport.comm, developerSession, 9, "send_message", { self: "head", to: "head", content: "bad" }); assert.ok(spoof.error);
  const escaped = await call(daemon.transport.comm, developerSession, 10, "send_message", { to: "../head", content: "bad" }); assert.equal(escaped.error.data.code, "INVALID_AGENT_ROLE");
  const foreignInit = await initialize(daemon.transport.comm, foreign); assert.equal(foreignInit.error.data.code, "UNREGISTERED_PROJECT");
  panes.delete(key(head)); const replacement = caller(one, "head", "replacement-workspace"); panes.set(key(replacement), replacement); const rotated = await initialize(daemon.transport.comm, replacement); assert.ok(rotated.result.sessionId); panes.set(key(head), head);
  const stale = await daemon.transport.comm({ jsonrpc: "2.0", id: 11, method: "tools/list" }, headers({}, headSession)); assert.equal(stale.error.data.code, "STALE_AUTHORITY_GENERATION");
});
