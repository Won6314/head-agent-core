import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CompactRecovery, DEFAULT_NEXT_INSTRUCTION, compactPrompt, compactionInstructionContext } from "../packages/opencode-runtime/runtime/opencode/plugins/compact-recovery-core.mjs";
import { projectSessionRecovery } from "../packages/opencode-runtime/runtime/opencode/bin/session-lifecycle.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "compact-continuity-"));
  const session = path.join(root, ".claude/agents/head/sessions/demo");
  fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(session, "context.md"), "session context\n");
  fs.writeFileSync(path.join(session, "progress.md"), "previous progress\n");
  fs.writeFileSync(path.join(session, "history.md"), "# History\n");
  fs.writeFileSync(path.join(session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }));
  return { root, session };
}

test("compact prompt requests a non-canonical conversation message", () => {
  const prompt = compactPrompt("demo");
  assert.match(prompt, /^Write only the lossy compaction message/);
  assert.match(prompt, /session demo/);
  assert.match(prompt, /non-canonical runtime continuity/);
  assert.match(prompt, /must not create, replace, append, or propose file-backed Session or Run state/);
  assert.match(prompt, /Do not emit a persistence payload, JSON envelope, progress\.md content, history entry, ledger record/);
});

test("compaction instruction context loads canonical HEAD and project behavior", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const headDirectory = path.join(state.root, ".claude/agents/head");
  const headCore = path.join(state.root, "HEAD_CORE.md");
  fs.writeFileSync(path.join(state.root, "CLAUDE.md"), "# Project Instructions\nProject boundary.\n");
  fs.writeFileSync(path.join(headDirectory, "CLAUDE.md"), "# HEAD Project Instructions\nHEAD boundary.\n");
  fs.writeFileSync(headCore, "# HEAD Principles\nAct from the model.\n");

  const instructions = compactionInstructionContext(state.root, { headCorePath: headCore });
  const prompt = compactPrompt("demo", instructions);
  assert.match(prompt, /^Apply the following canonical HEAD behavior and project instructions while constructing the non-canonical compaction message/);
  assert.match(prompt, /# HEAD Principles\nAct from the model\./);
  assert.match(prompt, /# Project Instructions\nProject boundary\./);
  assert.match(prompt, /# HEAD Project Instructions\nHEAD boundary\./);
  assert.match(prompt, /Shape the intended current behavior directly/);
  assert.match(prompt, /session demo/);
});

test("compaction hook injects canonical instructions and clears supplemental context", async (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const headDirectory = path.join(state.root, ".claude/agents/head");
  fs.writeFileSync(path.join(state.root, "CLAUDE.md"), "# Project Instructions\nProject boundary.\n");
  fs.writeFileSync(path.join(headDirectory, "CLAUDE.md"), "# HEAD Project Instructions\nHEAD boundary.\n");
  const scalar = { optional() { return this; }, describe() { return this; } };
  const plugin = await CompactRecovery({
    root: state.root,
    detectLocation: () => ({ tabLabel: "demo", sessionName: "demo" }),
    schema: { string: () => scalar },
  });
  const output = { prompt: "", context: ["stale supplemental context"] };
  await plugin["experimental.session.compacting"]({ sessionID: "ses_demo" }, output);
  assert.match(output.prompt, /# HEAD Principles/);
  assert.match(output.prompt, /# Project Instructions\nProject boundary\./);
  assert.match(output.prompt, /# HEAD Project Instructions\nHEAD boundary\./);
  assert.deepEqual(output.context, []);
});

test("default continuation is mode-neutral", () => {
  assert.equal(DEFAULT_NEXT_INSTRUCTION, "Continue from the exact next action recorded in the active recovery context.");
});

test("crossing 200k tokens shows one visible checkpoint toast", async (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(state.root, "CLAUDE.md"), "# Project Instructions\n");
  fs.writeFileSync(path.join(state.root, ".claude/agents/head/CLAUDE.md"), "# HEAD Instructions\n");
  const toasts = [];
  const scalar = { optional() { return this; }, describe() { return this; } };
  const plugin = await CompactRecovery({
    root: state.root,
    client: { tui: { showToast: async (input) => { toasts.push(input); return true; } } },
    detectLocation: () => ({ tabLabel: "demo", sessionName: "demo" }),
    schema: { string: () => scalar },
  });
  const update = { event: { type: "message.updated", properties: { sessionID: "ses_demo", info: { role: "assistant", tokens: { total: 200_000 } } } } };
  await plugin.event(update);
  await plugin.event(update);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].body.variant, "warning");
  assert.match(toasts[0].body.message, /checkpoint_compact/);
});

test("session recovery still projects an explicitly authored progress handoff", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const projection = projectSessionRecovery({ headDirectory: path.join(state.root, ".claude/agents/head"), liveSessionName: "demo" });
  assert.equal(projection.metadata.mode, "session");
  assert.match(projection.prompt, /previous progress/);
  assert.equal(projection.metadata.loadedPaths.at(-1), "progress.md");
});

test("compaction completion never mutates progress or history", async (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const progressPath = path.join(state.session, "progress.md");
  const historyPath = path.join(state.session, "history.md");
  const beforeProgress = fs.readFileSync(progressPath, "utf8");
  const beforeHistory = fs.readFileSync(historyPath, "utf8");
  const scalar = { optional() { return this; }, describe() { return this; } };
  const plugin = await CompactRecovery({
    root: state.root,
    detectLocation: () => ({ tabLabel: "demo", sessionName: "demo" }),
    schema: { string: () => scalar },
  });
  await plugin["experimental.session.compacting"]({ sessionID: "ses_demo" }, { prompt: "", context: [] });
  await plugin.event({ event: { type: "session.compacted", properties: { sessionID: "ses_demo" } } });
  assert.equal(fs.readFileSync(progressPath, "utf8"), beforeProgress);
  assert.equal(fs.readFileSync(historyPath, "utf8"), beforeHistory);
});
