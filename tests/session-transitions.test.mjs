import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { createSessionTransitions } from "../packages/opencode-runtime/runtime/opencode/bin/session-transitions.mjs";
import { createHerdrRenameAdapter, HeadSessionCore } from "../packages/opencode-runtime/runtime/opencode/plugins/head-session-core.mjs";
import { detectHerdrLocation } from "../packages/opencode-runtime/runtime/opencode/bin/render-runtime-config.mjs";

const require = createRequire(import.meta.url);
const { herdrBinary, validateCaller } = require("../packages/opencode-runtime/runtime/opencode/herdr-runtime.cjs");

function ledger(type, slice = "slices/current.md") {
  return { id: "cp-0000", at: "2026-07-27T00:00:00Z", horizon: { slice: null, wave: null }, expected: "test", observed: "test", evidence: [], decision: { type, reason: "test" }, next: { output: "test", slice, wave: null } };
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transitions-"));
  const head = path.join(root, ".claude/agents/head");
  const session = path.join(head, "sessions/demo");
  fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(session, "session-state.json"), JSON.stringify({ schema: 1, generation: 4, mode: "session", activeRun: null }));
  fs.writeFileSync(path.join(session, "progress.md"), "before handoff");
  const records = new Map([["ses_abc", { sessionName: "demo" }]]);
  const tabs = ["demo"];
  const transition = (options = {}) => createSessionTransitions({
    headDirectory: head,
    identity: { live: () => ({ sessionName: tabs[0], tabLabel: tabs[0] }) },
    binding: { read: (id) => records.get(id), write: (id, value) => records.set(id, value) },
    herdr: { renameTab: (_location, name) => { tabs[0] = name; } },
    ...options,
  });
  return { root, session, records, tabs, transition };
}
function run(state, id = "run-one", decision = "START", slice = "slices/current.md") {
  const dir = path.join(state.session, "runs", id);
  fs.mkdirSync(path.join(dir, "ledger"), { recursive: true });
  fs.writeFileSync(path.join(dir, "run.md"), "prepared run\n");
  fs.writeFileSync(path.join(dir, "ledger/0000.json"), JSON.stringify(ledger(decision, slice)));
  return dir;
}
function state(session) { return JSON.parse(fs.readFileSync(path.join(session, "session-state.json"), "utf8")); }

test("Session to Run to Session commits exact pointers and generations", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  run(value);
  const transition = value.transition();
  assert.deepEqual(transition({ action: "start_run", sessionID: "ses_abc", run_id: "run-one" }), { ok: true, session: "demo", mode: "run", activeRun: "run-one", generation: 5 });
  assert.deepEqual(state(value.session).activeRun, { id: "run-one", path: "runs/run-one" });
  fs.writeFileSync(path.join(value.session, "runs/run-one/ledger/0000.json"), JSON.stringify(ledger("DONE", null)));
  assert.deepEqual(transition({ action: "finish_run", sessionID: "ses_abc", session_handoff: "post-Run continuity" }), { ok: true, session: "demo", mode: "session", activeRun: null, generation: 6 });
  assert.equal(fs.readFileSync(path.join(value.session, "progress.md"), "utf8"), "post-Run continuity");
});

test("invalid start and finish preconditions preserve state and continuity", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const transition = value.transition();
  const before = fs.readFileSync(path.join(value.session, "session-state.json"), "utf8");
  assert.equal(transition({ action: "start_run", sessionID: "ses_abc", run_id: "missing" }).code, "RUN_NOT_PREPARED");
  assert.equal(fs.readFileSync(path.join(value.session, "session-state.json"), "utf8"), before);
  run(value);
  transition({ action: "start_run", sessionID: "ses_abc", run_id: "run-one" });
  assert.equal(transition({ action: "finish_run", sessionID: "ses_abc", session_handoff: "handoff" }).code, "RUN_NOT_TERMINAL");
  assert.equal(state(value.session).mode, "run");
  assert.equal(fs.readFileSync(path.join(value.session, "progress.md"), "utf8"), "before handoff");
});

test("mutation requires exact OpenCode ID, live Herdr identity, and matching binding", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  run(value);
  assert.equal(value.transition()({ action: "start_run", sessionID: "invalid", run_id: "run-one" }).code, "OPENCODE_SESSION_ID_REQUIRED");
  const unavailable = createSessionTransitions({ headDirectory: path.dirname(path.dirname(value.session)), identity: { live: () => null } });
  assert.equal(unavailable({ action: "start_run", sessionID: "ses_abc", run_id: "run-one" }).code, "LIVE_HERDR_IDENTITY_REQUIRED");
  value.records.set("ses_abc", { sessionName: "other" });
  assert.equal(value.transition()({ action: "start_run", sessionID: "ses_abc", run_id: "run-one" }).code, "SESSION_IDENTITY_CONFLICT");
});

test("finish writes handoff before state and restores continuity when state commit fails", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  run(value);
  const writes = [];
  const writeState = (file, body) => {
    writes.push(path.basename(file));
    if (path.basename(file) === "session-state.json" && writes.length > 1) throw new Error("injected state failure");
    fs.writeFileSync(file, body);
  };
  const transition = value.transition({ writeState });
  assert.deepEqual(transition({ action: "start_run", sessionID: "ses_abc", run_id: "run-one" }).ok, true);
  fs.writeFileSync(path.join(value.session, "runs/run-one/ledger/0000.json"), JSON.stringify(ledger("DONE", null)));
  assert.equal(transition({ action: "finish_run", sessionID: "ses_abc", session_handoff: "new handoff" }).code, "STATE_COMMIT_FAILED");
  assert.deepEqual(writes.slice(-3), ["progress.md", "session-state.json", "progress.md"]);
  assert.equal(state(value.session).mode, "run");
  assert.equal(fs.readFileSync(path.join(value.session, "progress.md"), "utf8"), "before handoff");
});

test("rename updates folder, exact binding, and Herdr adapter", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const result = value.transition()({ action: "rename", sessionID: "ses_abc", new_name: "renamed" });
  assert.deepEqual(result, { ok: true, session: "renamed", mode: "session", activeRun: null, generation: 4 });
  assert.ok(fs.existsSync(path.join(path.dirname(value.session), "renamed")));
  assert.equal(value.records.get("ses_abc").sessionName, "renamed");
  assert.equal(value.tabs[0], "renamed");
});

test("rename failure restores completed folder and binding steps", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const transition = value.transition({ herdr: { renameTab: () => { throw new Error("injected"); } } });
  assert.equal(transition({ action: "rename", sessionID: "ses_abc", new_name: "renamed" }).code, "SESSION_RENAME_FAILED");
  assert.ok(fs.existsSync(value.session));
  assert.equal(value.records.get("ses_abc").sessionName, "demo");
  assert.equal(value.tabs[0], "demo");
});

test("dead transition lock is reclaimed while a live owner retains contention", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  run(value);
  const lock = path.join(path.dirname(value.session), ".demo.transition.lock");
  fs.writeFileSync(lock, JSON.stringify({ pid: 999999999, bootID: "dead", startTime: "0" }));
  assert.equal(value.transition()({ action: "start_run", sessionID: "ses_abc", run_id: "run-one" }).ok, true);
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }));
  assert.equal(value.transition()({ action: "finish_run", sessionID: "ses_abc", session_handoff: "handoff" }).code, "TRANSITION_LOCK_UNAVAILABLE");
});

test("finish accepts the explicit legacy root Run path", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(value.session, "run.md"), "legacy run\n");
  fs.mkdirSync(path.join(value.session, "ledger"));
  fs.writeFileSync(path.join(value.session, "ledger/0000.json"), JSON.stringify(ledger("DONE", null)));
  fs.writeFileSync(path.join(value.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 4, mode: "run", activeRun: { id: "legacy", path: "." } }));
  assert.equal(value.transition()({ action: "finish_run", sessionID: "ses_abc", session_handoff: "handoff" }).ok, true);
});

test("real Herdr rename adapter pins the validated tab and environment", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-rename-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const binary = path.join(root, "herdr");
  fs.writeFileSync(binary, "#!/bin/sh\n", { mode: 0o700 });
  const calls = [];
  const adapter = createHerdrRenameAdapter({ environment: { HERDR_BIN: binary, HERDR_SOCKET_PATH: "/wrong", HERDR_SESSION_ID: "old" }, execFileSync: (...args) => calls.push(args) });
  adapter.renameTab({ tabId: "tab-1", socket: "/run/herdr.sock" }, "renamed");
  assert.deepEqual(calls[0][0], binary);
  assert.deepEqual(calls[0][1], ["tab", "rename", "tab-1", "renamed"]);
  assert.equal(calls[0][2].env.HERDR_SOCKET_PATH, "/run/herdr.sock");
  assert.equal(calls[0][2].env.HERDR_SESSION_ID, undefined);
});

test("Herdr caller validation derives workspace and tab from a stable socket and pane identity", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-caller-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const head = path.join(root, ".claude/agents/head");
  fs.mkdirSync(head, { recursive: true });
  const snapshot = {
    panes: [{ pane_id: "pane-1", tab_id: "tab-1", workspace_id: "workspace-1", terminal_id: "terminal-1", cwd: head }],
    tabs: [{ tab_id: "tab-1", workspace_id: "workspace-1", label: "demo" }],
  };
  const caller = validateCaller({ socket: "/run/herdr.sock", paneId: "pane-1" }, { headCwd: head, readSnapshot: () => snapshot });
  assert.equal(caller.workspaceId, "workspace-1");
  assert.equal(caller.tabId, "tab-1");
  assert.equal(validateCaller({ socket: "/run/herdr.sock", paneId: "pane-1", tabId: "wrong" }, { headCwd: head, readSnapshot: () => snapshot }), null);
});

test("Herdr binary discovery uses explicit capability path then owner user-bin fallback", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-binary-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const binary = path.join(root, ".local/bin/herdr");
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, "#!/bin/sh\n", { mode: 0o700 });
  assert.equal(herdrBinary({ HOME: root }), binary);
  assert.equal(herdrBinary({ HOME: "/missing", HERDR_BIN: binary }), binary);
});

test("plugin schema exposes only semantic actions and delegates to supplied core", async () => {
  const calls = [];
  const schema = { enum: (values) => ({ values }), string: () => ({ optional: () => ({ optional: true }) }) };
  const plugin = await HeadSessionCore({ schema, transition: (input) => { calls.push(input); return { ok: true, session: "demo", mode: "session", activeRun: null, generation: 1 }; } });
  assert.deepEqual(plugin.tool.head_session.args.action.values, ["rename", "start_run", "finish_run"]);
  const text = await plugin.tool.head_session.execute({ action: "rename", new_name: "new" }, { sessionID: "ses_abc" });
  assert.match(text, /Session demo: session, active Run none, generation 1/);
  assert.deepEqual(calls[0], { action: "rename", new_name: "new", sessionID: "ses_abc" });
});
