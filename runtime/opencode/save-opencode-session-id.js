import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { detectHerdrLocation, logRuntimeEvent, projectRoot } from "./bin/render-runtime-config.mjs";

function isValidSessionID(value) { return /^ses_[A-Za-z0-9]+$/.test(String(value || "")); }
function isSafePathSegment(value) { const segment = String(value || ""); return segment !== "." && segment !== ".." && !/[\\/]/.test(segment); }
function isDirectSessionChild(root, child) { try { return path.dirname(fs.realpathSync(child)) === fs.realpathSync(root); } catch { return false; } }
function safePaneFileName(location) { return location?.socket && location?.paneId ? `herdr-${crypto.createHash("sha256").update(`${location.socket}\0${location.paneId}`).digest("hex")}.json` : ""; }

function writePaneRegistry(sessionID, { detectLocation, root, log }) {
  if (!isValidSessionID(sessionID)) return;
  const location = detectLocation();
  if (!location?.paneId) { log("mobile-chat-pane", { sessionID, action: "skip", reason: "herdr_pane_not_found" }, root); return; }
  const fileName = safePaneFileName(location);
  if (!fileName) { log("mobile-chat-pane", { sessionID, action: "skip", reason: "invalid_herdr_pane" }, root); return; }
  try {
    const dir = path.join(root, ".claude", "agents", "head", "opencode", "state", "mobile-chat-panes");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, fileName);
    const tmpPath = path.join(dir, `.${fileName}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmpPath, JSON.stringify({ herdrSocket: location.socket, workspaceId: location.workspaceId, tabId: location.tabId, paneId: location.paneId, terminalId: location.terminalId, sessionName: location.sessionName, opencodePid: process.pid, sessionID, updatedAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
    log("mobile-chat-pane", { sessionID, action: "write", paneId: location.paneId }, root);
  } catch (error) { log("mobile-chat-pane", { sessionID, action: "error", error: error?.message || String(error) }, root); }
}

function createSaveSessionID({ detectLocation, root, upsertScript, execFile, log }) {
  return (sessionID) => {
    if (!sessionID) return;
    if (!isValidSessionID(sessionID)) { log("restore-id", { sessionID, action: "skip", reason: "invalid_session_id" }, root); return; }
    if (process.env.AGENT_TASK_QUICK === "1") return;
    const location = detectLocation();
    if (!location) { log("restore-id", { sessionID, action: "skip", reason: "herdr_location_not_found" }, root); return; }
    if (!isSafePathSegment(location.sessionName)) { log("restore-id", { sessionID, action: "skip", reason: "invalid_session_name", ...location }, root); return; }
    const sessionsRoot = path.join(root, ".claude", "agents", "head", "sessions");
    const sessionDir = path.join(sessionsRoot, location.sessionName);
    if (!fs.existsSync(sessionDir)) { log("restore-id", { sessionID, action: "skip", reason: "session_dir_not_found", sessionDir, ...location }, root); return; }
    if (!isDirectSessionChild(sessionsRoot, sessionDir)) { log("restore-id", { sessionID, action: "skip", reason: "session_dir_outside_sessions_root", sessionDir, ...location }, root); return; }
    const historyPath = path.join(sessionDir, "history.md");
    execFile("python3", [upsertScript, "--history", historyPath, "--runtime", "opencode", "--id", sessionID], { stdio: "ignore" });
    log("restore-id", { sessionID, action: "write", historyPath, ...location }, root);
  };
}

function sessionIDFromEvent(input) { const p = input?.event?.properties || {}; return p.sessionID || p.info?.id || p.session?.id || p.message?.sessionID || input?.sessionID || ""; }

export const SaveOpenCodeSessionID = async (options = {}) => {
  const root = projectRoot(options.root || options.directory || options.worktree);
  logRuntimeEvent("plugin-init", { plugin: "save-opencode-session-id", directory: options.directory || "", worktree: options.worktree || "", rootResolved: Boolean(root) }, root);
  if (!root) return { event: async () => {}, "chat.message": async () => {} };
  const dependencies = { detectLocation: options.detectLocation || (() => detectHerdrLocation(process.env, undefined, root)), root, upsertScript: options.upsertScript || path.join(root, ".claude", "hooks", "upsert-restore-id.py"), execFile: options.execFile || execFileSync, log: options.log || logRuntimeEvent };
  const saveSessionID = createSaveSessionID(dependencies);
  return { event: async (input) => { if (!String(input?.event?.type || "").startsWith("session.")) return; const sessionID = sessionIDFromEvent(input); writePaneRegistry(sessionID, dependencies); saveSessionID(sessionID); }, "chat.message": async (input) => { const sessionID = input?.sessionID || ""; writePaneRegistry(sessionID, dependencies); saveSessionID(sessionID); } };
};
