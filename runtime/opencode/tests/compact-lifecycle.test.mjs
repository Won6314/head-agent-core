import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { CompactRecovery, compactProjection } from "../plugins/compact-recovery-core.mjs";
import { consumeCompactionSystemTransform } from "../plugins/compaction-phase.mjs";

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function project(sessionID = "ses_Mapped123") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-core-compact-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, ".claude", "agents", "head", "sessions", "active"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claude", "agents", "head", "opencode", "state", "sessions"), { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "workspace\n");
  fs.writeFileSync(path.join(root, ".claude", "agents", "head", "CLAUDE.md"), "head\n");
  fs.writeFileSync(path.join(root, ".claude", "agents", "head", "opencode", "state", "sessions", `${sessionID}.json`), JSON.stringify({ sessionName: "active" }));
  return root;
}

function messages(sessionID) {
  return [{
    info: { id: "work", sessionID, role: "user", model: { providerID: "openai", modelID: "test" } },
    parts: [{ type: "text", text: "work" }],
  }];
}

test("mapped checkpoint compacts once and enables native continue once", async () => {
  const sessionID = "ses_Mapped123", root = project(sessionID);
  const calls = [];
  const hooks = await CompactRecovery({ root, client: { session: {
    messages: async () => ({ data: messages(sessionID) }),
    summarize: async (request) => { calls.push(request); return { data: true }; },
  } } });

  assert.match(await hooks.tool.checkpoint_compact.execute({}, { sessionID }), /queued/);
  await hooks.event({ event: { type: "session.idle", properties: { sessionID } } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.auto, true);

  const first = { enabled: false };
  await hooks["experimental.compaction.autocontinue"]({ sessionID }, first);
  assert.equal(first.enabled, true);
  const second = { enabled: true };
  await hooks["experimental.compaction.autocontinue"]({ sessionID }, second);
  assert.equal(second.enabled, false);
});

test("unmapped session is not compacted", async () => {
  const root = project(), hooks = await CompactRecovery({ root });
  assert.match(await hooks.tool.checkpoint_compact.execute({}, { sessionID: "ses_Unmapped123" }), /No mapped HEAD pane\/session/);
});

test("failed compaction does not inject continue", async () => {
  const sessionID = "ses_Failed123", root = project(sessionID);
  const hooks = await CompactRecovery({ root, client: { session: {
    messages: async () => ({ data: messages(sessionID) }),
    summarize: async () => { throw new Error("failed"); },
  } } });
  await hooks.tool.checkpoint_compact.execute({}, { sessionID });
  await hooks.event({ event: { type: "session.idle", properties: { sessionID } } });
  const output = { enabled: true };
  await hooks["experimental.compaction.autocontinue"]({ sessionID }, output);
  assert.equal(output.enabled, false);
});

test("compaction context is suppressed without a persistence payload prompt", async () => {
  const sessionID = "ses_Context123", root = project(sessionID), hooks = await CompactRecovery({ root });
  const output = { context: ["default"] };
  await hooks["experimental.session.compacting"]({ sessionID }, output);
  assert.deepEqual(output, { context: [] });
});

test("compaction completion clears suppression even if the session mapping disappears", async () => {
  const sessionID = "ses_UnmappedCompletion123", root = project(sessionID), hooks = await CompactRecovery({ root });
  await hooks["experimental.session.compacting"]({ sessionID }, { context: ["default"] });
  fs.unlinkSync(path.join(root, ".claude", "agents", "head", "opencode", "state", "sessions", `${sessionID}.json`));
  await hooks.event({ event: { type: "session.compacted", properties: { sessionID } } });
  assert.equal(consumeCompactionSystemTransform(sessionID), false);
});

test("native synthetic continuation is model-facing exactly lowercase continue", () => {
  const synthetic = {
    info: { id: "continue", role: "user" },
    parts: [{ type: "text", text: "Continue if you have next steps.", synthetic: true, metadata: { compaction_continue: true } }],
  };
  const projected = compactProjection([
    { info: { id: "compact", role: "user" }, parts: [{ type: "compaction", auto: true }] },
    synthetic,
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].parts[0].text, "continue");
});

test("synthetic continuation is removed after its assistant response", () => {
  const projected = compactProjection([
    { info: { id: "continue", role: "user" }, parts: [{ type: "text", text: "continue", synthetic: true, metadata: { compaction_continue: true } }] },
    { info: { id: "answer", role: "assistant" }, parts: [{ type: "text", text: "done" }] },
  ]);
  assert.deepEqual(projected.map((message) => message.info.id), ["answer"]);
});
