import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  attentionCheckpoint,
  attentionCheckpointThresholds,
  COMPACTION_PROMPT,
  compactPrompt, CompactRecovery, sessionIsIdle,
} from "./compact-recovery-core.mjs";
import { bindCompactionOutput, instructionHash, loadContinuation, saveContinuation, textSummary } from "./continuation-state.mjs";

test("selects only the latest crossed 50k attention checkpoint", () => {
  assert.deepEqual(attentionCheckpointThresholds(49_999), []);
  assert.deepEqual(attentionCheckpointThresholds(50_000), [50_000]);
  assert.deepEqual(attentionCheckpointThresholds(149_999), [100_000]);
  assert.deepEqual(attentionCheckpointThresholds(260_000), [250_000]);
});

test("a latest checkpoint above 200k retains the compaction instruction", () => {
  const prompt = attentionCheckpoint(250_000, "HEAD core marker");

  assert.match(prompt, /threshold_tokens="250000"/);
  assert.match(prompt, /reached the 200k compaction checkpoint/);
  assert.match(prompt, /HEAD core marker/);
});

test("binds only the successful summary assistant parented by the exact compaction request", () => {
  const messages = [
    { info: { id: "cmp_1", role: "user" }, parts: [{ type: "compaction" }] },
    { info: { id: "sum_1", role: "assistant", parentID: "cmp_1", mode: "compaction", summary: true, finish: "stop" }, parts: [{ type: "text", messageID: "sum_1", text: " first " }, { type: "text", messageID: "sum_1", text: "\nsecond\n" }] },
    { info: { id: "newer", role: "assistant", parentID: "user_2", finish: "stop" }, parts: [{ type: "text", messageID: "newer", text: "must not select" }] },
  ];
  assert.deepEqual(bindCompactionOutput(messages, "cmp_1"), { status: "captured", compactionID: "cmp_1", outputID: "sum_1", instruction: "first\nsecond" });
  assert.equal(textSummary(messages[1].parts, "sum_1"), "first\nsecond");
  assert.equal(instructionHash("first\nsecond"), "4252f8d56b4bb236d0b1bc95a1202e392ca84ce0644bf628398fbb9517287da8");
});

test("rejects zero, multiple, and blank exact-parent summary matches", () => {
  assert.equal(bindCompactionOutput([], "cmp_1").reason, "missing_summary_assistant");
  const base = { info: { role: "assistant", parentID: "cmp_1", mode: "compaction", summary: true, finish: "stop" }, parts: [] };
  assert.equal(bindCompactionOutput([{ ...base, info: { ...base.info, id: "a" } }, { ...base, info: { ...base.info, id: "b" } }], "cmp_1").reason, "multiple_summary_assistants");
  assert.equal(bindCompactionOutput([{ ...base, info: { ...base.info, id: "a" }, parts: [{ type: "text", messageID: "a", text: " " }] }], "cmp_1").reason, "blank_summary_text");
});

test("all compaction entrypoints use the exact one-line Korean prompt", () => {
  assert.equal(COMPACTION_PROMPT, "컴팩트 후 다음 실행의 사용자 입력으로 넣을 이어가기 지시문을 작성하라.");
  assert.equal(compactPrompt(), COMPACTION_PROMPT);
});

test("treats an absent session status and explicit idle as idle", () => {
  assert.equal(sessionIsIdle({}, "ses_demo"), true);
  assert.equal(sessionIsIdle({ ses_demo: { type: "idle" } }, "ses_demo"), true);
  assert.equal(sessionIsIdle({ ses_demo: { type: "busy" } }, "ses_demo"), false);
  assert.equal(sessionIsIdle({ ses_demo: { type: "retry", attempt: 1 } }, "ses_demo"), false);
  assert.equal(sessionIsIdle(null, "ses_demo"), false);
});

function lifecycleFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "compact-recovery-lifecycle-"));
  fs.mkdirSync(path.join(root, ".claude", "agents", "head", "sessions", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "fixture");
  fs.writeFileSync(path.join(root, ".claude", "agents", "head", "CLAUDE.md"), "fixture");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const messages = [{ info: { id: "user_1", role: "user", model: { providerID: "p", modelID: "m" } }, parts: [{ type: "text", text: "start" }] }];
  const submissions = [], statuses = {};
  const client = { session: {
    messages: async () => ({ data: messages }),
    summarize: async () => { messages.push({ info: { id: "cmp_tool", role: "user" }, parts: [{ type: "compaction" }] }, { info: { id: "sum_tool", role: "assistant", parentID: "cmp_tool", mode: "compaction", summary: true, finish: "stop" }, parts: [{ type: "text", messageID: "sum_tool", text: "tool continuation" }] }); return { data: true }; },
    status: async () => ({ data: statuses }),
    promptAsync: async ({ body }) => { submissions.push(body.parts[0].text); return { data: true }; },
  } };
  const options = { client, root, schema: {}, detectLocation: () => ({ sessionName: "demo", tabLabel: "demo" }), statusPollIntervalMs: 5, statusPollTimeoutMs: 40 };
  return { root, messages, submissions, statuses, options };
}

function afterImmediate() { return new Promise((resolve) => setImmediate(resolve)); }
function after(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

test("tool completion polls through busy and submits when the status entry disappears without another idle event", async (t) => {
  const fixture = lifecycleFixture(t), plugin = await CompactRecovery(fixture.options), id = "ses_tool";
  fixture.statuses[id] = { type: "busy" };
  await plugin.tool.checkpoint_compact.execute({}, { sessionID: id });
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: id } } });
  assert.equal(loadContinuation(fixture.root, id).phase, "pending"); assert.deepEqual(fixture.submissions, []);
  delete fixture.statuses[id];
  await after(15);
  assert.deepEqual(fixture.submissions, ["tool continuation"]); assert.equal(loadContinuation(fixture.root, id).phase, "consumed");
});

test("native completion dispatches once at a verified post-capture idle boundary", async (t) => {
  const fixture = lifecycleFixture(t), id = "ses_native";
  fixture.statuses[id] = { type: "busy" };
  fixture.messages.push({ info: { id: "cmp_native", role: "user" }, parts: [{ type: "compaction" }] }, { info: { id: "sum_native", role: "assistant", parentID: "cmp_native", mode: "compaction", summary: true, finish: "stop" }, parts: [{ type: "text", messageID: "sum_native", text: "native continuation" }] });
  const first = await CompactRecovery(fixture.options);
  await first.event({ event: { type: "message.updated", properties: { sessionID: id, info: { id: "cmp_native", role: "user" } } } });
  const compacting = { prompt: "", context: ["unowned"] }, autocontinue = { enabled: true };
  await first["experimental.session.compacting"]({ sessionID: id }, compacting);
  await first["experimental.compaction.autocontinue"]({ sessionID: id }, autocontinue);
  assert.equal(compacting.prompt, COMPACTION_PROMPT); assert.deepEqual(compacting.context, []); assert.equal(autocontinue.enabled, false);
  await first.event({ event: { type: "session.compacted", properties: { sessionID: id } } });
  assert.equal(loadContinuation(fixture.root, id).phase, "pending"); assert.deepEqual(fixture.submissions, []);
  fixture.statuses[id] = { type: "idle" };
  await after(15);
  assert.deepEqual(fixture.submissions, ["native continuation"]); assert.equal(loadContinuation(fixture.root, id).phase, "consumed");
  saveContinuation(fixture.root, { ...loadContinuation(fixture.root, id), phase: "dispatching" });
  const fresh = await CompactRecovery(fixture.options);
  await fresh.event({ event: { type: "session.idle", properties: { sessionID: id } } });
  assert.equal(loadContinuation(fixture.root, id).phase, "ambiguous"); assert.equal(fixture.submissions.length, 1);
});

test("idle polling times out with pending intact for the next-execution fallback", async (t) => {
  const fixture = lifecycleFixture(t), id = "ses_timeout";
  fixture.options.statusPollIntervalMs = 5;
  fixture.options.statusPollTimeoutMs = 15;
  fixture.statuses[id] = { type: "busy" };
  const plugin = await CompactRecovery(fixture.options);
  await plugin.tool.checkpoint_compact.execute({}, { sessionID: id });
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: id } } });
  await after(25);
  assert.equal(loadContinuation(fixture.root, id).phase, "pending");
  assert.deepEqual(fixture.submissions, []);
  await plugin["experimental.chat.system.transform"]({ sessionID: id }, { system: [] });
  assert.deepEqual(fixture.submissions, ["tool continuation"]);
  assert.equal(loadContinuation(fixture.root, id).phase, "consumed");
});

test("a duplicate idle event cannot bypass busy or retry status while polling", async (t) => {
  const fixture = lifecycleFixture(t), id = "ses_duplicateidle";
  fixture.statuses[id] = { type: "busy" };
  const plugin = await CompactRecovery(fixture.options);
  await plugin.tool.checkpoint_compact.execute({}, { sessionID: id });
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: id } } });
  assert.equal(loadContinuation(fixture.root, id).phase, "pending");
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: id } } });
  assert.deepEqual(fixture.submissions, []);
  fixture.statuses[id] = { type: "retry", attempt: 1 };
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: id } } });
  assert.deepEqual(fixture.submissions, []);
  delete fixture.statuses[id];
  await after(15);
  assert.deepEqual(fixture.submissions, ["tool continuation"]);
  assert.equal(loadContinuation(fixture.root, id).phase, "consumed");
});

test("a pending continuation left after the only idle event is submitted at the next execution start", async (t) => {
  const fixture = lifecycleFixture(t), id = "ses_next";
  saveContinuation(fixture.root, { schema: 1, sessionID: id, sessionName: "demo", compactionID: "cmp", outputID: "sum", instruction: "next execution continuation", instructionHash: instructionHash("next execution continuation"), phase: "pending", updatedAt: Date.now() });
  fixture.statuses[id] = { type: "busy" };
  const plugin = await CompactRecovery(fixture.options), output = { system: [] };
  await plugin["experimental.chat.system.transform"]({ sessionID: id }, output);
  assert.deepEqual(fixture.submissions, ["next execution continuation"]); assert.equal(loadContinuation(fixture.root, id).phase, "consumed");
  await plugin["experimental.chat.system.transform"]({ sessionID: id }, { system: [] });
  assert.equal(fixture.submissions.length, 1);
});

test("synthetic execution-start messages do not supersede durable pending before dispatch", async (t) => {
  const fixture = lifecycleFixture(t), id = "ses_synthetic";
  saveContinuation(fixture.root, { schema: 1, sessionID: id, sessionName: "demo", compactionID: "cmp", outputID: "sum", instruction: "synthetic-safe continuation", instructionHash: instructionHash("synthetic-safe continuation"), phase: "pending", updatedAt: Date.now() });
  fixture.statuses[id] = { type: "busy" };
  const plugin = await CompactRecovery(fixture.options);
  await plugin["chat.message"]({ sessionID: id }, { message: { role: "user" }, parts: [{ type: "text", text: "internal", synthetic: true }] });
  assert.equal(loadContinuation(fixture.root, id).phase, "pending");
  await plugin["experimental.chat.system.transform"]({ sessionID: id }, { system: [] });
  assert.deepEqual(fixture.submissions, ["synthetic-safe continuation"]); assert.equal(loadContinuation(fixture.root, id).phase, "consumed");
});

test("real user input wins before a scheduled post-capture dispatch", async (t) => {
  const fixture = lifecycleFixture(t), id = "ses_realuser";
  saveContinuation(fixture.root, { schema: 1, sessionID: id, sessionName: "demo", compactionID: "cmp", outputID: "sum", instruction: "must not dispatch", instructionHash: instructionHash("must not dispatch"), phase: "pending", updatedAt: Date.now() });
  fixture.statuses[id] = { type: "idle" };
  const plugin = await CompactRecovery(fixture.options);
  await plugin["chat.message"]({ sessionID: id, messageID: "real_1" }, { message: { role: "user" }, parts: [{ type: "text", text: "new direction" }] });
  await plugin["experimental.chat.system.transform"]({ sessionID: id }, { system: [] });
  assert.deepEqual(fixture.submissions, []); assert.equal(loadContinuation(fixture.root, id).phase, "superseded"); assert.equal(loadContinuation(fixture.root, id).supersededBy, "real_1");
});
