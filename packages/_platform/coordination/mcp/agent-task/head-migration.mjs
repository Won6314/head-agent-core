import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRealHerdrCliAdapter } from "../host-coordination/real-herdr-cli-adapter.mjs";

const SELF = fileURLToPath(import.meta.url);

function durableWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, file);
  const directory = fs.openSync(path.dirname(file), "r");
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

export async function armHeadMigration({ name, command, sourceSessionId, caller, currentSession, sessions, stateDirectory, herdrPath, socketPath, spawnChild = spawn } = {}) {
  if (!sessions || typeof sessions.fork !== "function" || !caller || typeof command !== "string" || !command.trim()) throw new Error("Migration requires a saved session, exact caller, and activation command.");
  const child = await sessions.fork({ sourceSessionId, caller, current: currentSession });
  const id = `migration-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const stateFile = path.join(stateDirectory, `${id}.json`);
  const state = {
    schema: 1,
    id,
    status: "armed",
    source: name,
    command: command.trim(),
    createdAt: new Date().toISOString(),
    herdrPath,
    socketPath,
    pane: { socket: caller.socket, workspaceId: caller.workspaceId, tabId: caller.tabId, paneId: caller.paneId, terminalId: caller.terminalId, cwd: caller.cwd },
    private: { parentSessionId: currentSession.id, childSessionId: child.sessionId },
  };
  durableWrite(stateFile, state);
  try {
    const supervisor = spawnChild(process.execPath, [SELF, "supervise", stateFile], { detached: true, stdio: "ignore" });
    supervisor.unref();
  } catch (error) {
    durableWrite(stateFile, { ...state, status: "failed_before_exit", failure: error.message || String(error) });
    throw new Error("Migration supervisor could not be armed.");
  }
  return Object.freeze({ id, stateFile });
}

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const paneValue = (value) => value?.result?.pane || value?.pane || value?.result || value;
const processValue = (value) => value?.result?.process_info || value?.process_info || value?.result || value;

function atShell(runtime, state) {
  const processes = processValue(runtime.invoke(state.pane.socket, ["pane", "process-info", "--pane", state.pane.paneId]))?.foreground_processes || [];
  return Array.isArray(processes) && processes.some((process) => /(^|\/)(?:ba)?sh(?:\s|$)|(^|\/)zsh(?:\s|$)|(^|\/)fish(?:\s|$)/.test(String(process?.cmdline || ""))) && !processes.some((process) => /(^|\/)opencode(?:\s|$)/.test(String(process?.cmdline || "")));
}

function lifecycleReleased(runtime, state) {
  const pane = paneValue(runtime.invoke(state.pane.socket, ["pane", "get", state.pane.paneId]));
  return !pane?.agent && String(pane?.agent_status || pane?.agentStatus || "unknown") === "unknown";
}

function openCodeReady(runtime, state, sessionId) {
  const processes = processValue(runtime.invoke(state.pane.socket, ["pane", "process-info", "--pane", state.pane.paneId]))?.foreground_processes || [];
  const process = Array.isArray(processes) && processes.find((candidate) => {
    if (!/(^|\/)opencode(?:\s|$)/.test(String(candidate?.cmdline || ""))) return false;
    const argv = Array.isArray(candidate.argv) ? candidate.argv : [];
    const index = argv.findIndex((value) => value === "--session" || value === "-s");
    return (index >= 0 && argv[index + 1] === sessionId) || new RegExp(`(?:--session|-s)\\s+${sessionId}(?:\\s|$)`).test(String(candidate.cmdline || ""));
  });
  if (!process) return false;
  const pane = paneValue(runtime.invoke(state.pane.socket, ["pane", "get", state.pane.paneId]));
  const reported = pane?.agent_session?.value || pane?.agentSession?.value || "";
  return pane?.agent === "opencode" && (!reported || reported === sessionId);
}

async function until(predicate, message, { timeoutMs, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) { if (predicate()) return; await sleep(250); }
  throw new Error(message);
}

function startSession(runtime, state, name, sessionId) {
  runtime.invoke(state.pane.socket, ["agent", "start", name, "--kind", "opencode", "--pane", state.pane.paneId, "--", "-s", sessionId]);
}

function rollbackName(id) { return `${id.slice(0, 23)}-rollback`; }

export async function superviseHeadMigration(stateFile, { runtime, shellTimeoutMs = 10_000, startupTimeoutMs = 30_000, sleep } = {}) {
  let state = read(stateFile), cutoverStarted = false;
  runtime ||= createRealHerdrCliAdapter({ socketPath: state.socketPath, herdrPath: state.herdrPath });
  try {
    runtime.invoke(state.pane.socket, ["agent", "wait", state.pane.paneId, "--until", "idle", "--until", "done", "--timeout", "300000"]);
    cutoverStarted = true;
    runtime.invokeVoid(state.pane.socket, ["agent", "send-keys", state.pane.paneId, "ctrl+c"]);
    await until(() => atShell(runtime, state) && lifecycleReleased(runtime, state), "same terminal did not become an available shell", { timeoutMs: shellTimeoutMs, sleep });
    state = { ...state, status: "parent_exited", parentExitedAt: new Date().toISOString() };
    durableWrite(stateFile, state);
    startSession(runtime, state, state.id, state.private.childSessionId);
    await until(() => openCodeReady(runtime, state, state.private.childSessionId), "replacement OpenCode session did not become ready", { timeoutMs: startupTimeoutMs, sleep });
    runtime.invoke(state.pane.socket, ["agent", "prompt", state.id, state.command]);
    durableWrite(stateFile, { ...state, status: "committed", committedAt: new Date().toISOString() });
  } catch (error) {
    if (!cutoverStarted) return durableWrite(stateFile, { ...state, status: "failed_before_exit", failure: error.message || String(error) });
    try {
      if (!(atShell(runtime, state) && lifecycleReleased(runtime, state))) {
        runtime.invokeVoid(state.pane.socket, ["agent", "send-keys", state.pane.paneId, "ctrl+c"]);
        await until(() => atShell(runtime, state) && lifecycleReleased(runtime, state), "rollback shell unavailable", { timeoutMs: shellTimeoutMs, sleep });
      }
      startSession(runtime, state, rollbackName(state.id), state.private.parentSessionId);
      durableWrite(stateFile, { ...state, status: "rolled_back", failure: error.message || String(error), rolledBackAt: new Date().toISOString() });
    } catch (rollbackError) {
      durableWrite(stateFile, { ...state, status: "rollback_failed", failure: error.message || String(error), rollbackFailure: rollbackError.message || String(rollbackError) });
    }
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === SELF && process.argv[2] === "supervise") {
  superviseHeadMigration(process.argv[3]).catch(() => { process.exitCode = 1; });
}
