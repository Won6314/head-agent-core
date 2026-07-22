import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { buildHeadPrompt, buildRuntimeConfig, findProjectRoot } from "../bin/render-runtime-config.mjs";
import { CompactRecovery, loadCompactInstructions } from "../plugins/compact-recovery.mjs";
import { ContextLayers, createContextLayers } from "../plugins/context-layers.mjs";

const roots = [];
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
  it("declares the three always-on context layers and shared planning skills", () => {
    const config = buildRuntimeConfig();
    assert.deepEqual(config.instructions, ["~/.local/share/head-agent-core/head/HEAD_CORE.md", "CLAUDE.md", "HEAD_CONTEXT.md"]);
    assert.deepEqual(config.skills.paths, ["~/.local/share/head-agent-core/skills", ".claude/skills"]);
    assert.deepEqual(config.plugin, ["./save-opencode-session-id.js", "./opencode/plugins/context-layers.mjs", "./opencode/plugins/compact-recovery.mjs"]);
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

  it("loads compact instructions from the dedicated runtime contract", () => {
    assert.match(loadCompactInstructions(), /"history_append"/);
    const contract = path.join(os.tmpdir(), `compact-contract-${process.pid}-${Date.now()}.md`);
    roots.push(contract);
    fs.writeFileSync(contract, "dedicated compact contract\n");
    assert.equal(loadCompactInstructions(contract), "dedicated compact contract");
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

  it("runs CLI entry points through project symlinks", () => {
    const root = project("runtime-symlink-cli");
    const bin = path.join(root, ".claude", "agents", "head", "opencode", "bin");
    fs.mkdirSync(bin, { recursive: true });
    const runtimeTarget = path.resolve(import.meta.dirname, "../bin/render-runtime-config.mjs");
    const runtimeLink = path.join(bin, "render-runtime-config.mjs");
    fs.symlinkSync(runtimeTarget, runtimeLink);

    assert.equal(execFileSync(process.execPath, [runtimeLink, "--location-json"], { cwd: root, encoding: "utf8", env: {} }), "null");
  });

  it("persists a compact summary only inside the configured project", async () => {
    const root = project("runtime-compact-update");
    const session = path.join(root, ".claude", "agents", "head", "sessions", "active");
    const state = path.join(root, ".claude", "agents", "head", "opencode", "state", "sessions");
    const hooksDir = path.join(root, ".claude", "hooks");
    fs.mkdirSync(state, { recursive: true });
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(session, "progress.md"), "## Current State\n- before\n");
    fs.writeFileSync(path.join(state, "ses_Test123.json"), JSON.stringify({ sessionName: "active" }));
    fs.symlinkSync(path.resolve(import.meta.dirname, "../../claude-hooks/compact-session-update.py"), path.join(hooksDir, "compact-session-update.py"));
    const summary = `summary\n\`\`\`json\n${JSON.stringify({ session: "active", progress: { current_state: "- after" }, history_append: "" })}\n\`\`\``;
    const hooks = await CompactRecovery({
      directory: path.join(root, ".claude", "agents", "head"),
      client: { session: { messages: async () => ({ data: [{ info: { summary: { body: summary } } }] }) } },
    });

    await hooks.event({ event: { type: "session.compacted", properties: { sessionID: "ses_Test123" } } });
    assert.match(fs.readFileSync(path.join(session, "progress.md"), "utf8"), /- after/);
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

  it("injects the compact contract only while compacting and ignores stale snapshots", async () => {
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

    const recovery = await CompactRecovery({ directory: path.join(root, ".claude", "agents", "head"), buildPrompt: activePrompt });
    const compacting = { context: [] };
    await recovery["experimental.session.compacting"]({ sessionID: "ses_Compact123" }, compacting);
    assert.match(compacting.context[0], /"history_append"/);
    assert.match(compacting.context[1], /normal context/);
    assert.match(compacting.context[1], /normal run/);

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
