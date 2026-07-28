import fs from "node:fs";
import path from "node:path";
import { currentSlice, latestValidCheckpoint } from "./checkpoint-ledger.mjs";

const SESSION_NAME = /^[A-Za-z0-9._-]+$/;
export const PROGRESS_LIMIT = 12_000;

function directSessionDir(headDirectory, name) {
  if (!SESSION_NAME.test(String(name || ""))) return "";
  const sessions = path.join(headDirectory, "sessions");
  const candidate = path.join(sessions, name);
  try {
    return fs.statSync(candidate).isDirectory() && path.dirname(fs.realpathSync(candidate)) === fs.realpathSync(sessions)
      ? candidate
      : "";
  } catch { return ""; }
}

function regularText(file) {
  try {
    const metadata = fs.lstatSync(file);
    return metadata.isFile() && !metadata.isSymbolicLink() ? fs.readFileSync(file, "utf8") : "";
  } catch { return ""; }
}

function stateFile(sessionDir) {
  const file = path.join(sessionDir, "session-state.json");
  try {
    const metadata = fs.lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return { status: "corrupt" };
    return { status: "present", body: fs.readFileSync(file, "utf8") };
  } catch (error) { return error?.code === "ENOENT" ? { status: "missing" } : { status: "corrupt" }; }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function parseSessionState(sessionDir) {
  const source = stateFile(sessionDir);
  if (source.status !== "present") return source;
  let value;
  try { value = JSON.parse(source.body); } catch { return { status: "corrupt" }; }
  if (!isPlainObject(value) || !hasExactKeys(value, ["schema", "generation", "mode", "activeRun"])
    || value.schema !== 1 || !Number.isSafeInteger(value.generation) || value.generation < 0) return { status: "corrupt" };
  if (value.mode === "session" && value.activeRun === null) return { status: "session", state: value };
  if (value.mode !== "run" || !isPlainObject(value.activeRun) || !hasExactKeys(value.activeRun, ["id", "path"])
    || !SESSION_NAME.test(value.activeRun.id) || typeof value.activeRun.path !== "string") return { status: "corrupt" };
  const expected = `runs/${value.activeRun.id}`;
  if (value.activeRun.path !== expected && value.activeRun.path !== ".") return { status: "corrupt" };
  return { status: "run", state: value };
}

export function resolveSessionIdentity({ headDirectory, liveSessionName = "", sessionRecord = null } = {}) {
  const liveDir = directSessionDir(headDirectory, liveSessionName);
  const fallbackName = typeof sessionRecord?.sessionName === "string" ? sessionRecord.sessionName : "";
  const fallbackDir = directSessionDir(headDirectory, fallbackName);
  if (liveDir && fallbackDir && liveSessionName !== fallbackName) {
    return { status: "conflict", diagnosis: "SESSION_IDENTITY_CONFLICT" };
  }
  if (liveDir) return { status: "resolved", source: "herdr_tab", sessionName: liveSessionName, sessionDir: liveDir };
  if (fallbackDir) return { status: "resolved", source: "opencode_session", sessionName: fallbackName, sessionDir: fallbackDir };
  return { status: "unresolved", diagnosis: "SESSION_IDENTITY_UNRESOLVED" };
}

function resolveActiveRun(sessionDir, activeRun) {
  const runDir = activeRun.path === "." ? sessionDir : path.join(sessionDir, activeRun.path);
  try {
    const metadata = fs.lstatSync(runDir);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) return "";
    const resolvedSession = fs.realpathSync(sessionDir);
    const resolvedRun = fs.realpathSync(runDir);
    if (activeRun.path !== "." && path.dirname(resolvedRun) !== fs.realpathSync(path.join(resolvedSession, "runs"))) return "";
    return resolvedRun;
  } catch { return ""; }
}

function runtimeHeader({ identity, mode, loaded = [], activeRun = "none", diagnosis = "" }) {
  return [
    "<HEAD_RUNTIME_CONTEXT>",
    `logical_session: ${identity?.sessionName || "unresolved"}`,
    `mode: ${mode}`,
    `identity_source: ${identity?.source || (identity?.status === "conflict" ? "conflict" : "unresolved")}`,
    `loaded: ${loaded.length ? loaded.join(", ") : "none"}`,
    `active_run: ${activeRun}`,
    ...(diagnosis ? [`diagnosis: ${diagnosis}`] : []),
    "</HEAD_RUNTIME_CONTEXT>",
  ].join("\n");
}

function section(label, file, body) {
  return body.trim() ? [`# Loaded File: ${label}`, "", body.trim(), ""].join("\n") : "";
}

/** Resolve explicit Session/Run recovery context without interpreting missing state as a new mode. */
export function projectSessionRecovery({ headDirectory, liveSessionName, sessionRecord } = {}) {
  const identity = resolveSessionIdentity({ headDirectory, liveSessionName, sessionRecord });
  if (identity.status !== "resolved") {
    return { prompt: runtimeHeader({ identity, mode: "unresolved", diagnosis: identity.diagnosis }), metadata: { mode: "unresolved", identityStatus: identity.status, diagnosis: identity.diagnosis, loadedPaths: [], activeRun: "" } };
  }

  const parsed = parseSessionState(identity.sessionDir);
  if (parsed.status === "missing") return { legacy: true, identity };
  if (parsed.status === "corrupt") {
    return { prompt: runtimeHeader({ identity, mode: "corrupt", diagnosis: "SESSION_STATE_CORRUPT" }), metadata: { mode: "corrupt", identityStatus: "resolved", diagnosis: "SESSION_STATE_CORRUPT", loadedPaths: [], activeRun: "" } };
  }

  const contextPath = path.join(identity.sessionDir, "context.md");
  const context = regularText(contextPath);
  if (parsed.status === "session") {
    const progressPath = path.join(identity.sessionDir, "progress.md");
    const progress = regularText(progressPath).slice(0, PROGRESS_LIMIT);
    const loadedPaths = [];
    if (context.trim()) loadedPaths.push("context.md");
    if (progress.trim()) loadedPaths.push("progress.md");
    return {
      prompt: [runtimeHeader({ identity, mode: "session", loaded: loadedPaths }), section("Session context.md", contextPath, context), section("Session progress.md", progressPath, progress)].filter(Boolean).join("\n---\n\n"),
      metadata: { mode: "session", identityStatus: "resolved", identitySource: identity.source, loadedPaths, activeRun: "", contextPath, progressPath },
    };
  }

  const runDir = resolveActiveRun(identity.sessionDir, parsed.state.activeRun);
  const run = runDir ? regularText(path.join(runDir, "run.md")) : "";
  const checkpoint = runDir ? latestValidCheckpoint(runDir) : null;
  let slice = { status: "missing", path: "", body: "" };
  if (checkpoint) {
    try { slice = currentSlice(runDir, checkpoint); } catch {}
  }
  if (!runDir || !run.trim() || !checkpoint || (slice.status !== "valid" && slice.status !== "none")) {
    return { prompt: runtimeHeader({ identity, mode: "corrupt", activeRun: parsed.state.activeRun.id, diagnosis: "RUN_CORRUPT" }), metadata: { mode: "corrupt", identityStatus: "resolved", identitySource: identity.source, diagnosis: "RUN_CORRUPT", loadedPaths: [], activeRun: parsed.state.activeRun.id } };
  }
  const runPath = path.join(runDir, "run.md");
  const loadedPaths = [];
  if (context.trim()) loadedPaths.push("context.md");
  loadedPaths.push(path.relative(identity.sessionDir, runPath), path.relative(identity.sessionDir, checkpoint.path));
  if (slice.status === "valid" && slice.body.trim()) loadedPaths.push(path.relative(identity.sessionDir, slice.path));
  return {
    prompt: [runtimeHeader({ identity, mode: "run", loaded: loadedPaths, activeRun: parsed.state.activeRun.id }), section("Session context.md", contextPath, context), section("Run run.md", runPath, run), section("Run latest checkpoint ledger", checkpoint.path, JSON.stringify(checkpoint.record, null, 2)), section("Run current Slice", slice.path, slice.body)].filter(Boolean).join("\n---\n\n"),
    metadata: { mode: "run", identityStatus: "resolved", identitySource: identity.source, loadedPaths, activeRun: parsed.state.activeRun.id, contextPath, runPath, checkpointPath: checkpoint.path, slicePath: slice.path, slicePointerStatus: slice.status },
  };
}
