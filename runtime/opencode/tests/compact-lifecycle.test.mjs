import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import CompactRecoveryPlugin from "../plugins/compact-recovery.mjs";
import ContextLayersPlugin from "../plugins/context-layers.mjs";
import { compactProjection, CompactRecovery } from "../plugins/compact-recovery-core.mjs";
import { createContextLayers } from "../plugins/context-layers-core.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-core-compact-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, ".claude", "agents", "head"), { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "workspace\n");
  fs.writeFileSync(path.join(root, ".claude", "agents", "head", "CLAUDE.md"), "head\n");
  return root;
}

test("OpenCode entrypoints expose only V1 server plugins", () => {
  assert.equal(CompactRecoveryPlugin.id, "head-core-compact-recovery");
  assert.equal(CompactRecoveryPlugin.server, CompactRecovery);
  assert.equal(ContextLayersPlugin.id, "head-core-context-layers");
});

test("compaction replaces default instructions and suppresses canonical context for that request", async () => {
  const root = project();
  const recovery = await CompactRecovery({ root });
  const layers = createContextLayers({ root, buildPrompt: () => ({ prompt: "canonical context" }) });
  const compacting = { context: ["default compact prompt"] };

  await recovery["experimental.session.compacting"]({ sessionID: "ses_Compact123" }, compacting);
  const during = { system: [] };
  await layers["experimental.chat.system.transform"]({ sessionID: "ses_Compact123" }, during);

  assert.deepEqual(compacting.context, []);
  assert.match(compacting.prompt, /Persistence Checkpoint/);
  assert.doesNotMatch(compacting.prompt, /default compact prompt|canonical context/);
  assert.deepEqual(during.system, []);

  const after = { system: [] };
  await layers["experimental.chat.system.transform"]({ sessionID: "ses_Compact123" }, after);
  assert.deepEqual(after.system, ["canonical context"]);
});

test("future turns exclude compact artifacts and wait for a real user turn", async () => {
  const messages = [
    { info: { id: "normal-user", role: "user" }, parts: [{ type: "text", text: "work" }] },
    { info: { id: "compact-user", role: "user" }, parts: [{ type: "compaction" }] },
    { info: { id: "compact-assistant", role: "assistant", summary: true, mode: "compaction" }, parts: [{ type: "text", text: "checkpoint" }] },
    { info: { id: "continue-user", role: "user" }, parts: [{ type: "text", text: "continue", metadata: { compaction_continue: true } }] },
  ];
  assert.deepEqual(compactProjection(messages).map((message) => message.info.id), ["normal-user"]);

  const recovery = await CompactRecovery({ root: project() });
  const output = { enabled: true };
  await recovery["experimental.compaction.autocontinue"]({}, output);
  assert.equal(output.enabled, false);
});
