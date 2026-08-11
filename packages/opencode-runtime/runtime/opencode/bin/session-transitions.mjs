import fs from "node:fs";
import path from "node:path";
import { latestValidCheckpoint } from "./checkpoint-ledger.mjs";
import { parseSessionState } from "./session-lifecycle.mjs";
import { processIncarnation, processOwnerIsLive } from "./render-runtime-config.mjs";

const SESSION_NAME = /^[A-Za-z0-9._-]+$/;
export const HANDOFF_LIMIT = 12_000;

function fail(code) { return { ok: false, code }; }
function regularText(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink() ? fs.readFileSync(file, "utf8") : "";
  } catch { return ""; }
}
function directChild(root, name) {
  if (!SESSION_NAME.test(String(name || ""))) return "";
  const candidate = path.join(root, name);
  try {
    return fs.statSync(candidate).isDirectory() && path.dirname(fs.realpathSync(candidate)) === fs.realpathSync(root) ? candidate : "";
  } catch { return ""; }
}
function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}
function atomicWrite(file, body) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(descriptor, body, "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, file);
  syncDirectory(directory);
}
function transitionLock(sessionsDir, sessionName) {
  const lock = path.join(sessionsDir, `.${sessionName}.transition.lock`);
  while (true) {
    try {
      const descriptor = fs.openSync(lock, "wx", 0o600);
      try { fs.writeFileSync(descriptor, `${JSON.stringify(processIncarnation())}\n`, "utf8"); fs.fsyncSync(descriptor); syncDirectory(sessionsDir); }
      catch (error) { fs.closeSync(descriptor); try { fs.unlinkSync(lock); } catch {} throw error; }
      return { descriptor, lock };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let metadata;
      let owner;
      try {
        metadata = fs.lstatSync(lock);
        if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("transition lock is not a regular file");
        owner = JSON.parse(fs.readFileSync(lock, "utf8"));
      } catch {
        throw new Error("transition lock is unavailable");
      }
      if (processOwnerIsLive(owner)) throw new Error("transition lock owner is live");
      const latest = fs.lstatSync(lock);
      if (latest.ino === metadata.ino && latest.dev === metadata.dev) {
        fs.unlinkSync(lock);
        syncDirectory(sessionsDir);
      }
    }
  }
}
function releaseLock(lock, sessionsDir) {
  fs.closeSync(lock.descriptor);
  fs.unlinkSync(lock.lock);
  syncDirectory(sessionsDir);
}
function receipt(sessionName, state) {
  return { ok: true, session: sessionName, mode: state.mode, activeRun: state.activeRun?.id || null, generation: state.generation };
}
function preparedRun(sessionDir, runID) {
  if (!SESSION_NAME.test(String(runID || ""))) return "";
  const runsDir = path.join(sessionDir, "runs");
  const runDir = directChild(runsDir, runID);
  return runDir && regularText(path.join(runDir, "run.md")).trim() && latestValidCheckpoint(runDir)?.record.decision.type === "START" ? runDir : "";
}
function terminalRun(sessionDir, state) {
  const runDir = state.activeRun.path === "."
    ? sessionDir
    : directChild(path.join(sessionDir, "runs"), state.activeRun.id);
  const latest = runDir && latestValidCheckpoint(runDir)?.record;
  return Boolean(latest && latest.decision.type === "DONE" && latest.next.slice === null);
}
function userStoppedRun(sessionDir, state) {
  const runDir = state.activeRun.path === "."
    ? sessionDir
    : directChild(path.join(sessionDir, "runs"), state.activeRun.id);
  const latest = runDir && latestValidCheckpoint(runDir)?.record;
  return Boolean(
    latest
    && latest.decision.type === "USER_DECISION"
    && latest.decision.status === "STOPPED"
    && latest.next.slice === null,
  );
}

/**
 * Execute one explicit Session transition. Adapters keep Herdr and exact-session
 * binding I/O outside this deterministic filesystem core.
 */
export function createSessionTransitions({ headDirectory, identity, binding, writeState = atomicWrite } = {}) {
  const sessionsDir = path.join(headDirectory || "", "sessions");
  const live = () => {
    const value = identity?.live?.();
    const sessionName = String(value?.sessionName || value?.tabLabel || "");
    return directChild(sessionsDir, sessionName) ? { ...value, sessionName } : null;
  };
  const bindingMatches = (sessionID, sessionName) => {
    const current = binding?.read?.(sessionID);
    return !current?.sessionName || current.sessionName === sessionName;
  };
  const commitState = (sessionDir, state) => writeState(path.join(sessionDir, "session-state.json"), `${JSON.stringify(state, null, 2)}\n`);

  return function transition({ action, sessionID, run_id: runID, session_handoff: handoff } = {}) {
    if (!/^ses_[A-Za-z0-9]+$/.test(String(sessionID || ""))) return fail("OPENCODE_SESSION_ID_REQUIRED");
    const location = live();
    if (!location) return fail("LIVE_HERDR_IDENTITY_REQUIRED");
    if (!bindingMatches(sessionID, location.sessionName)) return fail("SESSION_IDENTITY_CONFLICT");
    let lock;
    try { lock = transitionLock(sessionsDir, location.sessionName); } catch { return fail("TRANSITION_LOCK_UNAVAILABLE"); }
    try {
      const sessionDir = directChild(sessionsDir, location.sessionName);
      const parsed = sessionDir && parseSessionState(sessionDir);
      if (!sessionDir || !parsed || !["session", "run"].includes(parsed.status)) return fail("SESSION_STATE_INVALID");

      if (action === "start_run") {
        if (parsed.status !== "session") return fail("START_RUN_REQUIRES_SESSION_MODE");
        if (!preparedRun(sessionDir, runID)) return fail("RUN_NOT_PREPARED");
        const state = { schema: 1, generation: parsed.state.generation + 1, mode: "run", activeRun: { id: runID, path: `runs/${runID}` } };
        commitState(sessionDir, state);
        return receipt(location.sessionName, state);
      }

      if (action === "finish_run") {
        if (parsed.status !== "run") return fail("FINISH_RUN_REQUIRES_RUN_MODE");
        if (!terminalRun(sessionDir, parsed.state)) return fail("RUN_NOT_TERMINAL");
        if (typeof handoff !== "string" || !handoff.trim() || handoff.length > HANDOFF_LIMIT) return fail("SESSION_HANDOFF_INVALID");
        const progress = path.join(sessionDir, "progress.md");
        const prior = regularText(progress);
        try {
          writeState(progress, handoff);
          const state = { schema: 1, generation: parsed.state.generation + 1, mode: "session", activeRun: null };
          commitState(sessionDir, state);
          return receipt(location.sessionName, state);
        } catch {
          try { writeState(progress, prior); } catch { return fail("FINISH_RUN_CONFLICT"); }
          return fail("STATE_COMMIT_FAILED");
        }
      }

      if (action === "stop_run") {
        if (parsed.status !== "run") return fail("STOP_RUN_REQUIRES_RUN_MODE");
        if (!userStoppedRun(sessionDir, parsed.state)) return fail("RUN_NOT_USER_STOPPED");
        if (typeof handoff !== "string" || !handoff.trim() || handoff.length > HANDOFF_LIMIT) return fail("STOP_RUN_HANDOFF_INVALID");
        const progress = path.join(sessionDir, "progress.md");
        const prior = regularText(progress);
        try {
          writeState(progress, handoff);
          const state = { schema: 1, generation: parsed.state.generation + 1, mode: "session", activeRun: null };
          commitState(sessionDir, state);
          return receipt(location.sessionName, state);
        } catch {
          try { writeState(progress, prior); } catch { return fail("STOP_RUN_CONFLICT"); }
          return fail("STOP_RUN_STATE_COMMIT_FAILED");
        }
      }

      return fail("SESSION_ACTION_INVALID");
    } catch { return fail("TRANSITION_FAILED"); }
    finally { releaseLock(lock, sessionsDir); }
  };
}
