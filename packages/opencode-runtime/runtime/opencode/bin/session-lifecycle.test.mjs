import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { projectSessionRecovery } from "./session-lifecycle.mjs";

const digest = (body) => crypto.createHash("sha256").update(body).digest("hex");

function fixture({ mode = "session", runId = "active", manifests = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "recovery-"));
  const session = path.join(root, "sessions", "sample");
  fs.mkdirSync(path.join(session, "checkpoints"), { recursive: true });
  fs.writeFileSync(path.join(session, "context.md"), "CONTEXT\n");
  fs.writeFileSync(path.join(session, "progress.md"), "PROGRESS\n");
  fs.writeFileSync(path.join(session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode, activeRun: mode === "run" ? { id: runId, path: `runs/${runId}` } : null }));
  if (mode === "run") { fs.mkdirSync(path.join(session, "runs", runId), { recursive: true }); fs.writeFileSync(path.join(session, "runs", runId, "run.md"), "RUN\n"); }
  let history = Buffer.alloc(0);
  for (const [index, item] of manifests.entries()) {
    const entry = Buffer.from(item.body);
    const manifest = { schema: 1, sequence: index + 1, createdAt: `2026-01-01T00:00:0${index}Z`, mode: item.mode || "session", runId: item.runId ?? null, history: { byteStart: history.length, byteEnd: history.length + entry.length, sha256: digest(entry) }, progress: { sha256: digest("PROGRESS\n") } };
    Object.assign(manifest, item.manifest || {});
    history = Buffer.concat([history, entry]);
    fs.writeFileSync(path.join(session, "checkpoints", `${String(index + 1).padStart(20, "0")}.json`), JSON.stringify(manifest));
  }
  if (manifests.length) fs.writeFileSync(path.join(session, "history.md"), history);
  return { root, session, recover: () => projectSessionRecovery({ headDirectory: root, liveSessionName: "sample" }) };
}

function semanticFixture() {
  const data = fixture({ mode: "run" });
  const run = path.join(data.session, "runs", "active");
  fs.mkdirSync(path.join(run, "checkpoints"));
  fs.mkdirSync(path.join(run, "execution-contracts"));
  fs.writeFileSync(path.join(run, "checkpoints", "0001.md"), "# Checkpoint\n\nDecision: CONTINUE\n");
  fs.writeFileSync(path.join(run, "execution-contracts", "0001.md"), "# Contract\n");
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify({ format: "semantic-plan-run", version: 1, runId: "active", runIndex: "run.md", latestCheckpoint: "checkpoints/0001.md", currentExecutionContracts: ["execution-contracts/0001.md"] })}\n`);
  return data;
}

test("Session recovery projects the newest three manifest entries oldest-to-newest", (t) => {
  const data = fixture({ manifests: ["ONE", "TWO", "THREE", "FOUR"].map((body) => ({ body })) }); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const recovery = data.recover();
  assert.equal(recovery.metadata.mode, "session"); assert.match(recovery.prompt, /CONTEXT/); assert.match(recovery.prompt, /PROGRESS/); assert.doesNotMatch(recovery.prompt, /ONE/);
  assert.ok(recovery.prompt.indexOf("TWO") < recovery.prompt.indexOf("THREE") && recovery.prompt.indexOf("THREE") < recovery.prompt.indexOf("FOUR"));
  assert.doesNotMatch(recovery.prompt, /ledger|slice/i); assert.deepEqual(recovery.metadata.loadedPaths, ["context.md", "progress.md"]);
});

test("Run recovery isolates and orders active Run checkpoint history", (t) => {
  const data = fixture({ mode: "run", manifests: [{ body: "SESSION", mode: "session" }, { body: "OTHER", mode: "run", runId: "other" }, { body: "ACTIVE-ONE", mode: "run", runId: "active" }, { body: "ACTIVE-TWO", mode: "run", runId: "active" }] }); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const recovery = data.recover();
  assert.equal(recovery.metadata.mode, "run"); assert.match(recovery.prompt, /CONTEXT[\s\S]*RUN[\s\S]*PROGRESS/); assert.match(recovery.prompt, /ACTIVE-ONE[\s\S]*ACTIVE-TWO/); assert.doesNotMatch(recovery.prompt, /SESSION|OTHER/);
  assert.doesNotMatch(recovery.prompt, /ledger|slice/i);
});

test("empty checkpoint set recovers without history", (t) => {
  const data = fixture(); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  assert.equal(data.recover().metadata.mode, "session");
});

test("checkpoint authority violations return explicit corrupt recovery", (t) => {
  const cases = [
    (data) => fs.writeFileSync(path.join(data.session, "checkpoints", "transaction.json"), "{}"),
    (data) => fs.renameSync(path.join(data.session, "checkpoints", "00000000000000000001.json"), path.join(data.session, "checkpoints", "00000000000000000002.json")),
    (data) => { const file = path.join(data.session, "checkpoints", "00000000000000000001.json"); const value = JSON.parse(fs.readFileSync(file)); value.mode = "run"; value.runId = null; fs.writeFileSync(file, JSON.stringify(value)); },
    (data) => { const file = path.join(data.session, "checkpoints", "00000000000000000001.json"); const value = JSON.parse(fs.readFileSync(file)); value.history.byteEnd = 999; fs.writeFileSync(file, JSON.stringify(value)); },
    (data) => fs.writeFileSync(path.join(data.session, "history.md"), "TAMPERED"),
  ];
  for (const mutate of cases) { const data = fixture({ manifests: [{ body: "ENTRY" }] }); mutate(data); assert.equal(data.recover().metadata.mode, "corrupt"); fs.rmSync(data.root, { recursive: true, force: true }); }
  const overlap = fixture({ manifests: [{ body: "ONE" }, { body: "TWO" }] }); const second = path.join(overlap.session, "checkpoints", "00000000000000000002.json"); const manifest = JSON.parse(fs.readFileSync(second)); manifest.history.byteStart = 2; fs.writeFileSync(second, JSON.stringify(manifest)); assert.equal(overlap.recover().metadata.mode, "corrupt"); fs.rmSync(overlap.root, { recursive: true, force: true });
});

test("semantic Run recovery loads only its pointer-named index, Checkpoint, and Contracts", (t) => {
  const data = semanticFixture(); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const recovery = data.recover();
  assert.equal(recovery.metadata.format, "semantic");
  assert.deepEqual(recovery.metadata.loadedPaths, ["runs/active/run.md", "runs/active/checkpoints/0001.md", "runs/active/execution-contracts/0001.md"]);
  assert.match(recovery.prompt, /RUN[\s\S]*Checkpoint[\s\S]*Contract/);
  assert.doesNotMatch(recovery.prompt, /# Loaded File: .*context\.md|# Loaded File: .*progress\.md|ledger|slice/i);
});

test("semantic pointer corruption fails closed without creating a state artifact", (t) => {
  const mutations = [
    (run) => fs.writeFileSync(path.join(run, "run.json"), "{}"),
    (run) => { const pointer = JSON.parse(fs.readFileSync(path.join(run, "run.json"))); pointer.latestCheckpoint = "checkpoints/missing.md"; fs.writeFileSync(path.join(run, "run.json"), JSON.stringify(pointer)); },
    (run) => { fs.unlinkSync(path.join(run, "run.json")); fs.symlinkSync("run.md", path.join(run, "run.json")); },
    (run) => { const pointer = JSON.parse(fs.readFileSync(path.join(run, "run.json"))); pointer.currentExecutionContracts = ["../run.md"]; fs.writeFileSync(path.join(run, "run.json"), JSON.stringify(pointer)); },
  ];
  for (const mutate of mutations) {
    const data = semanticFixture(); const run = path.join(data.session, "runs", "active"); mutate(run);
    assert.equal(data.recover().metadata.diagnosis, "SEMANTIC_RUN_POINTER_CORRUPT");
    assert.equal(fs.existsSync(path.join(run, "state.json")), false);
    fs.rmSync(data.root, { recursive: true, force: true });
  }
});
