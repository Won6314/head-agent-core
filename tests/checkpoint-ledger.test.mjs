import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendCheckpoint, latestValidCheckpoint } from "../runtime/opencode/bin/checkpoint-ledger.mjs";
import { buildHeadPrompt } from "../runtime/opencode/bin/render-runtime-config.mjs";

function record(overrides = {}) {
  return {
    id: "cp-0000", at: "2026-07-27T00:00:00Z", horizon: { slice: null, wave: null }, expected: "start",
    observed: "started", evidence: ["run.md"], decision: { type: "START", reason: "test" },
    next: { output: "finish", slice: "slices/current.md", wave: "wave-test" }, ...overrides,
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-ledger-"));
  const session = path.join(root, ".claude/agents/head/sessions/demo");
  fs.mkdirSync(path.join(session, "ledger"), { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "root\n");
  fs.mkdirSync(path.join(root, ".claude/agents/head"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude/agents/head/CLAUDE.md"), "head\n");
  fs.writeFileSync(path.join(session, "context.md"), "context\n");
  fs.writeFileSync(path.join(session, "run.md"), "run\n");
  fs.writeFileSync(path.join(session, "progress.md"), "UNTRUSTED PROGRESS TEXT\n");
  fs.mkdirSync(path.join(session, "slices"));
  fs.writeFileSync(path.join(session, "slices/current.md"), "current slice\n");
  return { root, session };
}

test("ledger chooses the largest valid checkpoint, appends by next chaining, and preserves prior bytes", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(state.session, "ledger/0000.json"), `${JSON.stringify(record(), null, 2)}\n`);
  fs.writeFileSync(path.join(state.session, "ledger/0001.json"), "not json\n");
  fs.writeFileSync(path.join(state.session, "ledger/12.json"), `${JSON.stringify(record({ id: "ignored" }))}\n`);
  assert.equal(latestValidCheckpoint(state.session).name, "0000.json");
  const before = fs.readFileSync(path.join(state.session, "ledger/0000.json"));
  const appended = appendCheckpoint(state.session, {
    id: "cp-0002", at: "2026-07-27T00:01:00Z", observed: "finished", evidence: ["proof.md"],
    decision: { type: "CONTINUE", reason: "test" }, next: { output: "next", slice: null, wave: null },
  });
  assert.equal(path.basename(appended.path), "0002.json");
  assert.deepEqual(appended.record.horizon, { slice: "slices/current.md", wave: "wave-test" });
  assert.equal(appended.record.expected, "finish");
  assert.deepEqual(fs.readFileSync(path.join(state.session, "ledger/0000.json")), before);
});

test("HEAD prompt projects no progress, a valid exact slice, and rejects missing or outside pointers", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const ledger = path.join(state.session, "ledger/0000.json");
  const promptFor = () => buildHeadPrompt({ agent: "head", root: state.root, location: { sessionName: "demo" } });
  fs.writeFileSync(ledger, `${JSON.stringify(record(), null, 2)}\n`);
  let projection = promptFor();
  assert.match(projection.prompt, /current slice/);
  assert.doesNotMatch(projection.prompt, /UNTRUSTED PROGRESS TEXT/);
  assert.equal(projection.metadata.slicePointerStatus, "valid");
  fs.writeFileSync(ledger, `${JSON.stringify(record({ next: { output: "finish", slice: "slices/missing.md", wave: "wave-test" } }), null, 2)}\n`);
  projection = promptFor();
  assert.doesNotMatch(projection.prompt, /current slice/);
  assert.equal(projection.metadata.slicePointerStatus, "missing");
  fs.writeFileSync(path.join(state.root, "outside.md"), "outside\n");
  fs.writeFileSync(ledger, `${JSON.stringify(record({ next: { output: "finish", slice: "../../../../../outside.md", wave: "wave-test" } }), null, 2)}\n`);
  projection = promptFor();
  assert.doesNotMatch(projection.prompt, /current slice/);
  assert.equal(projection.metadata.slicePointerStatus, "outside");
});
