import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import { buildHeadPrompt, buildRuntimeConfig, findProjectRoot, loadSessionRecord, processIncarnation, saveSessionRecord } from "../bin/render-runtime-config.mjs";
import CompactRecoveryPlugin from "../plugins/compact-recovery.mjs";
import ContextLayersPlugin from "../plugins/context-layers.mjs";
import { compactProjection, CompactRecovery, latestUserModel } from "../plugins/compact-recovery-core.mjs";
import { ContextLayers, createContextLayers } from "../plugins/context-layers-core.mjs";

const roots = [];
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function project(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  roots.push(root);
  const head = path.join(root, ".claude", "agents", "head");
  fs.mkdirSync(path.join(head, "sessions", "active"), { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Project\n");
  fs.writeFileSync(path.join(head, "CLAUDE.md"), "# HEAD\n");
  return root;
}
function activePrompt(args) { return buildHeadPrompt({ ...args, location: { sessionName: "active" } }); }
function activeLayers(root) { return createContextLayers({ root, buildPrompt: activePrompt }); }

describe("shared OpenCode runtime contract", () => {
  it("exposes one V1 server plugin from each runtime entry", async () => {
    const compactEntry = await import("../plugins/compact-recovery.mjs");
    const contextEntry = await import("../plugins/context-layers.mjs");
    assert.deepEqual(Object.keys(compactEntry), ["default"]);
    assert.deepEqual(Object.keys(contextEntry), ["default"]);
    assert.deepEqual(CompactRecoveryPlugin, { id: "head-core-compact-recovery", server: CompactRecovery });
    assert.deepEqual(ContextLayersPlugin, { id: "head-core-context-layers", server: ContextLayers });
  });

  it("retires the legacy config emitter while retaining location and prompt utilities", () => {
    assert.throws(() => buildRuntimeConfig(), /Legacy runtime config emission is retired.*runtime\/config\/bin\/render-config\.mjs/);
    const executable = path.resolve(TEST_DIRECTORY, "../bin/render-runtime-config.mjs");
    const result = spawnSync(process.execPath, [executable], { encoding: "utf8" });
    assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.match(result.stderr, /Legacy runtime config emission is retired.*render-config\.mjs/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /"permission"\s*:\s*"allow"|~\//);
  });

  it("derives state and prompt files from the active project only", () => {
    const one = project("runtime-one");
    const two = project("runtime-two");
    fs.writeFileSync(path.join(one, ".claude", "agents", "head", "sessions", "active", "context.md"), "one context");
    fs.writeFileSync(path.join(two, ".claude", "agents", "head", "sessions", "active", "context.md"), "two context");
    assert.equal(findProjectRoot(path.join(one, ".claude", "agents", "head")), one);
    const result = buildHeadPrompt({ root: two, location: { sessionName: "active" } });
    assert.match(result.prompt, /two context/);
    assert.doesNotMatch(result.prompt, /one context/);
  });

  it("durably atomically saves session state and propagates write failures", () => {
    const root = project("runtime-state-durable"), sessionID = "ses_DurableState123";
    saveSessionRecord(sessionID, { first: true }, root);
    saveSessionRecord(sessionID, { second: true }, root);
    assert.deepEqual(loadSessionRecord(sessionID, root), { first: true, second: true });
    const rename = fs.renameSync;
    fs.renameSync = () => { throw new Error("rename failure"); };
    try { assert.throws(() => saveSessionRecord(sessionID, { failed: true }, root), /rename failure/); }
    finally { fs.renameSync = rename; }
    assert.deepEqual(loadSessionRecord(sessionID, root), { first: true, second: true });
    const target = path.join(root, ".claude", "agents", "head", "opencode", "state", "sessions", `${sessionID}.json`);
    fs.writeFileSync(target, "{ malformed");
    assert.throws(() => saveSessionRecord(sessionID, { lost: true }, root));
    assert.equal(fs.readFileSync(target, "utf8"), "{ malformed");
  });

  it("reclaims a PID-reused lock incarnation but retains a verified current owner identity", () => {
    const root = project("runtime-lock-incarnation"), sessionID = "ses_PidReuse123";
    const dir = path.join(root, ".claude", "agents", "head", "opencode", "state", "sessions");
    fs.mkdirSync(dir, { recursive: true });
    const lock = path.join(dir, `.${sessionID}.lock`);
    const current = processIncarnation();
    if (current.bootID && current.startTime) {
      fs.writeFileSync(lock, JSON.stringify({ ...current, bootID: "different-boot", startTime: "0" }));
      saveSessionRecord(sessionID, { reclaimed: true }, root);
      assert.equal(loadSessionRecord(sessionID, root).reclaimed, true);
      fs.writeFileSync(lock, JSON.stringify(current));
      // The identity comparison itself is deterministic; we deliberately do
      // not evict a real current process merely because a lock is old.
      assert.deepEqual(processIncarnation(), current);
      fs.unlinkSync(lock);
    }
  });

  it("removes compact checkpoint pairs from future model context", () => {
    const messages = [
      { info: { id: "normal-user", role: "user" }, parts: [{ type: "text", text: "work" }] },
      { info: { id: "compact-user", role: "user" }, parts: [{ type: "compaction" }] },
      { info: { id: "compact-assistant", role: "assistant", summary: true, mode: "compaction" }, parts: [{ type: "text", text: "checkpoint" }] },
      { info: { id: "normal-assistant", role: "assistant", summary: false, mode: "build" }, parts: [{ type: "text", text: "result" }] },
      { info: { id: "continue-user", role: "user" }, parts: [{ type: "text", text: "Continue if you have next steps", synthetic: true, metadata: { compaction_continue: true } }] },
    ];
    const projected = compactProjection(messages);
    assert.deepEqual(projected.map((message) => message.info.id), ["normal-user", "normal-assistant", "continue-user"]);
    assert.equal(projected.at(-1).parts[0].text, "continue");
  });

  it("selects the latest user model for an explicit checkpoint compaction", () => {
    const messages = [
      { info: { role: "user", model: { providerID: "openai", modelID: "old" } } },
      { info: { role: "assistant", modelID: "assistant-model", providerID: "openai" } },
      { info: { role: "user", model: { providerID: "openai", modelID: "gpt-5.6-sol" } } },
    ];
    assert.deepEqual(latestUserModel(messages), { providerID: "openai", modelID: "gpt-5.6-sol" });
  });

  it("injects only the fixed session context and run", () => {
    const root = project("runtime-current");
    const session = path.join(root, ".claude", "agents", "head", "sessions", "active");
    fs.mkdirSync(path.join(session, "runs", "task", "slices"), { recursive: true });
    fs.writeFileSync(path.join(session, "context.md"), "context marker");
    fs.writeFileSync(path.join(session, "run.md"), "fixed run marker");
    fs.writeFileSync(path.join(session, "runs", "task", "run.md"), "nested run marker");
    fs.writeFileSync(path.join(session, "runs", "task", "slices", "01.md"), "slice marker");
    fs.writeFileSync(path.join(session, "active-run.json"), JSON.stringify({ status: "active", run_path: "runs/task/run.md", current_slice: "runs/task/slices/01.md" }));
    fs.writeFileSync(path.join(session, "current.md"), "current marker");
    fs.writeFileSync(path.join(session, "progress.md"), "## Active Work\nprogress marker");
    fs.writeFileSync(path.join(session, "history.md"), "history marker");
    const prompt = buildHeadPrompt({ root, location: { sessionName: "active" } }).prompt;
    assert.ok(prompt.indexOf("context marker") < prompt.indexOf("fixed run marker"));
    assert.doesNotMatch(prompt, /nested run marker|slice marker|current marker|progress marker|history marker/);
  });

  it("quietly omits missing fixed files without selecting a fallback", () => {
    const root = project("runtime-fixed-files");
    const session = path.join(root, ".claude", "agents", "head", "sessions", "active");
    fs.mkdirSync(path.join(session, "runs", "task"), { recursive: true });
    fs.writeFileSync(path.join(session, "runs", "task", "run.md"), "fallback run marker");
    fs.writeFileSync(path.join(session, "active-run.json"), JSON.stringify({ status: "active", run_path: "runs/task/run.md" }));
    fs.writeFileSync(path.join(session, "progress.md"), "fallback progress marker");
    assert.equal(buildHeadPrompt({ root, location: { sessionName: "active" } }).prompt, "");

    fs.writeFileSync(path.join(session, "context.md"), "context only marker");
    assert.match(buildHeadPrompt({ root, location: { sessionName: "active" } }).prompt, /context only marker/);
    assert.doesNotMatch(buildHeadPrompt({ root, location: { sessionName: "active" } }).prompt, /fallback run marker|fallback progress marker/);
  });

  it("runs CLI entry points through a project-local regular wrapper", () => {
    const root = project("runtime-symlink-cli");
    const bin = path.join(root, ".claude", "agents", "head", "opencode", "bin");
    fs.mkdirSync(bin, { recursive: true });
    const runtimeTarget = path.resolve(TEST_DIRECTORY, "../bin/render-runtime-config.mjs");
    const runtimeLink = path.join(bin, "render-runtime-config.mjs");
    fs.writeFileSync(runtimeLink, `import { spawnSync } from "node:child_process";\nconst result = spawnSync(process.execPath, [${JSON.stringify(runtimeTarget)}, ...process.argv.slice(2)], { stdio: "inherit" });\nif (result.error) throw result.error;\nprocess.exit(result.status ?? 1);\n`);

    assert.equal(execFileSync(process.execPath, [runtimeLink, "--location-json"], { cwd: root, encoding: "utf8", env: {} }), "null");
  });

  it("excludes checkpoint and synthetic continuation artifacts from future turns", async () => {
    const root = project("runtime-compact-continuation-projection");
    const hooks = await CompactRecovery({ root });
    const payload = `\`\`\`json\n${JSON.stringify({ session: "active", progress: { current_state: "private checkpoint marker" }, history_append: "" })}\n\`\`\``;
    const messages = [
      { info: { id: "normal-user", role: "user" }, parts: [{ type: "text", text: "normal request" }] },
      { info: { id: "normal-assistant", role: "assistant" }, parts: [{ type: "text", text: "normal result" }] },
      { info: { id: "compact-user", role: "user" }, parts: [{ type: "compaction" }] },
      { info: { id: "compact-assistant", role: "assistant", summary: true, mode: "compaction" }, parts: [{ type: "text", text: payload }] },
      { info: { id: "continue-user", role: "user" }, parts: [{ type: "text", text: "Continue if you have next steps", synthetic: true, metadata: { compaction_continue: true } }] },
    ];
    const output = { messages };

    await hooks["experimental.chat.messages.transform"]({}, output);

    assert.equal(output.messages, messages);
    assert.deepEqual(messages.map((message) => message.info.id), ["normal-user", "normal-assistant", "continue-user"]);
    assert.equal(messages.at(-1).parts[0].text, "continue");
    assert.doesNotMatch(JSON.stringify(messages), /private checkpoint marker|history_append/);
  });

  it("does not use a persisted session record as a prompt fallback", async () => {
    const root = project("runtime-plugin-directory");
    const session = path.join(root, ".claude", "agents", "head", "sessions", "active");
    const state = path.join(root, ".claude", "agents", "head", "opencode", "state", "sessions");
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(session, "context.md"), "directory context marker");
    fs.writeFileSync(path.join(session, "run.md"), "directory run marker");
    fs.writeFileSync(path.join(session, "current.md"), "directory current marker");
    fs.writeFileSync(path.join(session, "progress.md"), "## Active Work\ndirectory progress marker");
    fs.writeFileSync(path.join(state, "ses_Context123.json"), JSON.stringify({ sessionName: "active" }));
    const hooks = await ContextLayers({ directory: path.join(root, ".claude", "agents", "head") });
    const output = { system: [] };

    await hooks["experimental.chat.system.transform"]({ sessionID: "ses_Context123" }, output);
    assert.deepEqual(output.system, []);
  });

  it("does not search, cache, or inject tips automatically", async () => {
    const root = project("runtime-no-tips");
    const session = path.join(root, ".claude", "agents", "head", "sessions", "active");
    const state = path.join(root, ".claude", "agents", "head", "opencode", "state", "sessions");
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(session, "context.md"), "context marker");
    fs.writeFileSync(path.join(state, "ses_NoTips123.json"), JSON.stringify({ sessionName: "active", tipSearchTips: "stale tip" }));
    const hooks = activeLayers(root);
    const output = { system: [] };
    await hooks["experimental.chat.system.transform"]({ sessionID: "ses_NoTips123" }, output);
    assert.doesNotMatch(output.system[0], /Relevant Tips|stale tip/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(state, "ses_NoTips123.json"), "utf8")).tipSearchCompleted, undefined);
  });

  it("rebuilds context so a newly created fixed run appears without restarting the session", async () => {
    const root = project("runtime-live-run");
    const session = path.join(root, ".claude", "agents", "head", "sessions", "active");
    const state = path.join(root, ".claude", "agents", "head", "opencode", "state", "sessions");
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(session, "context.md"), "context marker");
    fs.writeFileSync(path.join(state, "ses_LiveRun123.json"), JSON.stringify({ sessionName: "active" }));
    const layers = activeLayers(root);
    const before = { system: [] };
    await layers["experimental.chat.system.transform"]({ sessionID: "ses_LiveRun123" }, before);
    assert.doesNotMatch(before.system[0], /live run marker/);
    fs.writeFileSync(path.join(session, "run.md"), "live run marker");
    const after = { system: [] };
    await layers["experimental.chat.system.transform"]({ sessionID: "ses_LiveRun123" }, after);
    assert.match(after.system[0], /live run marker/);
  });

  it("suppresses canonical context during compaction and restores it on the next normal turn", async () => {
    const root = project("runtime-compact-injection");
    const session = path.join(root, ".claude", "agents", "head", "sessions", "active");
    const state = path.join(root, ".claude", "agents", "head", "opencode", "state", "sessions");
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(session, "context.md"), "normal context");
    fs.writeFileSync(path.join(session, "run.md"), "normal run");
    fs.writeFileSync(path.join(state, "ses_Compact123.json"), JSON.stringify({ sessionName: "active" }));
    const normal = { system: [] };
    const layers = activeLayers(root);
    await layers["experimental.chat.system.transform"]({ sessionID: "ses_Compact123" }, normal);
    assert.doesNotMatch(normal.system[0], /"history_append"/);

    const recovery = await CompactRecovery({ directory: path.join(root, ".claude", "agents", "head") });
    const compacting = { context: ["default summary instructions"] };
    await recovery["experimental.session.compacting"]({ sessionID: "ses_Compact123" }, compacting);
    const compactSystem = { system: [] };
    await layers["experimental.chat.system.transform"]({ sessionID: "ses_Compact123" }, compactSystem);
    assert.deepEqual(compacting.context, []);
    assert.deepEqual(compactSystem.system, []);

    const snapshot = path.join(root, "snapshot.md");
    fs.writeFileSync(snapshot, "snapshot marker");
    fs.writeFileSync(path.join(state, "ses_Compact123.json"), JSON.stringify({ sessionName: "active", compactSnapshotPath: snapshot, needsReinject: true }));
    fs.writeFileSync(path.join(session, "context.md"), "fresh context");
    fs.writeFileSync(path.join(session, "run.md"), "fresh run");
    const reinject = activeLayers(root);
    const output = { system: [] };
    await reinject["experimental.chat.system.transform"]({ sessionID: "ses_Compact123" }, output);
    assert.match(output.system[0], /fresh context/);
    assert.match(output.system[0], /fresh run/);
    assert.doesNotMatch(output.system[0], /snapshot marker/);
  });
});
