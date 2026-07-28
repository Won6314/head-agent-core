import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateSessionStates } from "../packages/opencode-runtime/runtime/opencode/bin/migrate-session-states.mjs";

function record(type) {
  return { id: "cp-0000", at: "2026-07-27T00:00:00Z", horizon: { slice: null, wave: null }, expected: "test", observed: "test", evidence: [], decision: { type, reason: "test" }, next: { output: "test", slice: null, wave: null } };
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-state-migration-"));
  const head = path.join(root, ".claude/agents/head");
  fs.mkdirSync(path.join(head, "sessions"), { recursive: true });
  const session = (name) => {
    const directory = path.join(head, "sessions", name);
    fs.mkdirSync(directory); fs.writeFileSync(path.join(directory, "context.md"), "context\n");
    return directory;
  };
  return { root, head, session };
}
function checkpoint(directory, type) {
  fs.mkdirSync(path.join(directory, "ledger"));
  fs.writeFileSync(path.join(directory, "ledger/0000.json"), JSON.stringify(record(type)));
}

test("classifies every missing-state authority combination without reading Session prose", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const done = value.session("done"); checkpoint(done, "DONE");
  const active = value.session("active"); checkpoint(active, "START"); fs.writeFileSync(path.join(active, "run.md"), "run\n");
  value.session("empty");
  const ledgerOnly = value.session("ledger-only"); checkpoint(ledgerOnly, "START");
  const runOnly = value.session("run-only"); fs.writeFileSync(path.join(runOnly, "run.md"), "run\n");
  const receipt = migrateSessionStates({ headDirectory: value.head });
  assert.equal(receipt.dryRun, true);
  assert.deepEqual(receipt.considered.map(({ session, classification, outcome }) => ({ session, classification, outcome })), [
    { session: "active", classification: "run", outcome: "would_create" },
    { session: "done", classification: "session", outcome: "would_create" },
    { session: "empty", classification: "session", outcome: "would_create" },
    { session: "ledger-only", classification: "ambiguous", outcome: "ambiguous" },
    { session: "run-only", classification: "ambiguous", outcome: "ambiguous" },
  ]);
  assert.equal(fs.existsSync(path.join(active, "session-state.json")), false);
});

test("apply writes only eligible state atomically and never overwrites existing state", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const active = value.session("active"); checkpoint(active, "START"); fs.writeFileSync(path.join(active, "run.md"), "run\n");
  const existing = value.session("existing");
  const prior = '{"schema":1,"generation":9,"mode":"session","activeRun":null}\n';
  fs.writeFileSync(path.join(existing, "session-state.json"), prior);
  const corrupt = value.session("corrupt"); fs.writeFileSync(path.join(corrupt, "session-state.json"), "not json");
  const receipt = migrateSessionStates({ headDirectory: value.head, apply: true });
  assert.deepEqual(receipt.created, ["sessions/active/session-state.json"]);
  assert.deepEqual(receipt.skipped, ["sessions/existing/session-state.json"]);
  assert.deepEqual(receipt.errors, ["sessions/corrupt/session-state.json"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(active, "session-state.json"), "utf8")), { schema: 1, generation: 0, mode: "run", activeRun: { id: "legacy-root", path: "." } });
  assert.equal(fs.readFileSync(path.join(existing, "session-state.json"), "utf8"), prior);
  assert.deepEqual(fs.readdirSync(active).filter((name) => name.includes(".tmp")), []);
});

test("considers only direct Session directories with a regular context file", (t) => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  value.session("direct");
  fs.mkdirSync(path.join(value.head, "sessions/container"));
  fs.mkdirSync(path.join(value.head, "sessions/container/nested"));
  fs.writeFileSync(path.join(value.head, "sessions/container/nested/context.md"), "nested\n");
  fs.mkdirSync(path.join(value.head, "sessions/no-context"));
  const receipt = migrateSessionStates({ headDirectory: value.head });
  assert.deepEqual(receipt.considered.map((entry) => entry.session), ["direct"]);
});
