import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { CompactRecovery, COMPACTION_PROMPT } from "./compact-recovery-core.mjs";
import { loadContinuation } from "./continuation-state.mjs";
import { projectSessionRecovery } from "../bin/session-lifecycle.mjs";

const historyTool = await import(pathToFileURL("/home/jywon/Dropbox/project/proj_chatbot_mvp/mcp-servers/agent-task/tools/history.js").href);

function fixture(t, name = "demo") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "compact-integrated-")), head = path.join(root, ".claude", "agents", "head"), session = path.join(head, "sessions", name);
  fs.mkdirSync(session, { recursive: true }); fs.writeFileSync(path.join(root, "CLAUDE.md"), "fixture"); fs.writeFileSync(path.join(head, "CLAUDE.md"), "fixture"); fs.writeFileSync(path.join(session, "context.md"), "CONTEXT"); fs.writeFileSync(path.join(session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const messages = [{ info: { id: "u", role: "user", model: { providerID: "p", modelID: "m" } }, parts: [{ type: "text", text: "initial" }] }], submissions = [], statuses = {};
  const client = { session: { messages: async () => ({ data: messages }), summarize: async () => { messages.push({ info: { id: "cmp", role: "user" }, parts: [{ type: "compaction" }] }, { info: { id: "sum", role: "assistant", parentID: "cmp", mode: "compaction", summary: true, finish: "stop" }, parts: [{ type: "text", messageID: "sum", text: "EXACT CONTINUATION" }] }); return { data: true }; }, status: async () => ({ data: statuses }), promptAsync: async ({ body }) => { submissions.push(body.parts[0].text); return { data: true }; } } };
  return { root, head, session, messages, submissions, statuses, client, options: { client, root, schema: {}, detectLocation: () => ({ sessionName: name, tabLabel: name }), statusPollIntervalMs: 5, statusPollTimeoutMs: 40 }, caller: { cwd: head, tabLabel: name } };
}

function afterImmediate() { return new Promise((resolve) => setImmediate(resolve)); }
function after(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

test("integrated Session tool flow dispatches after the only idle event once status becomes absent", async (t) => {
  const x = fixture(t);
  for (let n = 1; n <= 4; n++) await historyTool.handleRecordCheckpoint({ history: `HISTORY-${n}`, progress: `PROGRESS-${n}` }, { agentsDir: path.join(x.root, ".claude", "agents"), context: { caller: x.caller } });
  const recovery = projectSessionRecovery({ headDirectory: x.head, liveSessionName: "demo" });
  assert.match(recovery.prompt, /CONTEXT[\s\S]*PROGRESS-4/); assert.doesNotMatch(recovery.prompt, /HISTORY-1/); assert.match(recovery.prompt, /HISTORY-2[\s\S]*HISTORY-3[\s\S]*HISTORY-4/);
  const plugin = await CompactRecovery(x.options), id = "ses_session"; x.statuses[id] = { type: "busy" }; await plugin.tool.checkpoint_compact.execute({}, { sessionID: id }); await plugin.event({ event: { type: "session.idle", properties: { sessionID: id } } });
  assert.equal(loadContinuation(x.root, id).phase, "pending"); assert.equal(x.submissions.length, 0); delete x.statuses[id]; await after(15);
  assert.deepEqual(x.submissions, ["EXACT CONTINUATION"]); assert.equal(loadContinuation(x.root, id).phase, "consumed");
});

test("integrated Run native flow projects only active histories and captures before dispatch", async (t) => {
  const x = fixture(t); const agentsDir = path.join(x.root, ".claude", "agents");
  await historyTool.handleRecordCheckpoint({ history: "SESSION-HISTORY", progress: "P1" }, { agentsDir, context: { caller: x.caller } }); fs.writeFileSync(path.join(x.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 1, mode: "run", activeRun: { id: "active", path: "runs/active" } })); fs.mkdirSync(path.join(x.session, "runs", "active"), { recursive: true }); fs.writeFileSync(path.join(x.session, "runs", "active", "run.md"), "RUN-MARKER");
  await historyTool.handleRecordCheckpoint({ history: "ACTIVE-ONE", progress: "P2" }, { agentsDir, context: { caller: x.caller } }); await historyTool.handleRecordCheckpoint({ history: "ACTIVE-TWO", progress: "P3" }, { agentsDir, context: { caller: x.caller } });
  const recovery = projectSessionRecovery({ headDirectory: x.head, liveSessionName: "demo" }); assert.match(recovery.prompt, /CONTEXT[\s\S]*RUN-MARKER[\s\S]*P3[\s\S]*ACTIVE-ONE[\s\S]*ACTIVE-TWO/); assert.doesNotMatch(recovery.prompt, /SESSION-HISTORY/);
  x.messages.push({ info: { id: "cmp_native", role: "user" }, parts: [{ type: "compaction" }] }, { info: { id: "sum_native", role: "assistant", parentID: "cmp_native", mode: "compaction", summary: true, finish: "stop" }, parts: [{ type: "text", messageID: "sum_native", text: "NATIVE CONTINUATION" }] }); const plugin = await CompactRecovery(x.options), id = "ses_run"; x.statuses[id] = { type: "busy" }; await plugin.event({ event: { type: "message.updated", properties: { sessionID: id, info: { id: "cmp_native", role: "user" } } } }); const compacting = { context: [] }; await plugin["experimental.session.compacting"]({ sessionID: id }, compacting); assert.equal(compacting.prompt, COMPACTION_PROMPT); await plugin.event({ event: { type: "session.compacted", properties: { sessionID: id } } }); assert.equal(loadContinuation(x.root, id).phase, "pending"); assert.equal(x.submissions.length, 0); x.statuses[id] = { type: "idle" }; await after(15); assert.deepEqual(x.submissions, ["NATIVE CONTINUATION"]);
});
