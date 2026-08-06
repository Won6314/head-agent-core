import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installHost, releaseIdentity } from "./host-installer.mjs";
import { initializeProject } from "./project-initializer.mjs";
import { createOnePaneWorkerLauncher } from "../coordination/mcp/host-coordination/worker-launcher.mjs";

const source = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const snapshot = (root) => {
  const entries = [];
  const visit = (current) => { for (const name of fs.readdirSync(current).sort()) { const file = path.join(current, name), relative = path.relative(root, file), stat = fs.lstatSync(file); if (stat.isDirectory()) visit(file); else entries.push([relative, fs.readFileSync(file).toString("base64"), stat.mode & 0o777]); } };
  visit(root); return entries;
};
function executable(file, body) { fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o700 }); }
function runtime(root) {
  const bin = path.join(root, "bin"), effects = path.join(root, "effects"); fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  executable(path.join(bin, "opencode"), "printf '{\"ok\":true}\\n'");
  executable(path.join(bin, "herdr"), `if [ "$1" = integration ]; then if [ "$2" = status ]; then [ "$#" -eq 2 ] || { printf 'usage: herdr integration status [--outdated-only]\\n' >&2; exit 64; }; printf 'herdr integrations\\nopencode: current (v9) (/tmp/herdr-agent-state.js)\\nclaude: not installed (/tmp/claude-agent-state.js)\\n'; elif [ "$2" = install ]; then printf install >> ${JSON.stringify(effects)}; fi; exit 0; fi; printf '{"result":{"snapshot":{"protocol":17,"workspaces":[],"tabs":[],"panes":[]}}}\\n'`);
  return { bin, effects };
}
function integrationRuntime(root, name, initial, installed = "current") {
  const binary = path.join(root, "bin", name), state = path.join(root, `${name}-state`), effects = path.join(root, `${name}-effects`);
  fs.writeFileSync(state, initial);
  executable(binary, `if [ "$1" = api ]; then printf '{"result":{"snapshot":{"protocol":17,"workspaces":[],"tabs":[],"panes":[]}}}\\n'; exit 0; fi
if [ "$1" = integration ] && [ "$2" = status ]; then [ "$#" -eq 2 ] || { printf 'usage: herdr integration status [--outdated-only]\\n' >&2; exit 64; }; IFS= read -r state < ${JSON.stringify(state)}; case "$state" in current) printf 'integrations\\nopencode: current (v9) (/tmp/herdr-agent-state.js)\\nclaude: not installed (/tmp/claude-agent-state.js)\\n' ;; not\\ installed) printf 'integrations\\nopencode: not installed (/tmp/herdr-agent-state.js)\\nclaude: current (v1) (/tmp/claude.js)\\n' ;; outdated) printf 'integrations\\nopencode: outdated (v8) (/tmp/herdr-agent-state.js)\\n' ;; malformed) printf 'opencode: unknown status\\n' ;; duplicate) printf 'opencode: current (v9) (/tmp/a.js)\\nopencode: not installed (/tmp/herdr-agent-state.js)\\n' ;; absent) printf 'claude: not installed (/tmp/claude-agent-state.js)\\n' ;; esac; exit 0; fi
if [ "$1" = integration ] && [ "$2" = install ]; then printf install >> ${JSON.stringify(effects)}; printf ${JSON.stringify(installed)} > ${JSON.stringify(state)}; exit 0; fi`);
  return { binary, state, effects };
}
function serviceAdapter() {
  let child;
  return {
    effects: [],
    fail: false,
    restart({ config }) { if (child) { child.kill("SIGTERM"); childProcess.spawnSync("sleep", ["0.1"]); } if (this.fail) { this.fail = false; throw new Error("forced boot failure"); } const installed = JSON.parse(fs.readFileSync(config)); child = childProcess.spawn(process.execPath, [path.join(installed.releaseRoot, "packages", "project-init", "head.mjs"), "daemon", "--config", config], { stdio: "ignore" }); this.effects.push("restart"); },
    stop() { if (child) { child.kill("SIGTERM"); childProcess.spawnSync("sleep", ["0.1"]); } child = null; },
  };
}
async function bridgeHealth(command, env, endpoint) {
  const child = childProcess.spawn(command, [`agent-${endpoint}`], { env, stdio: ["pipe", "pipe", "pipe"] }); child.stdin.end('{"jsonrpc":"2.0","id":1,"method":"health"}\n'); let output = ""; for await (const part of child.stdout) output += part; assert.match(output, new RegExp(`"endpoint":"${endpoint}"`));
}

test("isolated installed artifact converges, upgrades, and restores exact authorities", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-install-")), socket = path.join(root, "herdr.sock"), socketServer = net.createServer(); await new Promise((resolve) => socketServer.listen(socket, resolve));
  const { bin, effects } = runtime(root), env = { HOME: path.join(root, "home"), XDG_DATA_HOME: path.join(root, "data"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state"), XDG_BIN_HOME: path.join(root, "user-bin"), PATH: bin, HERDR_SOCKET_PATH: socket, HERDR_WORKSPACE_ID: "workspace", HERDR_TAB_ID: "tab", HERDR_PANE_ID: "pane" }, adapter = serviceAdapter();
  try {
    const first = installHost({ releaseRoot: source, env, socket, adapter }); assert.equal(first.status, "installed");
    const config = JSON.parse(fs.readFileSync(first.config)); assert.equal(config.release, releaseIdentity(source).identity); assert.equal(config.endpoint.startsWith("http://127.0.0.1:"), true); assert.deepEqual(Object.keys(config).sort(), ["endpoint", "herdrPath", "opencodePath", "release", "releaseRoot", "schemaVersion", "service", "socketPath", "stateRoot"]); assert.equal(fs.existsSync(path.join(env.XDG_BIN_HOME, "head")), true); assert.match(fs.readFileSync(first.serviceFile, "utf8"), /user-bin\/head/); await bridgeHealth(path.join(env.XDG_BIN_HOME, "head"), env, "task"); await bridgeHealth(path.join(env.XDG_BIN_HOME, "head"), env, "comm");
    const bytes = fs.readFileSync(first.config), repeats = adapter.effects.length; const repeat = installHost({ releaseRoot: source, env, socket, adapter }); assert.equal(repeat.converged, true); assert.equal(adapter.effects.length, repeats); assert.deepEqual(fs.readFileSync(first.config), bytes); assert.equal(fs.existsSync(effects), false);
    const v2 = path.join(root, "v2"); fs.cpSync(source, v2, { recursive: true }); fs.writeFileSync(path.join(v2, "packages", "project-init", "release-marker.mjs"), "export const release = 2;\n"); const upgraded = installHost({ releaseRoot: v2, env, socket, adapter }); assert.equal(upgraded.status, "installed"); assert.notEqual(JSON.parse(fs.readFileSync(upgraded.config)).release, config.release); assert.equal(adapter.effects.length, repeats + 1);
    const prior = fs.readFileSync(upgraded.config), priorCurrent = fs.realpathSync(upgraded.current); const bad = path.join(root, "bad"); fs.cpSync(v2, bad, { recursive: true }); fs.writeFileSync(path.join(bad, "packages", "project-init", "second-marker.mjs"), "export const release = 3;\n"); adapter.fail = true; const failed = installHost({ releaseRoot: bad, env, socket, adapter }); assert.equal(failed.status, "rolled_back"); assert.deepEqual(fs.readFileSync(upgraded.config), prior); assert.equal(fs.realpathSync(upgraded.current), priorCurrent);
    const clean = path.join(root, "clean"), badAdapter = { restart: () => { throw new Error("boot failed"); }, stop: () => {} }; const firstFailure = installHost({ releaseRoot: source, env: { ...env, XDG_DATA_HOME: path.join(clean, "data"), XDG_CONFIG_HOME: path.join(clean, "config"), XDG_STATE_HOME: path.join(clean, "state"), XDG_BIN_HOME: path.join(clean, "bin") }, socket, adapter: badAdapter }); assert.equal(firstFailure.status, "rolled_back"); assert.equal(fs.existsSync(path.join(clean, "data", "head", "current")), false); assert.equal(fs.existsSync(path.join(clean, "config", "head", "host.json")), false); assert.equal(fs.existsSync(path.join(clean, "bin", "head")), false); assert.equal(fs.existsSync(path.join(clean, "config", "systemd", "user", "head-coordination.service")), false);
    const occupied = net.createServer(); await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve)); const occupiedPort = occupied.address().port; assert.throws(() => installHost({ releaseRoot: source, env, socket, adapter, port: occupiedPort })); await new Promise((resolve) => occupied.close(resolve));
  } finally { adapter.stop(); await new Promise((resolve) => socketServer.close(resolve)); }
});

test("worker launcher inherits OpenCode model when policy omits it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-model-")), binary = path.join(root, "opencode"); executable(binary, "exit 0"); const calls = [];
  const task = { workspaceId: "workspace", tabId: "tab", paneId: "pane", terminalId: "terminal", agentDir: root, command: "work" }, pane = { socket: "socket", workspaceId: "workspace", tabId: "tab", paneId: "pane", terminalId: "terminal" };
  const runtime = { invokeVoid: (_socket, argv) => calls.push(argv), snapshot: () => ({ panes: [{ workspace_id: "workspace", tab_id: "tab", pane_id: "pane", terminal_id: "terminal", cwd: root, agent: "opencode", agent_session: { source: "herdr:opencode", value: "ses_model" } }] }) };
  const launcher = createOnePaneWorkerLauncher({ runtime, resolveOpenCodeBinary: () => binary, timeoutMs: 1 }); launcher({ task, execution: { runtime: "opencode", model: "", variant: "" }, rootPane: pane }); assert.equal(calls[0].includes("--model"), false); assert.equal(calls[0].includes("--auto"), true);
  const explicit = createOnePaneWorkerLauncher({ runtime, resolveOpenCodeBinary: () => binary, timeoutMs: 1 }); explicit({ task, execution: { runtime: "opencode", model: "provider/model", variant: "" }, rootPane: pane }); assert.deepEqual(calls[1].slice(3, 10), [binary, "run", "--format", "json", "--auto", "--model", "provider/model"]);
});

test("installed project init executes recovery and rolls back only its registration", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-installed-project-")), socket = path.join(root, "herdr.sock"), socketServer = net.createServer(); await new Promise((resolve) => socketServer.listen(socket, resolve));
  const { bin } = runtime(root), env = { HOME: path.join(root, "home"), XDG_DATA_HOME: path.join(root, "data"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state"), XDG_BIN_HOME: path.join(root, "user-bin"), PATH: bin, HERDR_SOCKET_PATH: socket }, adapter = serviceAdapter();
  try {
    const installed = installHost({ releaseRoot: source, env, socket, adapter }); assert.equal(installed.status, "installed");
    const recovery = path.join(installed.current, "packages/opencode-runtime/runtime/resume-session.sh"); assert.equal(fs.statSync(recovery).mode & 0o500, 0o500);
    const plugin = path.join(installed.current, "packages/opencode-runtime/runtime/opencode/plugins/head-core-first.mjs"); const pluginSource = path.join(source, "packages/opencode-runtime/runtime/opencode/plugins/head-core-first.mjs"); assert.equal(fs.statSync(plugin).mode & 0o500, 0o400);
    fs.unlinkSync(plugin);
    const registry = path.join(env.XDG_STATE_HOME, "head", "bindings.json");
    const failedNew = path.join(root, "failed-new"); assert.throws(() => initializeProject({ target: failedNew, env }), /ENOENT/); assert.equal(fs.existsSync(failedNew), false); assert.deepEqual(JSON.parse(fs.readFileSync(registry)), []);
    fs.copyFileSync(pluginSource, plugin); fs.chmodSync(plugin, 0o400);
    const target = path.join(root, "project"); initializeProject({ target, env });
    assert.equal(childProcess.execFileSync(path.join(target, "scripts/resume-session.sh"), ["--list"], { encoding: "utf8" }), "");
    const before = snapshot(target), binding = fs.readFileSync(registry); fs.unlinkSync(plugin);
    assert.throws(() => initializeProject({ target, env }), /ENOENT/);
    assert.deepEqual(snapshot(target), before); assert.deepEqual(fs.readFileSync(registry), binding);
  } finally { adapter.stop(); await new Promise((resolve) => socketServer.close(resolve)); }
});

test("host install preflights without mutation and supports exact integration and macOS descriptors", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-install-preflight-")), socket = path.join(root, "herdr.sock"), socketServer = net.createServer(); await new Promise((resolve) => socketServer.listen(socket, resolve));
  const { bin, effects } = runtime(root), base = { HOME: path.join(root, "home"), XDG_DATA_HOME: path.join(root, "data"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state"), XDG_BIN_HOME: path.join(root, "user-bin"), PATH: bin, HERDR_SOCKET_PATH: socket };
  const untouched = (env) => { assert.equal(fs.existsSync(path.join(env.XDG_DATA_HOME, "head")), false); assert.equal(fs.existsSync(path.join(env.XDG_CONFIG_HOME, "head")), false); assert.equal(fs.existsSync(path.join(env.XDG_BIN_HOME, "head")), false); };
  try {
    for (const [name, options] of [["runtime", { env: { ...base, PATH: path.join(root, "none") } }], ["platform", { env: base, platform: "win32" }]]) {
      assert.throws(() => installHost({ releaseRoot: source, socket, adapter: { restart() {}, stop() {} }, ...options }), undefined, name); untouched(options.env);
    }
    const invalidHerdr = path.join(bin, "herdr-invalid"); executable(invalidHerdr, "printf '{\"result\":{\"snapshot\":{\"protocol\":0}}}\\n'"); assert.throws(() => installHost({ releaseRoot: source, env: base, socket, herdr: invalidHerdr, adapter: { restart() {}, stop() {} } })); untouched(base);
    const incompatibleOpenCode = path.join(bin, "opencode-incompatible"); executable(incompatibleOpenCode, "exit 0"); assert.throws(() => installHost({ releaseRoot: source, env: base, socket, opencode: incompatibleOpenCode, adapter: { restart() {}, stop() {} } })); untouched(base);
    const missing = path.join(root, "missing"); fs.cpSync(source, missing, { recursive: true }); const manifest = JSON.parse(fs.readFileSync(path.join(missing, "release-manifest.json"))); manifest.packages[0].paths.push("missing-required-package"); fs.writeFileSync(path.join(missing, "release-manifest.json"), JSON.stringify(manifest)); assert.throws(() => installHost({ releaseRoot: missing, env: base, socket, adapter: { restart() {}, stop() {} } })); untouched(base);
    const unsafe = path.join(root, "unsafe"); fs.symlinkSync(path.join(root, "elsewhere"), unsafe); const unsafeEnv = { ...base, XDG_DATA_HOME: unsafe }; assert.throws(() => installHost({ releaseRoot: source, env: unsafeEnv, socket, adapter: { restart() {}, stop() {} } })); assert.equal(fs.existsSync(path.join(root, "elsewhere", "head")), false);
    const occupied = net.createServer(); await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve)); const port = occupied.address().port; assert.throws(() => installHost({ releaseRoot: source, env: base, socket, port, adapter: { restart() {}, stop() {} } })); await new Promise((resolve) => occupied.close(resolve)); untouched(base);
    const macAdapter = serviceAdapter(), mac = installHost({ releaseRoot: source, env: { ...base, HOME: path.join(root, "mac-home"), XDG_DATA_HOME: path.join(root, "mac-data"), XDG_CONFIG_HOME: path.join(root, "mac-config"), XDG_STATE_HOME: path.join(root, "mac-state"), XDG_BIN_HOME: path.join(root, "mac-bin") }, socket, platform: "darwin", adapter: macAdapter }); assert.equal(mac.status, "installed"); assert.match(mac.serviceFile, /Library\/LaunchAgents\/dev\.head\.coordination\.plist$/); assert.doesNotMatch(fs.readFileSync(mac.serviceFile, "utf8"), new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); macAdapter.stop();
    const realIntegration = integrationRuntime(root, "herdr-integration", "not installed"), integrationEnv = { ...base, XDG_DATA_HOME: path.join(root, "integration-data"), XDG_CONFIG_HOME: path.join(root, "integration-config"), XDG_STATE_HOME: path.join(root, "integration-state"), XDG_BIN_HOME: path.join(root, "integration-bin") }, integrationAdapter = serviceAdapter(), integrationInstall = installHost({ releaseRoot: source, env: integrationEnv, socket, herdr: realIntegration.binary, adapter: integrationAdapter }); assert.equal(integrationInstall.status, "installed"); assert.equal(fs.readFileSync(realIntegration.effects, "utf8"), "install");
    const restarts = integrationAdapter.effects.length; fs.writeFileSync(realIntegration.state, "not installed"); const repaired = installHost({ releaseRoot: source, env: integrationEnv, socket, herdr: realIntegration.binary, adapter: integrationAdapter }); assert.equal(repaired.converged, true); assert.equal(integrationAdapter.effects.length, restarts); assert.equal(fs.readFileSync(realIntegration.effects, "utf8"), "installinstall");
    fs.writeFileSync(realIntegration.state, "outdated"); const updated = installHost({ releaseRoot: source, env: integrationEnv, socket, herdr: realIntegration.binary, adapter: integrationAdapter }); assert.equal(updated.converged, true); assert.equal(integrationAdapter.effects.length, restarts); assert.equal(fs.readFileSync(realIntegration.effects, "utf8"), "installinstallinstall");
    for (const invalid of ["malformed", "duplicate", "absent"]) { fs.writeFileSync(realIntegration.state, invalid); assert.throws(() => installHost({ releaseRoot: source, env: integrationEnv, socket, herdr: realIntegration.binary, adapter: integrationAdapter })); assert.equal(integrationAdapter.effects.length, restarts); }
    integrationAdapter.stop();
    const staleIntegration = integrationRuntime(root, "herdr-stale", "not installed", "not installed"), staleEnv = { ...base, XDG_DATA_HOME: path.join(root, "stale-data"), XDG_CONFIG_HOME: path.join(root, "stale-config"), XDG_STATE_HOME: path.join(root, "stale-state"), XDG_BIN_HOME: path.join(root, "stale-bin") }; const stale = installHost({ releaseRoot: source, env: staleEnv, socket, herdr: staleIntegration.binary, adapter: { restart() { throw new Error("integration must precede service start"); }, stop() {} } }); assert.equal(stale.status, "rolled_back"); assert.equal(fs.existsSync(path.join(staleEnv.XDG_DATA_HOME, "head", "current")), false); assert.equal(fs.existsSync(path.join(staleEnv.XDG_CONFIG_HOME, "head", "host.json")), false); assert.equal(fs.existsSync(path.join(staleEnv.XDG_BIN_HOME, "head")), false); assert.equal(fs.existsSync(path.join(staleEnv.XDG_CONFIG_HOME, "systemd", "user", "head-coordination.service")), false);
    assert.equal(fs.existsSync(effects), false);
  } finally { await new Promise((resolve) => socketServer.close(resolve)); }
});
