import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RuntimeContextError } from "../agent-task/runtime-context.mjs";

const OPENCODE_LAUNCHER = "/usr/local/bin/opencode";
const OPENCODE_ROOT = "/usr/local/lib/node_modules/opencode-ai/";
const OPENCODE_VERSION = "1.18.4";
const SESSION = /^ses_[A-Za-z0-9_-]+$/;
const fail = (code, message) => { throw new RuntimeContextError(code, message); };
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Immutable installation identity consumed by locked production composition. */
export const pinnedOpenCodeInstallation = Object.freeze({ launcher: OPENCODE_LAUNCHER, packageRoot: OPENCODE_ROOT, version: OPENCODE_VERSION });

function isOwned(stat) { return typeof process.getuid !== "function" || [process.getuid(), 0].includes(stat.uid); }
function directExecutable(value) {
  if (!path.isAbsolute(value)) fail("INVALID_RUNTIME_BINARY", "Runtime binary must be absolute.");
  const stat = fs.lstatSync(value);
  if (!stat.isFile() || stat.isSymbolicLink() || !isOwned(stat) || !(stat.mode & 0o111)) fail("INVALID_RUNTIME_BINARY", "Runtime binary must be an owned direct executable.");
  return fs.realpathSync(value);
}

/** Resolve the sole supported production OpenCode installation. */
export function resolveDefaultOpenCodeBinary({ launcher = OPENCODE_LAUNCHER, execFileSync = childProcess.execFileSync, versionProbe } = {}) {
  if (launcher !== OPENCODE_LAUNCHER) fail("INVALID_RUNTIME_BINARY", "Only the allow-listed OpenCode launcher is permitted.");
  let target;
  try {
    if (!fs.lstatSync(launcher).isSymbolicLink()) fail("INVALID_RUNTIME_BINARY", "The OpenCode launcher must be a symlink.");
    target = fs.realpathSync(launcher);
  } catch (error) {
    if (error instanceof RuntimeContextError) throw error;
    fail("INVALID_RUNTIME_BINARY", "The allow-listed OpenCode launcher is unavailable.");
  }
  const binary = directExecutable(target);
  if (!binary.startsWith(OPENCODE_ROOT)) fail("INVALID_RUNTIME_BINARY", "OpenCode target is outside its allow-listed package root.");
  const probe = versionProbe || ((file) => execFileSync(file, ["--version"], { encoding: "utf8", timeout: 10_000 }).trim());
  let version;
  try { version = probe(binary); } catch { fail("INVALID_RUNTIME_VERSION", "OpenCode version probe failed."); }
  if (version !== OPENCODE_VERSION && version !== `opencode ${OPENCODE_VERSION}`) fail("INVALID_RUNTIME_VERSION", "OpenCode version is not pinned.");
  return binary;
}

/** Synchronous launcher compatible with HostAgentTaskService's owned-tab cleanup. */
export function createOnePaneWorkerLauncher({ runtime, resolveOpenCodeBinary = resolveDefaultOpenCodeBinary, resolveEnvironment, clock = Date.now, sleep = pause, timeoutMs = 15_000, pollMs = 100 } = {}) {
  if (!runtime || typeof runtime.invokeVoid !== "function" || typeof runtime.snapshot !== "function" || typeof resolveOpenCodeBinary !== "function") throw new TypeError("Runtime snapshot/invokeVoid and OpenCode binary resolver are required.");
  return ({ task, execution, rootPane }) => {
    if (execution.runtime === "claude") fail("UNSUPPORTED_CLAUDE_EVIDENCE", "Claude launch is disabled until exact session evidence exists.");
    if (execution.runtime !== "opencode" || !rootPane || task.workspaceId !== rootPane.workspaceId || task.tabId !== rootPane.tabId || task.paneId !== rootPane.paneId || task.terminalId !== rootPane.terminalId) fail("INVALID_LAUNCH_IDENTITY", "Launcher root pane does not match task.");
    if (typeof execution.model !== "string" || !/^[A-Za-z0-9._/:+-]{1,200}$/.test(execution.model) || typeof execution.variant !== "string" || execution.variant.length > 80 || !/^[A-Za-z0-9._-]*$/.test(execution.variant)) fail("INVALID_EXECUTION_POLICY", "Invalid OpenCode model or variant.");
    const expectedCwd = fs.realpathSync(task.agentDir);
    const binary = directExecutable(resolveOpenCodeBinary(task, execution));
    const continuation = execution.continuation;
    let argv = [binary, "run", "--format", "json", "--model", execution.model];
    if (execution.variant) argv.push("--variant", execution.variant);
    if (continuation?.strategy === "resume" || continuation?.strategy === "fork") {
      if (!SESSION.test(continuation.sourceRootSessionId || "")) fail("INVALID_CONTINUATION", "Continuation requires a valid source session.");
      argv.push("--session", continuation.sourceRootSessionId);
      if (continuation.strategy === "fork") argv.push("--fork");
    } else if (continuation) fail("INVALID_CONTINUATION", "Unknown continuation strategy.");
    if (resolveEnvironment != null) {
      if (typeof resolveEnvironment !== "function") fail("INVALID_ENVIRONMENT_RESOLVER", "Environment resolver must be host-owned.");
      const wrapper = resolveEnvironment({ task, execution, rootPane, binary });
      if (!wrapper || wrapper.executable !== "/usr/bin/env" || wrapper.binary !== binary || !Array.isArray(wrapper.prefixArgs) || wrapper.prefixArgs[0] !== "-i" || wrapper.prefixArgs.slice(1).some((part) => typeof part !== "string" || !/^[A-Z][A-Z0-9_]*=[^\0\r\n]+$/.test(part)) || [...wrapper.prefixArgs.slice(1)].sort().join("\0") !== wrapper.prefixArgs.slice(1).join("\0") || new Set(wrapper.prefixArgs.slice(1).map((part) => part.slice(0, part.indexOf("=")))).size !== wrapper.prefixArgs.length - 1) fail("INVALID_ENVIRONMENT_RESOLVER", "Environment resolver returned a noncanonical wrapper.");
      directExecutable(wrapper.executable); argv = [wrapper.executable, ...wrapper.prefixArgs, binary, ...argv.slice(1)];
    }
    runtime.invokeVoid(rootPane.socket, ["pane", "run", rootPane.paneId, ...argv, task.command]);
    const deadline = clock() + timeoutMs;
    while (clock() <= deadline) {
      const panes = runtime.snapshot(rootPane.socket)?.panes || [];
      const managed = panes.filter((pane) => pane.workspace_id === task.workspaceId && pane.tab_id === task.tabId);
      if (managed.length !== 1) fail("ONE_PANE_VIOLATION", "Managed task tab gained or lost panes.");
      const pane = managed[0];
      let cwd;
      try { cwd = fs.realpathSync(pane.cwd); } catch { cwd = null; }
      if (pane.pane_id === task.paneId && pane.terminal_id === task.terminalId && cwd === expectedCwd && pane.agent === "opencode" && pane.agent_session?.source === "herdr:opencode" && SESSION.test(pane.agent_session?.value || "")) {
        const session = pane.agent_session.value;
        if (continuation?.strategy === "resume" && session !== continuation.sourceRootSessionId) fail("INVALID_LAUNCH_IDENTITY", "Resume session evidence changed.");
        if (continuation?.strategy === "fork" && session === continuation.sourceRootSessionId) fail("INVALID_LAUNCH_IDENTITY", "Fork did not create a new session.");
        return { tabId: task.tabId, paneId: task.paneId, terminalId: task.terminalId, runtimeRootSessionId: session };
      }
      sleep(pollMs);
    }
    fail("WORKER_LAUNCH_TIMEOUT", "Exact OpenCode pane/session evidence was not observed.");
  };
}
