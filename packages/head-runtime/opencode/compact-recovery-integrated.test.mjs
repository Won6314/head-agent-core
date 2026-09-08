import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { CompactRecovery, loadCompactedUserTurns, POINTER, USER_TURNS_MARKER } from "./compact-recovery.mjs";
import { projectSessionRecovery } from "../shared/session-lifecycle.mjs";

const TMP = "/tmp/opencode";
fs.mkdirSync(TMP, { recursive: true });

function fixture(t, name = "demo") {
  const root = fs.mkdtempSync(path.join(TMP, "compact-integrated-"));
  const head = path.join(root, ".claude", "agents", "head");
  const session = path.join(head, "sessions", name);
  fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "fixture");
  fs.writeFileSync(path.join(head, "CLAUDE.md"), "fixture");
  fs.writeFileSync(path.join(session, "context.md"), "CONTEXT");
  fs.writeFileSync(path.join(session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const afterCheckpoint = Date.parse("2026-09-01T03:00:00.000Z");
  const messages = [{ info: { id: "u", role: "user", model: { providerID: "p", modelID: "m" }, time: { created: afterCheckpoint } }, parts: [{ type: "text", text: "initial" }] }];
  const submissions = [];
  let summarized = 0;
  const statuses = {};
  const client = { session: {
    messages: async () => ({ data: messages }),
    summarize: async () => {
      summarized += 1;
      messages.push({ info: { id: "cmp", role: "user" }, parts: [{ type: "compaction" }] }, { info: { id: "sum", role: "assistant", parentID: "cmp", mode: "compaction", summary: true, finish: "stop" }, parts: [{ type: "text", messageID: "sum", text: "EXACT CONTINUATION" }] });
      return { data: true };
    },
    status: async () => ({ data: statuses }),
    promptAsync: async ({ body }) => { submissions.push(body.parts[0].text); return { data: true }; },
  } };
  return {
    root, head, session, messages, submissions, statuses, client,
    summarized: () => summarized,
    options: { client, root, schema: {}, detectLocation: () => ({ sessionName: name, tabLabel: name }) },
  };
}

function writeHistory(session, entries) {
  const body = entries.map((item) => {
    const run = item.runId ? ` run:${item.runId}` : "";
    return `## ${item.at}${run}\n\n${item.body}\n`;
  }).join("\n");
  fs.writeFileSync(path.join(session, "history.md"), body);
}

test("integrated Session tool flow injects no history body and does not replay generated continuation", async (t) => {
  const x = fixture(t);
  writeHistory(x.session, [1, 2, 3, 4].map((n) => ({ at: `2026-09-01T0${n}:00:00Z`, body: `HISTORY-${n}` })));
  fs.writeFileSync(path.join(x.session, "progress.md"), "PROGRESS-4");
  const recovery = projectSessionRecovery({ headDirectory: x.head, liveSessionName: "demo" });
  assert.match(recovery.prompt, /CONTEXT[\s\S]*PROGRESS-4/);
  assert.doesNotMatch(recovery.prompt, /HISTORY-1|HISTORY-2|HISTORY-3|HISTORY-4/);
  assert.match(recovery.prompt, /history: 4 entries, latest .+ \(read_history\)/);

  const plugin = await CompactRecovery(x.options);
  const id = "ses_session";
  x.statuses[id] = { type: "busy" };
  await plugin.tool.checkpoint_compact.execute({}, { sessionID: id });
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: id } } });
  assert.equal(x.summarized(), 1);
  const compacting = { prompt: "", context: ["extra"] };
  await plugin["experimental.session.compacting"]({ sessionID: id }, compacting);
  assert.match(compacting.prompt, new RegExp(POINTER));
  assert.deepEqual(compacting.context, []);
  const autocontinue = { enabled: true };
  await plugin["experimental.compaction.autocontinue"]({ sessionID: id }, autocontinue);
  assert.equal(autocontinue.enabled, true);
  await plugin.event({ event: { type: "session.compacted", properties: { sessionID: id } } });
  assert.deepEqual(x.submissions, []);
  const core = "Instructions from: /pkg/head/HEAD_CORE.md\n\n# HEAD Core\n";
  const system = { system: [core, "project"] };
  await plugin["experimental.chat.system.transform"]({ sessionID: id }, system);
  assert.equal(system.system[0], core);
  assert.match(system.system[1], /HEAD_RUNTIME_CONTEXT[\s\S]*CONTEXT[\s\S]*PROGRESS-4/);
  assert.doesNotMatch(system.system[1], /HISTORY-2|HISTORY-3|HISTORY-4/);
  assert.match(system.system[2], new RegExp(USER_TURNS_MARKER));
  assert.match(system.system[2], /initial/);
  assert.match(loadCompactedUserTurns(x.root, id).text, /initial/);
});

test("integrated Run native flow keeps Run-scoped history and does not dispatch summary text", async (t) => {
  const x = fixture(t);
  fs.writeFileSync(path.join(x.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 1, mode: "run", activeRun: { id: "active", path: "runs/active" } }));
  fs.mkdirSync(path.join(x.session, "runs", "active"), { recursive: true });
  fs.writeFileSync(path.join(x.session, "runs", "active", "run.md"), "RUN-MARKER");
  writeHistory(x.session, [
    { at: "2026-09-01T01:00:00Z", body: "SESSION-HISTORY" },
    { at: "2026-09-01T02:00:00Z", runId: "active", body: "ACTIVE-ONE" },
    { at: "2026-09-01T03:00:00Z", runId: "active", body: "ACTIVE-TWO" },
  ]);
  fs.writeFileSync(path.join(x.session, "progress.md"), "P3");
  const recovery = projectSessionRecovery({ headDirectory: x.head, liveSessionName: "demo" });
  assert.match(recovery.prompt, /CONTEXT[\s\S]*RUN-MARKER[\s\S]*P3[\s\S]*ACTIVE-ONE[\s\S]*ACTIVE-TWO/);
  assert.doesNotMatch(recovery.prompt, /SESSION-HISTORY/);

  x.messages.push({ info: { id: "cmp_native", role: "user" }, parts: [{ type: "compaction" }] }, { info: { id: "sum_native", role: "assistant", parentID: "cmp_native", mode: "compaction", summary: true, finish: "stop" }, parts: [{ type: "text", messageID: "sum_native", text: "NATIVE CONTINUATION" }] });
  const plugin = await CompactRecovery(x.options);
  const id = "ses_runflow";
  const compacting = { context: [] };
  await plugin["experimental.session.compacting"]({ sessionID: id }, compacting);
  assert.match(compacting.prompt, new RegExp(POINTER));
  const autocontinue = { enabled: true };
  await plugin["experimental.compaction.autocontinue"]({ sessionID: id }, autocontinue);
  assert.equal(autocontinue.enabled, true);
  await plugin.event({ event: { type: "session.compacted", properties: { sessionID: id } } });
  assert.deepEqual(x.submissions, []);
  const core = "# HEAD Core\n";
  const system = { system: [core] };
  await plugin["experimental.chat.system.transform"]({ sessionID: id }, system);
  assert.match(system.system[1], /RUN-MARKER[\s\S]*ACTIVE-ONE[\s\S]*ACTIVE-TWO/);
  assert.doesNotMatch(system.system.join("\n"), /NATIVE CONTINUATION|EXACT CONTINUATION/);
});
