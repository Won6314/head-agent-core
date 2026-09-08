import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { projectSessionRecovery } from "./session-lifecycle.mjs";

function fixture({ mode = "session", runId = "active", entries = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "recovery-"));
  const session = path.join(root, "sessions", "sample");
  fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(session, "context.md"), "CONTEXT\n");
  fs.writeFileSync(path.join(session, "progress.md"), "PROGRESS\n");
  fs.writeFileSync(path.join(session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode, activeRun: mode === "run" ? { id: runId, path: `runs/${runId}` } : null }));
  if (mode === "run") { fs.mkdirSync(path.join(session, "runs", runId), { recursive: true }); fs.writeFileSync(path.join(session, "runs", runId, "run.md"), "RUN\n"); }
  if (entries.length) {
    const body = entries.map((item, index) => {
      const runStamp = item.runId ? ` run:${item.runId}` : "";
      return `## 2026-01-01T00:00:0${index}Z${runStamp}\n\n${item.body}\n`;
    }).join("\n");
    fs.writeFileSync(path.join(session, "history.md"), body);
  }
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

test("Session recovery injects no history body, only a count line pointing at read_history", (t) => {
  const data = fixture({ entries: ["ONE", "TWO", "THREE", "FOUR"].map((body) => ({ body })) }); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const recovery = data.recover();
  assert.equal(recovery.metadata.mode, "session"); assert.match(recovery.prompt, /CONTEXT/); assert.match(recovery.prompt, /PROGRESS/);
  assert.doesNotMatch(recovery.prompt, /ONE|TWO|THREE|FOUR/);
  assert.match(recovery.prompt, /history: 4 entries, latest 2026-01-01T00:00:03Z \(read_history\)/);
  assert.match(recovery.prompt, /active_job: none/);
  assert.doesNotMatch(recovery.prompt, /ledger|slice/i);
  assert.deepEqual(recovery.metadata.loadedPaths, ["context.md", "progress.md"]);
});

test("Run recovery isolates and orders active Run checkpoint history", (t) => {
  const data = fixture({ mode: "run", entries: [{ body: "SESSION" }, { body: "OTHER", runId: "other" }, { body: "ACTIVE-ONE", runId: "active" }, { body: "ACTIVE-TWO", runId: "active" }] }); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const recovery = data.recover();
  assert.equal(recovery.metadata.mode, "run"); assert.match(recovery.prompt, /CONTEXT[\s\S]*RUN[\s\S]*PROGRESS/); assert.match(recovery.prompt, /ACTIVE-ONE[\s\S]*ACTIVE-TWO/); assert.doesNotMatch(recovery.prompt, /SESSION|OTHER/);
  assert.doesNotMatch(recovery.prompt, /ledger|slice/i);
});

test("empty history recovers context and progress", (t) => {
  const data = fixture(); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  assert.equal(data.recover().metadata.mode, "session");
  assert.match(data.recover().prompt, /CONTEXT/);
  assert.match(data.recover().prompt, /PROGRESS/);
});

test("active job survives repeated Session/Run recovery and its final direction section is filled", (t) => {
  for (const mode of ["session", "run"]) {
    const data = fixture({ mode });
    t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
    const id = "20260907-parity";
    const job = path.join(data.session, "jobs", id);
    fs.mkdirSync(job, { recursive: true });
    fs.writeFileSync(path.join(data.session, "jobs", "active.json"), JSON.stringify({ id }));
    fs.writeFileSync(path.join(job, "job.md"), "# job\n\n## 문제\nPROBLEM\n\n## 목표\nGOAL\n\n## 해결방향\nDIRECTION\n");
    for (let n = 0; n < 2; n++) {
      const recovered = data.recover();
      assert.match(recovered.prompt, /active_job: 20260907-parity \(해결방향 filled\)/);
      assert.match(recovered.prompt, /CONTEXT[\s\S]*PROBLEM[\s\S]*GOAL[\s\S]*DIRECTION[\s\S]*PROGRESS/);
    }
    fs.writeFileSync(path.join(job, "job.md"), "# job\n\n## 해결방향\n\n## 기록\nNOTE\n");
    assert.match(data.recover().prompt, /해결방향 empty/);
    fs.unlinkSync(path.join(data.session, "jobs", "active.json"));
    assert.match(data.recover().prompt, /active_job: none/);
    assert.doesNotMatch(data.recover().prompt, /NOTE/);
  }
});

test("history hash or checkpoint junk does not empty Session recovery", (t) => {
  const cases = [
    (data) => { fs.mkdirSync(path.join(data.session, "checkpoints"), { recursive: true }); fs.writeFileSync(path.join(data.session, "checkpoints", "transaction.json"), "{}"); },
    (data) => fs.writeFileSync(path.join(data.session, "history.md"), "TAMPERED"),
  ];
  for (const mutate of cases) {
    const data = fixture({ entries: [{ body: "ENTRY" }] });
    mutate(data);
    const recovery = data.recover();
    assert.equal(recovery.metadata.mode, "session");
    assert.match(recovery.prompt, /CONTEXT/);
    assert.match(recovery.prompt, /PROGRESS/);
    fs.rmSync(data.root, { recursive: true, force: true });
  }
});

test("semantic Run recovery still includes Session context, progress, and pointer files", (t) => {
  const data = semanticFixture(); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const recovery = data.recover();
  assert.equal(recovery.metadata.format, "semantic");
  assert.match(recovery.prompt, /CONTEXT/);
  assert.match(recovery.prompt, /PROGRESS/);
  assert.match(recovery.prompt, /RUN[\s\S]*Checkpoint[\s\S]*Contract/);
  assert.ok(recovery.metadata.loadedPaths.includes("context.md"));
  assert.ok(recovery.metadata.loadedPaths.includes("runs/active/run.md"));
});

test("semantic pointer failure still recovers Session files", (t) => {
  const mutations = [
    (run) => fs.writeFileSync(path.join(run, "run.json"), "{}"),
    (run) => { const pointer = JSON.parse(fs.readFileSync(path.join(run, "run.json"))); pointer.latestCheckpoint = "checkpoints/missing.md"; fs.writeFileSync(path.join(run, "run.json"), JSON.stringify(pointer)); },
    (run) => { fs.unlinkSync(path.join(run, "run.json")); fs.symlinkSync("run.md", path.join(run, "run.json")); },
    (run) => { const pointer = JSON.parse(fs.readFileSync(path.join(run, "run.json"))); pointer.currentExecutionContracts = ["../run.md"]; fs.writeFileSync(path.join(run, "run.json"), JSON.stringify(pointer)); },
  ];
  for (const mutate of mutations) {
    const data = semanticFixture(); const run = path.join(data.session, "runs", "active"); mutate(run);
    const recovery = data.recover();
    assert.equal(recovery.metadata.mode, "run");
    assert.notEqual(recovery.metadata.diagnosis, "SEMANTIC_RUN_POINTER_CORRUPT");
    assert.match(recovery.prompt, /CONTEXT/);
    assert.equal(fs.existsSync(path.join(run, "state.json")), false);
    fs.rmSync(data.root, { recursive: true, force: true });
  }
});
