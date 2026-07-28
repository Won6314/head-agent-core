import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_NEXT_INSTRUCTION, compactPrompt } from "../packages/opencode-runtime/runtime/opencode/plugins/compact-recovery-core.mjs";
import { PROGRESS_LIMIT, projectSessionRecovery } from "../packages/opencode-runtime/runtime/opencode/bin/session-lifecycle.mjs";

const updater = path.resolve("packages/opencode-runtime/runtime/claude-hooks/compact-session-update.py");

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

function payload(progress, history_append = "") {
  return `\`\`\`json\n${JSON.stringify({ session: "demo", progress, history_append })}\n\`\`\`\n`;
}

function persist(root, summary) {
  return spawnSync("python3", [updater, "--project-root", root, "--session", "demo"], { input: summary, encoding: "utf8" });
}

test("compact prompt requests rich bounded continuity in the strict envelope", () => {
  const prompt = compactPrompt("demo");
  assert.match(prompt, /^Output exactly one fenced `json` block and no other text:/);
  assert.match(prompt, /"session": "demo"/);
  for (const section of ["Current Conversation", "User Intent and Constraints", "Established Facts and Decisions", "Active Threads and Unanswered Questions", "Exact Next Handoff", "References"]) {
    assert.match(prompt, new RegExp(section));
  }
  assert.match(prompt, /approximately 800–1,500 tokens/);
  assert.match(prompt, /Preserve conversational meaning rather than chronology/);
  assert.match(prompt, /not Run authority/);
  assert.match(prompt, /Do not copy a long transcript or prior history/);
});

test("default continuation is mode-neutral", () => {
  assert.equal(DEFAULT_NEXT_INSTRUCTION, "Continue from the exact next action recorded in the active recovery context.");
});

test("valid rich continuity persists and projects without structural loss", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const progress = "# Continuity\n\n## Current Conversation\n- Resume the bounded implementation.\n\n## User Intent and Constraints\n- Preserve the strict envelope.\n\n## Established Facts and Decisions\n- Session projection includes continuity.\n\n## Active Threads and Unanswered Questions\n- Verify persistence.\n\n## Exact Next Handoff\n1. Run the focused test.\n\n## References\n- tests/compact-continuity.test.mjs";
  const result = persist(state.root, payload(progress, "## 2026-07-27: Continuity\n- Persisted rich compact state."));
  assert.equal(result.status, 0, result.stderr);
  const persisted = fs.readFileSync(path.join(state.session, "progress.md"), "utf8");
  assert.equal(persisted, `${progress}\n`);
  assert.equal(fs.readFileSync(path.join(state.session, "history.md"), "utf8"), "# History\n\n## 2026-07-27: Continuity\n- Persisted rich compact state.\n");
  const projection = projectSessionRecovery({ headDirectory: path.join(state.root, ".claude/agents/head"), liveSessionName: "demo" });
  assert.equal(projection.metadata.mode, "session");
  assert.match(projection.prompt, new RegExp(progress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(projection.metadata.loadedPaths.at(-1), "progress.md");
});

test("oversized continuity is rejected without replacing prior progress", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const previous = fs.readFileSync(path.join(state.session, "progress.md"), "utf8");
  const result = persist(state.root, payload("x".repeat(PROGRESS_LIMIT)));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid progress/);
  assert.equal(fs.readFileSync(path.join(state.session, "progress.md"), "utf8"), previous);
});

test("empty history is unchanged and completed history remains append-only", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const historyPath = path.join(state.session, "history.md");
  const initial = fs.readFileSync(historyPath, "utf8");
  assert.equal(persist(state.root, payload("first progress", "")).status, 0);
  assert.equal(fs.readFileSync(historyPath, "utf8"), initial);
  assert.equal(persist(state.root, payload("second progress", "## 2026-07-27: Result\n- Completed.")).status, 0);
  assert.equal(fs.readFileSync(historyPath, "utf8"), "# History\n\n## 2026-07-27: Result\n- Completed.\n");
});
