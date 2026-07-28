import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCanonicalQuickContext, CanonicalQuickLifecycle } from "./canonical-quick-lifecycle.mjs";
import { CanonicalQuickStore, contained } from "./canonical-quick-store.mjs";
import { superviseCanonicalQuick } from "./canonical-quick-supervisor.mjs";

function host() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canonical-quick-"));
  const projectRoot = path.join(root, "project"), agentDir = path.join(projectRoot, ".claude", "agents", "worker"), stateRoot = path.join(root, "state");
  fs.mkdirSync(agentDir, { recursive: true }); fs.mkdirSync(stateRoot);
  const caller = { socket: "socket", workspaceId: "workspace", tabId: "head", paneId: "head-pane", terminalId: "head-terminal" };
  const context = createCanonicalQuickContext({ projectRoot, generation: "generation", caller, stateRoot, workers: { worker: agentDir } });
  const calls = { launch: 0, wait: 0, read: 0, notify: 0, close: 0 }, scheduled = [];
  const effects = {
    resolveWorker: ({ agent }) => context.workers[agent], resolveExecution: () => ({ runtime: "runtime" }),
    launch: ({ task }) => { calls.launch += 1; return { socket: caller.socket, workspaceId: caller.workspaceId, tabId: `${task.taskId}-tab`, paneId: `${task.taskId}-pane`, terminalId: `${task.taskId}-terminal`, runtimeSessionId: `session-${task.taskId}` }; },
    schedule: (work) => scheduled.push(work),
    wait: async ({ provenance }) => { calls.wait += 1; return provenance; }, read: async () => { calls.read += 1; return "diagnostic bytes"; },
    notify: async () => { calls.notify += 1; return true; }, close: async ({ provenance }) => { calls.close += 1; assert.match(provenance.tabId, /-tab$/); return true; },
  };
  const lifecycle = new CanonicalQuickLifecycle({ context, effects });
  return { root, context, calls, scheduled, effects, lifecycle };
}

async function runScheduled(value) { for (const work of value.scheduled.splice(0)) await work(); }

test("fresh launch reserves unique contained artifacts and returns exact durable provenance", async () => {
  const value = host();
  const first = value.lifecycle.launch({ taskId: "first", agent: "worker", command: "complete work" });
  const second = value.lifecycle.launch({ taskId: "second", agent: "worker", command: "complete work" });
  assert.equal(first.status, "running"); assert.notEqual(first.stateFile, second.stateFile);
  const state = JSON.parse(fs.readFileSync(first.stateFile));
  assert.deepEqual(state.provenance, { socket: "socket", workspaceId: "workspace", tabId: "first-tab", paneId: "first-pane", terminalId: "first-terminal", runtimeSessionId: "session-first", agentDir: value.context.workers.worker, launchedAt: state.provenance.launchedAt });
  assert.ok([first.stateFile, first.logFile, first.handoffFile].every((file) => contained(value.context.stateRoot, file)));
  assert.throws(() => value.lifecycle.launch({ taskId: "first", agent: "worker", command: "again" }));
  fs.writeFileSync(first.handoffFile, "result\n"); fs.writeFileSync(second.handoffFile, "result\n"); await runScheduled(value);
  assert.equal(JSON.parse(fs.readFileSync(first.stateFile)).cleanup.state, "closed");
});

test("success requires a direct nonempty handoff, then delivers and cleans up once", async () => {
  const value = host(), result = value.lifecycle.launch({ taskId: "success", agent: "worker", command: "complete work" });
  fs.writeFileSync(result.handoffFile, "completed result\n"); await runScheduled(value);
  const state = JSON.parse(fs.readFileSync(result.stateFile));
  assert.equal(state.status, "completed"); assert.equal(state.handoff.bytes, 17); assert.equal(state.notification.state, "delivered"); assert.equal(state.cleanup.state, "closed");
  await superviseCanonicalQuick(value.lifecycle, result.stateFile);
  assert.deepEqual(value.calls, { launch: 1, wait: 1, read: 1, notify: 1, close: 1 });
});

test("empty, launch, wait, read, delivery, and cleanup failures persist explicit terminal states", async () => {
  for (const [name, mutate, expected] of [
    ["empty", () => {}, "output_failed"],
    ["launch", (effects) => { effects.launch = () => { throw new Error("launch"); }; }, "launch_failed"],
    ["wait", (effects) => { effects.wait = async () => { throw new Error("wait"); }; }, "wait_failed"],
    ["read", (effects) => { effects.read = async () => { throw new Error("read"); }; }, "read_failed"],
    ["delivery", (effects) => { effects.notify = async () => false; }, "delivery_failed"],
    ["cleanup", (effects) => { effects.close = async () => false; }, "cleanup_failed"],
  ]) {
    const value = host(); mutate(value.effects); const result = value.lifecycle.launch({ taskId: name, agent: "worker", command: "complete work" });
    if (name !== "empty" && name !== "launch") fs.writeFileSync(result.handoffFile, "result\n");
    await runScheduled(value);
    assert.equal(JSON.parse(fs.readFileSync(result.stateFile)).status, expected, name);
  }
});

test("mismatched completion evidence and escaping handoffs fail closed", async () => {
  const value = host(); value.effects.wait = async ({ provenance }) => ({ ...provenance, terminalId: "drift" });
  const drift = value.lifecycle.launch({ taskId: "drift", agent: "worker", command: "complete work" }); fs.writeFileSync(drift.handoffFile, "result\n"); await runScheduled(value);
  assert.equal(JSON.parse(fs.readFileSync(drift.stateFile)).status, "wait_failed");
  const store = new CanonicalQuickStore({ stateRoot: value.context.stateRoot });
  assert.equal(store.handoff({ handoffFile: path.join(value.context.stateRoot, "outside.md") }).status, "output_failed");
});

test("repeated signals and restarted supervision converge without duplicate delivery or cleanup", async () => {
  const value = host(), result = value.lifecycle.launch({ taskId: "repeat", agent: "worker", command: "complete work" });
  fs.writeFileSync(result.handoffFile, "result\n"); await runScheduled(value);
  await Promise.all([superviseCanonicalQuick(value.lifecycle, result.stateFile), superviseCanonicalQuick(value.lifecycle, result.stateFile)]);
  assert.equal(value.calls.notify, 1); assert.equal(value.calls.close, 1);
});

test("canonical lifecycle bytes contain no product or runtime-policy literals", () => {
  for (const file of ["canonical-quick-lifecycle.mjs", "canonical-quick-store.mjs", "canonical-quick-supervisor.mjs"]) {
    const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    for (const forbidden of ["NoahChat", "Qdrant", "chat_quality_reviewer", "gpt-5", "Herdr"]) assert.equal(source.includes(forbidden), false, `${file}:${forbidden}`);
  }
});
