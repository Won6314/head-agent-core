#!/usr/bin/env node
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const THIS_FILE = fileURLToPath(import.meta.url);
const SESSION_NAME = /^[A-Za-z0-9._-]+$/;

function isHeadRoot(root) {
  try {
    return fs.statSync(path.join(root, "CLAUDE.md")).isFile()
      && fs.statSync(path.join(root, ".claude", "agents", "head", "CLAUDE.md")).isFile();
  } catch { return false; }
}

export function findProjectRoot(start = process.env.HEAD_PROJECT_ROOT || process.cwd()) {
  let current = path.resolve(start || process.cwd());
  try { if (!fs.statSync(current).isDirectory()) current = path.dirname(current); } catch { return ""; }
  while (true) {
    if (isHeadRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return "";
    current = parent;
  }
}

export const PROJECT_ROOT = findProjectRoot();
export const HEAD_STATE_DIR = PROJECT_ROOT ? path.join(PROJECT_ROOT, ".claude", "agents", "head", "opencode", "state") : "";
export function projectRoot(root) { return root ? findProjectRoot(root) : findProjectRoot(); }
export function headDir(root) { const active = projectRoot(root); return active ? path.join(active, ".claude", "agents", "head") : ""; }
export function headStateDir(root) { const head = headDir(root); return head ? path.join(head, "opencode", "state") : ""; }

function safeRead(filePath) { try { return fs.readFileSync(filePath, "utf8"); } catch { return ""; } }
function directSessionDir(root, name) {
  if (!root || !SESSION_NAME.test(String(name || ""))) return "";
  const sessions = path.join(headDir(root), "sessions");
  const candidate = path.join(sessions, name);
  try { return fs.statSync(candidate).isDirectory() && path.dirname(fs.realpathSync(candidate)) === fs.realpathSync(sessions) ? candidate : ""; } catch { return ""; }
}
function logJsonl(name, record, root) {
  const state = headStateDir(root);
  if (!state) return;
  try {
    const dir = path.join(state, "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${name}.jsonl`), `${JSON.stringify(record)}\n`);
  } catch {}
}
export function logRuntimeEvent(name, record, root) { logJsonl(name, { ts: new Date().toISOString(), ...record }, root); }

function localValidateCaller(root) {
  try { return require(path.join(root, "mcp-servers", "agent-task", "herdr-runtime.js")).validateCaller; } catch { return null; }
}
export function detectHerdrLocation(env = process.env, validate, root) {
  const active = projectRoot(root);
  if (!active) return null;
  const caller = { socket: String(env.HERDR_SOCKET_PATH || "").trim(), workspaceId: String(env.HERDR_WORKSPACE_ID || "").trim(), tabId: String(env.HERDR_TAB_ID || "").trim(), paneId: String(env.HERDR_PANE_ID || "").trim() };
  if (!Object.values(caller).every(Boolean)) return null;
  const verify = validate || localValidateCaller(active);
  if (typeof verify !== "function") return null;
  let live;
  try { live = verify(caller, { headCwd: headDir(active) }); } catch { return null; }
  if (!live || !directSessionDir(active, live.tabLabel)) return null;
  return Object.freeze({ ...live, sessionName: live.tabLabel });
}

export function loadSessionRecord(sessionID, root) {
  if (!/^ses_[A-Za-z0-9]+$/.test(String(sessionID || ""))) return null;
  const state = headStateDir(root);
  if (!state) return null;
  try { return JSON.parse(fs.readFileSync(path.join(state, "sessions", `${sessionID}.json`), "utf8")); } catch { return null; }
}
export function saveSessionRecord(sessionID, record, root) {
  if (!/^ses_[A-Za-z0-9]+$/.test(String(sessionID || ""))) return;
  const state = headStateDir(root);
  if (!state) return;
  try {
    const dir = path.join(state, "sessions");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${sessionID}.json`), JSON.stringify({ ...(loadSessionRecord(sessionID, root) || {}), ...record }, null, 2) + "\n");
  } catch {}
}

function section(title, filePath, body) { return body.trim() ? [`# Loaded File: ${filePath || title}`, "", body.trim(), ""].join("\n") : ""; }
export function buildHeadPrompt({ sessionID = "", agent = "head", includeBaseFiles = false, root, location } = {}) {
  const active = projectRoot(root);
  if (!active) return { prompt: "", metadata: { sessionID, agent, shouldInject: false, invalidProjectRoot: true }, tipQuery: "" };
  const resolvedLocation = location || detectHerdrLocation(process.env, undefined, active) || {};
  const sessionName = directSessionDir(active, resolvedLocation.sessionName) ? resolvedLocation.sessionName : "";
  const shouldInject = agent === "head" && Boolean(sessionName);
  const sessionDir = shouldInject ? directSessionDir(active, sessionName) : "";
  const contextPath = sessionDir ? path.join(sessionDir, "context.md") : "";
  const runPath = sessionDir ? path.join(sessionDir, "run.md") : "";
  const context = safeRead(contextPath);
  const run = safeRead(runPath);
  const baseFiles = includeBaseFiles ? [section("CLAUDE.md", path.join(headDir(active), "CLAUDE.md"), safeRead(path.join(headDir(active), "CLAUDE.md"))), section("HEAD_CONTEXT.md", path.join(headDir(active), "HEAD_CONTEXT.md"), safeRead(path.join(headDir(active), "HEAD_CONTEXT.md")))] : [];
  const prompt = [...baseFiles, shouldInject ? section("Session context.md", contextPath, context) : "", shouldInject ? section("Session run.md", runPath, run) : ""].filter(Boolean).join("\n---\n\n");
  const metadata = { ts: new Date().toISOString(), sessionID, agent, sessionName, headMode: Boolean(resolvedLocation.sessionName), shouldInject, sessionContextPath: contextPath, sessionContextPresent: Boolean(context), runPath, runPresent: Boolean(run) };
  logJsonl("context-layers", metadata, active);
  if (sessionID) saveSessionRecord(sessionID, { ...metadata, injectedOnce: true, lastContextBuiltAt: metadata.ts }, active);
  return { prompt, metadata };
}

export function buildRuntimeConfig() { return { $schema: "https://opencode.ai/config.json", instructions: ["~/.local/share/head-agent-core/head/HEAD_CORE.md", "CLAUDE.md", "HEAD_CONTEXT.md"], skills: { paths: ["~/.local/share/head-agent-core/skills", ".claude/skills"] }, plugin: ["./save-opencode-session-id.js", "./opencode/plugins/context-layers.mjs", "./opencode/plugins/compact-recovery.mjs"], permission: "allow" }; }
export function logKeywordPrompt(record, root) { logJsonl("keyword-hints", { ts: new Date().toISOString(), ...record }, root); }
function isMainModule() {
  if (!process.argv[1]) return false;
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(THIS_FILE); } catch { return false; }
}

if (isMainModule()) process.stdout.write(JSON.stringify(process.argv.includes("--location-json") ? detectHerdrLocation() : { config: buildRuntimeConfig(), prompt: buildHeadPrompt({ includeBaseFiles: true }) }, null, 2));
