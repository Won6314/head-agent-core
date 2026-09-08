import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RuntimeContextError } from "./runtime-context.mjs";

const SESSION = /^ses_[A-Za-z0-9_-]+$/;
const fail = (code, message) => { throw new RuntimeContextError(code, message); };
const unwrap = (value) => value?.result?.process_info || value?.process_info || value?.result || value;

export function parseLinuxOpenCodeListeners(output) {
  const result = [];
  for (const line of String(output || "").split(/\r?\n/)) {
    if (!line.includes("opencode")) continue;
    const port = Number(line.match(/127\.0\.0\.1:(\d{1,5})/)?.[1]);
    const pid = Number(line.match(/\bpid=(\d+)\b/)?.[1]);
    if (Number.isSafeInteger(port) && port > 0 && port <= 65535 && Number.isSafeInteger(pid) && pid > 0) result.push({ origin: `http://127.0.0.1:${port}`, pid });
  }
  return result.filter((item, index) => result.findIndex((candidate) => candidate.origin === item.origin && candidate.pid === item.pid) === index);
}

function processEnvironment(pid, filesystem = fs) {
  const directory = `/proc/${pid}`;
  const stat = filesystem.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (typeof process.getuid === "function" && stat.uid !== process.getuid())) fail("UNTRUSTED_OPENCODE_PROCESS", "The calling OpenCode process is not owned by this host user.");
  const entries = filesystem.readFileSync(path.join(directory, "environ")).toString().split("\0").filter(Boolean);
  return Object.fromEntries(entries.map((entry) => { const index = entry.indexOf("="); return index > 0 ? [entry.slice(0, index), entry.slice(index + 1)] : [entry, ""]; }));
}

async function json(response, code, message) {
  if (!response || response.status < 200 || response.status >= 300) fail(code, message);
  try { return await response.json(); } catch { fail(code, `${message} OpenCode returned invalid JSON.`); }
}

async function request(fetchImpl, origin, pathname, authorization, { method = "GET", body, timeoutMs = 3_000 } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(`${origin}${pathname}`, { method, headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
  } finally { clearTimeout(timer); }
}

/** Exact current-pane OpenCode discovery and server-side session forking. */
export function createOpenCodeSessionManager({ runtime, execFileSync = childProcess.execFileSync, fetchImpl = globalThis.fetch, filesystem = fs, listenerResolver } = {}) {
  if (!runtime || typeof runtime.validateCaller !== "function" || typeof runtime.invoke !== "function") throw new TypeError("An exact Herdr runtime is required.");
  const listeners = listenerResolver || ((pid) => parseLinuxOpenCodeListeners(execFileSync("/usr/bin/ss", ["-ltnp"], { encoding: "utf8", timeout: 10_000 })).filter((item) => item.pid === pid));
  async function currentSession(caller) {
    const live = runtime.validateCaller(caller);
    if (!live || ["socket", "workspaceId", "tabId", "paneId", "terminalId", "cwd"].some((key) => live[key] !== caller?.[key])) fail("STALE_CALLER", "The saved-HEAD caller is not the exact live HEAD pane.");
    const info = unwrap(runtime.invoke(live.socket, ["pane", "process-info", "--pane", live.paneId]));
    const processes = Array.isArray(info?.foreground_processes) ? info.foreground_processes : [];
    const candidates = processes.filter((item) => Number.isSafeInteger(item?.pid) && item.pid > 0 && /(^|\/)opencode(?:\s|$)/.test(String(item.cmdline || "")));
    if (candidates.length !== 1) fail("OPENCODE_PROCESS_UNRESOLVED", "The exact calling OpenCode process could not be resolved.");
    const processInfo = candidates[0];
    const argv = Array.isArray(processInfo.argv) ? processInfo.argv : [];
    const sessionIndex = argv.findIndex((item) => item === "--session" || item === "-s");
    const sessionId = sessionIndex >= 0 ? argv[sessionIndex + 1] : String(processInfo.cmdline || "").match(/(?:--session|-s)\s+(ses_[A-Za-z0-9_-]+)/)?.[1];
    if (!SESSION.test(String(sessionId || ""))) fail("OPENCODE_SESSION_UNRESOLVED", "The exact calling OpenCode session could not be resolved.");
    const environment = processEnvironment(processInfo.pid, filesystem), password = environment.OPENCODE_SERVER_PASSWORD || "";
    const username = environment.OPENCODE_SERVER_USERNAME || "opencode";
    const authorization = password ? `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}` : "";
    for (const { origin } of listeners(processInfo.pid)) {
      try {
        const health = await json(await request(fetchImpl, origin, "/global/health", authorization), "OPENCODE_API_UNAVAILABLE", "OpenCode health probe failed.");
        if (health?.healthy !== true) continue;
        const session = await json(await request(fetchImpl, origin, `/session/${encodeURIComponent(sessionId)}`, authorization), "OPENCODE_SESSION_UNRESOLVED", "OpenCode session probe failed.");
        if (session?.id === sessionId) return Object.freeze({ id: sessionId, pid: processInfo.pid, origin, authorization, caller: live });
      } catch { /* Try only another listener owned by the exact process. */ }
    }
    fail("OPENCODE_API_UNAVAILABLE", "No authenticated OpenCode API matched the exact calling HEAD session.");
  }
  async function fork({ sourceSessionId, caller, current } = {}) {
    if (!SESSION.test(String(sourceSessionId || ""))) fail("INVALID_SOURCE_SESSION", "A valid saved OpenCode session is required.");
    const endpoint = current || await currentSession(caller);
    const response = await request(fetchImpl, endpoint.origin, `/session/${encodeURIComponent(sourceSessionId)}/fork`, endpoint.authorization, { method: "POST", body: {}, timeoutMs: 120_000 });
    const session = await json(response, "OPENCODE_FORK_FAILED", "OpenCode session fork failed.");
    if (!SESSION.test(String(session?.id || "")) || session.id === sourceSessionId) fail("OPENCODE_FORK_FAILED", "OpenCode returned an invalid fork session.");
    return Object.freeze({ sessionId: session.id });
  }
  return Object.freeze({ currentSession, fork });
}
