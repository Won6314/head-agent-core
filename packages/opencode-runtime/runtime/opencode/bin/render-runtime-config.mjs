#!/usr/bin/env node
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { currentSlice, latestValidCheckpoint } from "./checkpoint-ledger.mjs";
import { projectSessionRecovery } from "./session-lifecycle.mjs";

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
    const stateDescriptor = fs.openSync(state, "r");
    try { fs.fsyncSync(stateDescriptor); } finally { fs.closeSync(stateDescriptor); }
    fs.appendFileSync(path.join(dir, `${name}.jsonl`), `${JSON.stringify(record)}\n`);
  } catch {}
}
export function logRuntimeEvent(name, record, root) { logJsonl(name, { ts: new Date().toISOString(), ...record }, root); }

function sharedValidateCaller() {
  try { return require(path.resolve(path.dirname(THIS_FILE), "..", "herdr-runtime.cjs")).validateCaller; } catch { return null; }
}
function herdrIdentityWasSupplied(env = process.env) {
  return ["HERDR_SOCKET_PATH", "HERDR_WORKSPACE_ID", "HERDR_TAB_ID", "HERDR_PANE_ID"]
    .some((key) => String(env[key] || "").trim());
}
export function detectHerdrLocation(env = process.env, validate, root) {
  const active = projectRoot(root);
  if (!active) return null;
  const caller = { socket: String(env.HERDR_SOCKET_PATH || "").trim(), workspaceId: String(env.HERDR_WORKSPACE_ID || "").trim(), tabId: String(env.HERDR_TAB_ID || "").trim(), paneId: String(env.HERDR_PANE_ID || "").trim() };
  if (!caller.socket || !caller.paneId) return null;
  const verify = validate || sharedValidateCaller();
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
function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function ensureDurableDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  // mkdir -p may have created several entries.  Sync every directory on this
  // path so a successful state write is not stranded behind an undurable one.
  const directories = [];
  for (let current = path.resolve(directory); ; current = path.dirname(current)) {
    directories.push(current);
    if (path.dirname(current) === current) break;
  }
  for (const current of directories) syncDirectory(current);
}

function assertRegularFile(file, description) {
  const metadata = fs.lstatSync(file);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${description} is not a regular file`);
  return metadata;
}

function writeSessionRecord(target, record) {
  const dir = path.dirname(target);
  let temporary = "";
  try {
    temporary = path.join(dir, `.${path.basename(target)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
    const descriptor = fs.openSync(temporary, "wx", 0o600);
    try { fs.writeFileSync(descriptor, JSON.stringify(record, null, 2) + "\n", "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, target);
    temporary = "";
    syncDirectory(dir);
  } finally { if (temporary) { try { fs.unlinkSync(temporary); } catch {} } }
}

function sleep(milliseconds) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); }
function linuxIncarnation(pid) {
  try {
    const bootID = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    // comm may contain spaces/parentheses; everything after the final ')' is
    // the stable stat field sequence, whose field 22 is starttime.
    const statText = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = statText.slice(statText.lastIndexOf(")") + 2).trim().split(/\s+/);
    const startTime = fields[19];
    return bootID && startTime ? { bootID, startTime } : null;
  } catch { return null; }
}
export function processIncarnation(pid = process.pid) {
  const linux = linuxIncarnation(pid);
  return linux ? { pid, ...linux } : { pid };
}
export function processOwnerIsLive(owner) {
  const pid = Number(owner?.pid);
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); } catch (error) { return error?.code === "EPERM"; }
  // Linux identifies process incarnations. A missing current /proc identity
  // means it died between kill and read; a legacy portable record remains
  // conservatively live while its PID exists.
  if (!owner?.bootID || !owner?.startTime) return true;
  const current = linuxIncarnation(pid);
  return Boolean(current && current.bootID === owner.bootID && current.startTime === owner.startTime);
}

function acquireSessionLock(dir, sessionID, timeoutMs = 10_000) {
  const lock = path.join(dir, `.${sessionID}.lock`);
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      const descriptor = fs.openSync(lock, "wx", 0o600);
      try { fs.writeFileSync(descriptor, JSON.stringify({ ...processIncarnation(), createdAt: Date.now() }) + "\n"); fs.fsyncSync(descriptor); }
      catch (error) { try { fs.closeSync(descriptor); } finally { try { fs.unlinkSync(lock); } catch {} } throw error; }
      syncDirectory(dir);
      return { descriptor, lock };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let metadata, owner;
      try {
        metadata = assertRegularFile(lock, "session lock");
        owner = JSON.parse(fs.readFileSync(lock, "utf8"));
      } catch (readError) {
        if (Date.now() >= deadline) throw new Error(`session lock contention for ${sessionID}: ${readError.message}`);
        sleep(10); continue;
      }
      // An old lock is reclaimable only when its recorded owner is no longer
      // live. Age alone must never evict a slow but live runtime process.
      if (!processOwnerIsLive(owner)) {
        try {
          const latest = assertRegularFile(lock, "session lock");
          if (latest.ino === metadata.ino && latest.dev === metadata.dev) {
            fs.unlinkSync(lock);
            syncDirectory(dir);
          }
        } catch (reclaimError) { if (reclaimError?.code !== "ENOENT") throw reclaimError; }
      }
      if (Date.now() >= deadline) throw new Error(`session lock contention for ${sessionID}`);
      sleep(10);
    }
  }
}

/** Execute one lock-protected read/compare/update and atomic durable write. */
function updateSessionRecord(sessionID, root, updater, merge) {
  if (!/^ses_[A-Za-z0-9]+$/.test(String(sessionID || ""))) throw new Error("invalid session ID");
  const state = headStateDir(root);
  if (!state) throw new Error("project state directory is unavailable");
  const dir = path.join(state, "sessions");
  const target = path.join(dir, `${sessionID}.json`);
  ensureDurableDirectory(dir);
  const lock = acquireSessionLock(dir, sessionID);
  try {
    let previous = {};
    if (fs.existsSync(target)) {
      assertRegularFile(target, "existing session record");
      previous = JSON.parse(fs.readFileSync(target, "utf8"));
      if (!previous || typeof previous !== "object" || Array.isArray(previous)) throw new Error("existing session record is not an object");
    }
    const patch = updater(previous);
    if (patch === null || patch === undefined) return null;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("session record update is not an object");
    const next = merge ? { ...previous, ...patch } : patch;
    writeSessionRecord(target, next);
    return next;
  } finally {
    fs.closeSync(lock.descriptor);
    try { fs.unlinkSync(lock.lock); } finally { syncDirectory(dir); }
  }
}

export function saveSessionRecord(sessionID, record, root) {
  const result = updateSessionRecord(sessionID, root, () => record, false);
  if (result === null) throw new Error("session save was unexpectedly rejected");
}

/** Execute a strict session-record compare/update while holding a short-lived lock. */
export function mutateSessionRecord(sessionID, root, mutator) {
  return updateSessionRecord(sessionID, root, mutator, true);
}

function section(title, filePath, body) { return body.trim() ? [`# Loaded File: ${filePath || title}`, "", body.trim(), ""].join("\n") : ""; }
export function buildHeadPrompt({ sessionID = "", agent = "head", includeBaseFiles = false, root, location, env = process.env } = {}) {
  const active = projectRoot(root);
  if (!active) return { prompt: "", metadata: { sessionID, agent, shouldInject: false, invalidProjectRoot: true }, tipQuery: "" };
  const resolvedLocation = location || detectHerdrLocation(env, undefined, active) || {};
  const sessionRecord = loadSessionRecord(sessionID, active);
  const unvalidatedHerdrIdentity = !location && herdrIdentityWasSupplied(env) && !resolvedLocation.sessionName;
  const recovery = agent === "head" ? projectSessionRecovery({
    headDirectory: headDir(active),
    liveSessionName: resolvedLocation.sessionName,
    sessionRecord: unvalidatedHerdrIdentity ? null : sessionRecord,
  }) : null;
  const sessionName = recovery?.identity?.sessionName
    || (directSessionDir(active, resolvedLocation.sessionName) ? resolvedLocation.sessionName : "")
    || (directSessionDir(active, sessionRecord?.sessionName) ? sessionRecord.sessionName : "");
  const shouldInject = agent === "head" && Boolean(sessionName);
  if (recovery && !recovery.legacy) {
    const baseFiles = includeBaseFiles ? [section("CLAUDE.md", path.join(headDir(active), "CLAUDE.md"), safeRead(path.join(headDir(active), "CLAUDE.md"))), section("HEAD_CONTEXT.md", path.join(headDir(active), "HEAD_CONTEXT.md"), safeRead(path.join(headDir(active), "HEAD_CONTEXT.md")))] : [];
    const prompt = [...baseFiles, recovery.prompt].filter(Boolean).join("\n---\n\n");
    const metadata = { ts: new Date().toISOString(), sessionID, agent, sessionName: recovery.metadata.identityStatus === "resolved" ? sessionName : "", headMode: Boolean(resolvedLocation.sessionName), shouldInject: recovery.metadata.identityStatus === "resolved", ...recovery.metadata };
    logJsonl("context-layers", metadata, active);
    if (sessionID && recovery.metadata.identityStatus === "resolved") saveSessionRecord(sessionID, { ...metadata, injectedOnce: true, lastContextBuiltAt: metadata.ts }, active);
    return { prompt, metadata };
  }
  const sessionDir = shouldInject ? directSessionDir(active, sessionName) : "";
  const contextPath = sessionDir ? path.join(sessionDir, "context.md") : "";
  const runPath = sessionDir ? path.join(sessionDir, "run.md") : "";
  const context = safeRead(contextPath);
  const run = safeRead(runPath);
  const checkpoint = sessionDir ? latestValidCheckpoint(sessionDir) : null;
  const slice = sessionDir ? currentSlice(sessionDir, checkpoint) : { status: "none", path: "", body: "" };
  const baseFiles = includeBaseFiles ? [section("CLAUDE.md", path.join(headDir(active), "CLAUDE.md"), safeRead(path.join(headDir(active), "CLAUDE.md"))), section("HEAD_CONTEXT.md", path.join(headDir(active), "HEAD_CONTEXT.md"), safeRead(path.join(headDir(active), "HEAD_CONTEXT.md")))] : [];
  const prompt = [...baseFiles, shouldInject ? section("Session context.md", contextPath, context) : "", shouldInject ? section("Session run.md", runPath, run) : "", shouldInject && checkpoint ? section("Session latest checkpoint ledger", checkpoint.path, JSON.stringify(checkpoint.record, null, 2)) : "", shouldInject && slice.status === "valid" ? section("Session current Slice", slice.path, slice.body) : ""].filter(Boolean).join("\n---\n\n");
  const metadata = { ts: new Date().toISOString(), sessionID, agent, sessionName, headMode: Boolean(resolvedLocation.sessionName), shouldInject, sessionContextPath: contextPath, sessionContextPresent: Boolean(context), runPath, runPresent: Boolean(run), checkpointPath: checkpoint?.path || "", checkpointPresent: Boolean(checkpoint), slicePath: slice.path, slicePointerStatus: slice.status };
  logJsonl("context-layers", metadata, active);
  if (sessionID) saveSessionRecord(sessionID, { ...metadata, injectedOnce: true, lastContextBuiltAt: metadata.ts }, active);
  return { prompt, metadata };
}

const LEGACY_CONFIG_MESSAGE = "Runtime configuration emission is unavailable from this shared core.";
/** Retained only as an import-compatible fail-closed sentinel; it never emits config. */
export function buildRuntimeConfig() { throw new Error(LEGACY_CONFIG_MESSAGE); }
export function logKeywordPrompt(record, root) { logJsonl("keyword-hints", { ts: new Date().toISOString(), ...record }, root); }
function isMainModule() {
  if (!process.argv[1]) return false;
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(THIS_FILE); } catch { return false; }
}

if (isMainModule()) {
  if (process.argv.includes("--location-json")) process.stdout.write(JSON.stringify(detectHerdrLocation(), null, 2));
  else { process.stderr.write(`${LEGACY_CONFIG_MESSAGE}\n`); process.exitCode = 1; }
}
