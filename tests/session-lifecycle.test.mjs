import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildHeadPrompt, mutateSessionRecord } from "../packages/opencode-runtime/runtime/opencode/bin/render-runtime-config.mjs";

function record(slice = "slices/current.md") {
  return { id: "cp-0000", at: "2026-07-27T00:00:00Z", horizon: { slice: null, wave: null }, expected: "start", observed: "started", evidence: [], decision: { type: "START", reason: "test" }, next: { output: "finish", slice, wave: "wave" } };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-lifecycle-"));
  const head = path.join(root, ".claude/agents/head");
  const session = path.join(head, "sessions/demo");
  fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "root\n");
  fs.writeFileSync(path.join(head, "CLAUDE.md"), "head\n");
  fs.writeFileSync(path.join(session, "context.md"), "session context\n");
  fs.writeFileSync(path.join(session, "progress.md"), "session progress\n");
  fs.writeFileSync(path.join(session, "run.md"), "stale root run\n");
  fs.writeFileSync(path.join(session, "plan.md"), "stale plan\n");
  return { root, head, session };
}

function promptFor(state, options = {}) {
  return buildHeadPrompt({ agent: "head", root: state.root, location: options.location || { sessionName: "demo" }, sessionID: options.sessionID || "" });
}

test("explicit Session state projects only root continuity", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(state.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }));
  const projection = promptFor(state);
  assert.match(projection.prompt, /mode: session/);
  assert.match(projection.prompt, /session context/);
  assert.match(projection.prompt, /session progress/);
  assert.doesNotMatch(projection.prompt, /stale root run|stale plan/);
  assert.deepEqual(projection.metadata.loadedPaths, ["context.md", "progress.md"]);
});

test("explicit Run state projects only active Run canon and excludes stale artifacts", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const run = path.join(state.session, "runs/active");
  const inactive = path.join(state.session, "runs/inactive");
  fs.mkdirSync(path.join(run, "ledger"), { recursive: true });
  fs.mkdirSync(path.join(run, "slices"));
  fs.mkdirSync(inactive, { recursive: true });
  fs.writeFileSync(path.join(run, "run.md"), "active run\n");
  fs.writeFileSync(path.join(run, "slices/current.md"), "active slice\n");
  fs.writeFileSync(path.join(run, "ledger/0000.json"), JSON.stringify(record()));
  fs.writeFileSync(path.join(inactive, "run.md"), "inactive run\n");
  fs.writeFileSync(path.join(state.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 1, mode: "run", activeRun: { id: "active", path: "runs/active" } }));
  const sessionID = "ses_abc";
  const recordPath = path.join(state.head, "opencode/state/sessions", `${sessionID}.json`);
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, JSON.stringify({ sessionName: "demo", progressPath: "stale Session progress", preservedByMutation: true }));
  const projection = promptFor(state, { sessionID });
  assert.match(projection.prompt, /mode: run/);
  assert.match(projection.prompt, /active run|active slice/);
  assert.doesNotMatch(projection.prompt, /session progress|inactive run|stale root run/);
  assert.equal(projection.metadata.activeRun, "active");
  const snapshot = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  assert.equal(snapshot.progressPath, undefined);
  assert.equal(snapshot.runPath, projection.metadata.runPath);
  mutateSessionRecord(sessionID, state.root, () => ({ explicitMutation: true }));
  const mutated = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  assert.equal(mutated.runPath, projection.metadata.runPath);
  assert.equal(mutated.explicitMutation, true);
});

test("active Run with a valid no-Slice checkpoint projects its run and ledger", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const run = path.join(state.session, "runs/active");
  fs.mkdirSync(path.join(run, "ledger"), { recursive: true });
  fs.writeFileSync(path.join(run, "run.md"), "active run\n");
  fs.writeFileSync(path.join(run, "ledger/0000.json"), JSON.stringify(record(null)));
  fs.writeFileSync(path.join(state.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 1, mode: "run", activeRun: { id: "active", path: "runs/active" } }));
  const projection = promptFor(state);
  assert.match(projection.prompt, /mode: run/);
  assert.match(projection.prompt, /active run|cp-0000/);
  assert.doesNotMatch(projection.prompt, /RUN_CORRUPT|Run current Slice/);
  assert.equal(projection.metadata.slicePointerStatus, "none");
  assert.deepEqual(projection.metadata.loadedPaths, ["context.md", "runs/active/run.md", "runs/active/ledger/0000.json"]);
  assert.match(projection.prompt, /loaded: context\.md, runs\/active\/run\.md, runs\/active\/ledger\/0000\.json/);
});

test("non-null invalid, missing, and outside Slice pointers fail closed", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const run = path.join(state.session, "runs/active");
  fs.mkdirSync(path.join(run, "ledger"), { recursive: true });
  fs.writeFileSync(path.join(run, "run.md"), "active run\n");
  fs.writeFileSync(path.join(state.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 1, mode: "run", activeRun: { id: "active", path: "runs/active" } }));
  fs.writeFileSync(path.join(state.root, "outside.md"), "outside\n");
  for (const slice of ["", "slices/missing.md", "../../../../../../outside.md"]) {
    fs.writeFileSync(path.join(run, "ledger/0000.json"), JSON.stringify(record(slice)));
    const projection = promptFor(state);
    assert.match(projection.prompt, /RUN_CORRUPT/);
    assert.deepEqual(projection.metadata.loadedPaths, []);
  }
});

test("identity fallback is validated and disagreement fails closed", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(state.head, "sessions/other"));
  fs.writeFileSync(path.join(state.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }));
  const stateDir = path.join(state.head, "opencode/state/sessions");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "ses_abc.json"), JSON.stringify({ sessionName: "demo" }));
  const fallback = promptFor(state, { location: {}, sessionID: "ses_abc" });
  assert.match(fallback.prompt, /identity_source: opencode_session/);
  const conflict = promptFor(state, { location: { sessionName: "other" }, sessionID: "ses_abc" });
  assert.match(conflict.prompt, /SESSION_IDENTITY_CONFLICT/);
  assert.doesNotMatch(conflict.prompt, /session context/);
});

test("identity disagreement does not rewrite the exact-session record", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(state.head, "sessions/other"));
  fs.writeFileSync(path.join(state.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }));
  const stateDir = path.join(state.head, "opencode/state/sessions");
  const recordPath = path.join(stateDir, "ses_abc.json");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(recordPath, '{\n  "sessionName": "demo"\n}\n');
  const before = fs.readFileSync(recordPath);
  const projection = promptFor(state, { location: { sessionName: "other" }, sessionID: "ses_abc" });
  assert.match(projection.prompt, /SESSION_IDENTITY_CONFLICT/);
  assert.doesNotMatch(projection.prompt, /Session context|Session progress/);
  assert.deepEqual(fs.readFileSync(recordPath), before);
});

test("an unvalidated supplied Herdr identity cannot fall back to an OpenCode binding", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(state.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }));
  const stateDir = path.join(state.head, "opencode/state/sessions");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "ses_abc.json"), JSON.stringify({ sessionName: "demo" }));
  const projection = buildHeadPrompt({
    agent: "head",
    root: state.root,
    sessionID: "ses_abc",
    env: { HERDR_SOCKET_PATH: "/tmp/ambiguous-herdr", HERDR_PANE_ID: "pane-ambiguous" },
  });
  assert.match(projection.prompt, /SESSION_IDENTITY_UNRESOLVED/);
  assert.doesNotMatch(projection.prompt, /session context/);
  assert.equal(projection.metadata.shouldInject, false);
});

test("corrupt Run fails closed and missing state retains legacy projection", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(state.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 1, mode: "run", activeRun: { id: "missing", path: "runs/missing" } }));
  let projection = promptFor(state);
  assert.match(projection.prompt, /RUN_CORRUPT/);
  assert.doesNotMatch(projection.prompt, /session progress/);
  fs.unlinkSync(path.join(state.session, "session-state.json"));
  fs.mkdirSync(path.join(state.session, "ledger"));
  fs.mkdirSync(path.join(state.session, "slices"));
  fs.writeFileSync(path.join(state.session, "slices/current.md"), "legacy slice\n");
  fs.writeFileSync(path.join(state.session, "ledger/0000.json"), JSON.stringify(record()));
  projection = promptFor(state);
  assert.doesNotMatch(projection.prompt, /HEAD_RUNTIME_CONTEXT/);
  assert.match(projection.prompt, /stale root run|session context|legacy slice/);
});
