import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RuntimeContextError } from "../agent-task/runtime-context.mjs";

const LAUNCHER = "/opt/homebrew/bin/herdr";
const CELLAR = "/opt/homebrew/Cellar/herdr/0.7.5/";
const VERSION = "0.7.5";
const PROTOCOL = 17;
const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const session = /^ses_[A-Za-z0-9_-]+$/;
const fail = (code, message) => { throw new RuntimeContextError(code, message); };

function ownedByUsOrRoot(stat) {
  return typeof process.getuid !== "function" || [process.getuid(), 0].includes(stat.uid);
}

function canonicalSocket(configuredRoot) {
  const socket = path.join(configuredRoot, "herdr.sock");
  if (!fs.existsSync(socket)) fail("INVALID_HERDR_SOCKET", "The canonical Herdr socket is unavailable.");
  const stat = fs.lstatSync(socket);
  if (stat.isSymbolicLink() || !ownedByUsOrRoot(stat) || !stat.isSocket()) {
    fail("INVALID_HERDR_SOCKET", "The canonical Herdr socket must be owned and non-symlinked.");
  }
  return fs.realpathSync(socket);
}

function checkedBinary(launcher, install = { launcher: LAUNCHER, cellar: CELLAR }) {
  if (launcher !== install.launcher) fail("INVALID_HERDR_BINARY", "Only the allow-listed Herdr launcher is permitted.");
  let target;
  try {
    if (!fs.lstatSync(launcher).isSymbolicLink()) fail("INVALID_HERDR_BINARY", "The Herdr launcher must be a symlink.");
    target = fs.realpathSync(launcher);
  } catch (error) {
    if (error instanceof RuntimeContextError) throw error;
    fail("INVALID_HERDR_BINARY", "The allow-listed Herdr launcher is unavailable.");
  }
  const stat = fs.lstatSync(target);
  if (!target.startsWith(install.cellar) || !stat.isFile() || stat.isSymbolicLink() || !ownedByUsOrRoot(stat) || !(stat.mode & 0o111)) {
    fail("INVALID_HERDR_BINARY", "Herdr must resolve to an owned direct executable in the pinned Cellar path.");
  }
  return target;
}

function pinnedEnvironment(socket) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^HERDR_(?:SESSION|REMOTE)(?:_|$)|^HERDR_SOCKET_PATH$/i.test(key)) delete env[key];
  }
  env.HERDR_SOCKET_PATH = socket;
  return env;
}

function unwrap(text, voidCall) {
  if (!text.trim()) {
    if (voidCall) return null;
    fail("INVALID_HERDR_RESPONSE", "Herdr returned an empty value response.");
  }
  let payload;
  try { payload = JSON.parse(text); } catch { fail("INVALID_HERDR_RESPONSE", "Herdr returned invalid JSON."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("INVALID_HERDR_RESPONSE", "Herdr returned an invalid JSON envelope.");
  if (payload.error) fail("HERDR_CLI_FAILURE", "Herdr rejected the requested operation.");
  if (!Object.hasOwn(payload, "result")) {
    if (voidCall) return null;
    fail("INVALID_HERDR_RESPONSE", "Herdr response has no result.");
  }
  if (payload.result == null && !voidCall) fail("INVALID_HERDR_RESPONSE", "Herdr returned an empty value result.");
  return payload.result;
}

function unique(values, field) {
  const seen = new Set();
  for (const value of values) {
    if (!value || typeof value !== "object" || !id.test(String(value[field] ?? "")) || seen.has(value[field])) {
      fail("INVALID_HERDR_SNAPSHOT", `Snapshot ${field} values must be unique valid IDs.`);
    }
    seen.add(value[field]);
  }
  return seen;
}

function validateSnapshot(value) {
  if (!value || typeof value !== "object" || value.protocol !== PROTOCOL || value.version !== VERSION || !Array.isArray(value.workspaces) || !Array.isArray(value.tabs) || !Array.isArray(value.panes)) {
    fail("INVALID_HERDR_SNAPSHOT", "A protocol-17 Herdr 0.7.5 snapshot with arrays is required.");
  }
  const workspaces = unique(value.workspaces, "workspace_id");
  const tabs = unique(value.tabs, "tab_id");
  const panes = unique(value.panes, "pane_id");
  const terminals = new Set();
  for (const tab of value.tabs) if (!workspaces.has(tab.workspace_id)) fail("INVALID_HERDR_SNAPSHOT", "Snapshot tab parentage is broken.");
  for (const pane of value.panes) {
    if (!workspaces.has(pane.workspace_id) || !tabs.has(pane.tab_id) || !id.test(String(pane.terminal_id ?? "")) || terminals.has(pane.terminal_id) || typeof pane.cwd !== "string" || !pane.cwd) {
      fail("INVALID_HERDR_SNAPSHOT", "Snapshot pane parentage is malformed.");
    }
    terminals.add(pane.terminal_id);
    const tab = value.tabs.find((item) => item.tab_id === pane.tab_id);
    if (tab.workspace_id !== pane.workspace_id) fail("INVALID_HERDR_SNAPSHOT", "Snapshot pane has a non-flat parent reference.");
  }
  return value;
}

/** Strict production adapter for the pinned protocol-17 Herdr CLI. */
export function createRealHerdrCliAdapter({ socketPath, herdrPath = LAUNCHER, configuredRoot = path.join(process.env.HOME || "", ".config", "herdr"), execFileSync = childProcess.execFileSync, versionProbe, now = Date.now, sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms), testInstall } = {}) {
  const socket = canonicalSocket(configuredRoot);
  let requestedSocket;
  try { requestedSocket = socketPath && fs.realpathSync(socketPath); } catch { fail("HERDR_SOCKET_MISMATCH", "The requested socket is not the canonical Herdr socket."); }
  if (requestedSocket !== socket) fail("HERDR_SOCKET_MISMATCH", "The requested socket is not the canonical Herdr socket.");
  const install = testInstall || { launcher: LAUNCHER, cellar: CELLAR, version: VERSION };
  if (testInstall && (!testInstall || Object.keys(testInstall).sort().join() !== "cellar,launcher,version" || !path.isAbsolute(testInstall.launcher) || !path.isAbsolute(testInstall.cellar) || testInstall.version !== VERSION)) fail("INVALID_TEST_INSTALL", "Synthetic Herdr installation must be exact.");
  const binary = checkedBinary(herdrPath, install);
  const probe = versionProbe || ((file) => execFileSync(file, ["--version"], { encoding: "utf8", env: pinnedEnvironment(socket), timeout: 10_000 }).trim());
  let version;
  try { version = probe(binary); } catch { fail("INVALID_HERDR_VERSION", "The Herdr version probe failed."); }
  if (version !== "herdr 0.7.5" && version !== VERSION) fail("INVALID_HERDR_VERSION", "Herdr version is not pinned to 0.7.5.");

  const invoke = (requestedSocket, argv, { voidCall = false } = {}) => {
    if (requestedSocket !== socket || !Array.isArray(argv) || argv.some((part) => typeof part !== "string" || !part)) {
      fail("HERDR_SOCKET_MISMATCH", "Only the pinned socket and argv command are permitted.");
    }
    let text;
    try { text = execFileSync(binary, argv, { encoding: "utf8", env: pinnedEnvironment(socket), timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }); } catch { fail("HERDR_CLI_FAILURE", "Herdr CLI call failed."); }
    return unwrap(text, voidCall);
  };
  // `pane read --format text` is the sole Herdr command whose installed CLI
  // intentionally returns bytes rather than a protocol result envelope. Keep
  // that exception private and exact: callers cannot supply arbitrary argv.
  const rawRecent = (paneId, lines) => {
    const argv = ["pane", "read", paneId, "--source", "recent-unwrapped", "--lines", String(lines), "--format", "text"];
    let text;
    try { text = execFileSync(binary, argv, { encoding: "utf8", env: pinnedEnvironment(socket), timeout: 10_000, maxBuffer: 1024 * 1024 }); } catch { fail("HERDR_CLI_FAILURE", "Herdr pane read failed."); }
    if (typeof text !== "string" || Buffer.byteLength(text) > 1024 * 1024) fail("INVALID_HERDR_RESPONSE", "Bounded raw pane text is invalid.");
    return text;
  };
  const snapshot = () => validateSnapshot(invoke(socket, ["api", "snapshot"]).snapshot);
  const livePane = (caller) => {
    if (!caller || caller.socket !== socket) return null;
    const matches = snapshot().panes.filter((pane) => pane.workspace_id === caller.workspaceId && pane.tab_id === caller.tabId && pane.pane_id === caller.paneId);
    if (matches.length !== 1) return null;
    try {
      return Object.freeze({ socket, workspaceId: matches[0].workspace_id, tabId: matches[0].tab_id, paneId: matches[0].pane_id, terminalId: matches[0].terminal_id, cwd: fs.realpathSync(matches[0].cwd) });
    } catch { return null; }
  };
  const exactDonePane = (tuple) => {
    if (!tuple || tuple.socket !== socket || ![tuple.workspaceId, tuple.tabId, tuple.paneId, tuple.terminalId].every((x) => id.test(String(x || ""))) || !session.test(String(tuple.sessionId || ""))) fail("INVALID_HERDR_TUPLE", "Exact workspace/tab/pane/terminal/session identity is required.");
    const current = snapshot(), panes = current.panes.filter((pane) => pane.workspace_id === tuple.workspaceId && pane.tab_id === tuple.tabId);
    if (panes.length !== 1) fail("ONE_PANE_VIOLATION", "Task tab must contain exactly one pane.");
    const pane = panes[0];
    return pane.pane_id === tuple.paneId && pane.terminal_id === tuple.terminalId && pane.agent === "opencode" && pane.agent_session?.source === "herdr:opencode" && pane.agent_session?.value === tuple.sessionId && pane.agent_status === "done" ? pane : null;
  };
  const waitDone = (tuple, { timeoutMs = 120_000, pollMs = 250 } = {}) => {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000 || !Number.isInteger(pollMs) || pollMs < 10 || pollMs > 5_000) fail("INVALID_HERDR_WAIT", "Herdr wait bounds are invalid.");
    const deadline = now() + timeoutMs;
    while (now() <= deadline) { const pane = exactDonePane(tuple); if (pane) return pane; sleep(pollMs); }
    fail("HERDR_DONE_TIMEOUT", "Exact OpenCode done evidence was not observed.");
  };
  const readRecent = (tuple, { lines = 200 } = {}) => {
    if (!tuple || tuple.socket !== socket || !id.test(String(tuple.paneId || "")) || !Number.isInteger(lines) || lines < 1 || lines > 200) fail("INVALID_HERDR_READ", "Bounded exact pane read is required.");
    if (!exactDonePane(tuple)) fail("INVALID_HERDR_TUPLE", "Exact done OpenCode session proof is required immediately before raw read.");
    const text = rawRecent(tuple.paneId, lines);
    if (!exactDonePane(tuple)) fail("INVALID_HERDR_TUPLE", "Exact done OpenCode session proof changed during raw read.");
    return text;
  };
  const closeTaskTab = (tuple) => {
    if (!tuple || tuple.socket !== socket || ![tuple.workspaceId, tuple.tabId, tuple.paneId, tuple.terminalId, tuple.taskId].every((x) => id.test(String(x || ""))) || !session.test(String(tuple.sessionId || "")) || typeof tuple.agentDir !== "string" || !path.isAbsolute(tuple.agentDir)) fail("INVALID_HERDR_TUPLE", "Exact task/tab/session/CWD identity is required.");
    const before = snapshot(), tabs = before.tabs.filter((x) => x.workspace_id === tuple.workspaceId && x.tab_id === tuple.tabId), panes = before.panes.filter((x) => x.workspace_id === tuple.workspaceId && x.tab_id === tuple.tabId);
    if (!tabs.length && !panes.length) return false;
    let expectedCwd; try { expectedCwd = fs.realpathSync(tuple.agentDir); } catch { fail("INVALID_HERDR_TUPLE", "Expected task CWD is unavailable."); }
    let actualCwd; try { actualCwd = fs.realpathSync(panes[0]?.cwd); } catch { fail("INVALID_HERDR_TUPLE", "Task pane CWD is unavailable."); }
    const label = tabs[0]?.label ?? tabs[0]?.tab_label;
    if (tabs.length !== 1 || panes.length !== 1 || label !== tuple.taskId || panes[0].pane_id !== tuple.paneId || panes[0].terminal_id !== tuple.terminalId || actualCwd !== expectedCwd || panes[0].agent !== "opencode" || panes[0].agent_status !== "done" || panes[0].agent_session?.source !== "herdr:opencode" || panes[0].agent_session?.value !== tuple.sessionId) fail("INVALID_HERDR_TUPLE", "Task tab done provenance or fresh topology changed.");
    invoke(socket, ["tab", "close", tuple.tabId], { voidCall: true });
    const after = snapshot(); if (after.tabs.some((x) => x.tab_id === tuple.tabId) || after.panes.some((x) => x.tab_id === tuple.tabId)) fail("HERDR_CLOSE_UNPROVEN", "Fresh snapshot did not prove task tab closure.");
    return true;
  };
  return Object.freeze({ socket, invoke: (s, a) => invoke(s, a), invokeVoid: (s, a) => invoke(s, a, { voidCall: true }), snapshot, livePane, validateCaller: livePane, waitDone, readRecent, closeTaskTab });
}
