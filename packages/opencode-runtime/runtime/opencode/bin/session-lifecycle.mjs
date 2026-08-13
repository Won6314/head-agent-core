import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveSemanticRun } from "./semantic-run.mjs";

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

function directBytes(file) {
  try {
    const metadata = fs.lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return { status: "corrupt" };
    return { status: "present", body: fs.readFileSync(file) };
  } catch (error) { return error?.code === "ENOENT" ? { status: "missing" } : { status: "corrupt" }; }
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
    `logical_session_directory: ${identity?.sessionDir || "unresolved"}`,
    `mode: ${mode}`,
    `identity_source: ${identity?.source || (identity?.status === "conflict" ? "conflict" : "unresolved")}`,
    "canon_path_rule: resolve paths listed in loaded against logical_session_directory, never against the process working directory",
    `loaded: ${loaded.length ? loaded.join(", ") : "none"}`,
    `active_run: ${activeRun}`,
    ...(diagnosis ? [`diagnosis: ${diagnosis}`] : []),
    "</HEAD_RUNTIME_CONTEXT>",
  ].join("\n");
}

function section(label, file, body) {
  return body.trim() ? [`# Loaded File: ${file || label}`, "", body.trim(), ""].join("\n") : "";
}

function corruptRecovery(identity, activeRun = "", diagnosis = "RECOVERY_CORRUPT") {
  return {
    prompt: runtimeHeader({ identity, mode: "corrupt", activeRun, diagnosis }),
    metadata: { mode: "corrupt", identityStatus: "resolved", identitySource: identity.source, diagnosis, loadedPaths: [], activeRun },
  };
}

function checkpointHistory(sessionDir) {
  const checkpointDir = path.join(sessionDir, "checkpoints");
  try {
    const metadata = fs.lstatSync(checkpointDir);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) return { status: "corrupt" };
  } catch (error) { return error?.code === "ENOENT" ? { status: "valid", entries: [] } : { status: "corrupt" }; }
  let names;
  try { names = fs.readdirSync(checkpointDir); } catch { return { status: "corrupt" }; }
  if (names.includes("transaction.json")) return { status: "corrupt" };
  if (names.some((name) => !/^\d{20}\.json$/.test(name))) return { status: "corrupt" };
  const history = directBytes(path.join(sessionDir, "history.md"));
  if (names.length && history.status !== "present") return { status: "corrupt" };
  const entries = [];
  let priorEnd = 0;
  for (const [index, name] of names.sort().entries()) {
    const source = directBytes(path.join(checkpointDir, name));
    let manifest;
    try { manifest = source.status === "present" ? JSON.parse(source.body.toString("utf8")) : null; } catch { manifest = null; }
    const sequence = index + 1;
    if (!isPlainObject(manifest) || !hasExactKeys(manifest, ["schema", "sequence", "createdAt", "mode", "runId", "history", "progress"])
      || manifest.schema !== 1 || manifest.sequence !== sequence || name !== `${String(sequence).padStart(20, "0")}.json`
      || typeof manifest.createdAt !== "string" || Number.isNaN(Date.parse(manifest.createdAt))
      || (manifest.mode !== "session" && manifest.mode !== "run")
      || (manifest.mode === "session" ? manifest.runId !== null : typeof manifest.runId !== "string" || !SESSION_NAME.test(manifest.runId))
      || !isPlainObject(manifest.history) || !hasExactKeys(manifest.history, ["byteStart", "byteEnd", "sha256"])
      || !Number.isSafeInteger(manifest.history.byteStart) || !Number.isSafeInteger(manifest.history.byteEnd)
      || manifest.history.byteStart < priorEnd || manifest.history.byteStart < 0 || manifest.history.byteEnd <= manifest.history.byteStart || manifest.history.byteEnd > history.body.length
      || !/^[a-f0-9]{64}$/.test(manifest.history.sha256)
      || !isPlainObject(manifest.progress) || !hasExactKeys(manifest.progress, ["sha256"]) || !/^[a-f0-9]{64}$/.test(manifest.progress.sha256)) return { status: "corrupt" };
    const entry = history.body.subarray(manifest.history.byteStart, manifest.history.byteEnd);
    if (crypto.createHash("sha256").update(entry).digest("hex") !== manifest.history.sha256) return { status: "corrupt" };
    priorEnd = manifest.history.byteEnd;
    entries.push({ manifest, body: entry.toString("utf8"), manifestPath: path.join(checkpointDir, name) });
  }
  return { status: "valid", entries };
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
  const contextSource = directBytes(contextPath);
  const progressPath = path.join(identity.sessionDir, "progress.md");
  const progressSource = directBytes(progressPath);
  const history = checkpointHistory(identity.sessionDir);
  if (contextSource.status !== "present" || progressSource.status !== "present" || history.status !== "valid") return corruptRecovery(identity, parsed.status === "run" ? parsed.state.activeRun.id : "");
  const context = contextSource.body.toString("utf8");
  const progress = progressSource.body.toString("utf8").slice(0, PROGRESS_LIMIT);
  if (parsed.status === "session") {
    const selected = history.entries.slice(-3);
    const loadedPaths = ["context.md", "progress.md"];
    return {
      prompt: [runtimeHeader({ identity, mode: "session", loaded: loadedPaths }), section("Session context.md", contextPath, context), section("Session progress.md", progressPath, progress), ...selected.map((entry) => section("Checkpoint history", "history.md", entry.body))].filter(Boolean).join("\n---\n\n"),
      metadata: { mode: "session", identityStatus: "resolved", identitySource: identity.source, loadedPaths, activeRun: "", contextPath, progressPath },
    };
  }

  const runDir = resolveActiveRun(identity.sessionDir, parsed.state.activeRun);
  const semantic = runDir && resolveSemanticRun(runDir, parsed.state.activeRun.id);
  if (semantic?.status === "corrupt") return corruptRecovery(identity, parsed.state.activeRun.id, "SEMANTIC_RUN_POINTER_CORRUPT");
  if (semantic?.status === "valid") {
    const loadedPaths = [
      path.relative(identity.sessionDir, semantic.runIndex.path),
      path.relative(identity.sessionDir, semantic.latestCheckpoint.path),
      ...semantic.contracts.map((contract) => path.relative(identity.sessionDir, contract.path)),
    ];
    return {
      prompt: [
        runtimeHeader({ identity, mode: "run", loaded: loadedPaths, activeRun: parsed.state.activeRun.id }),
        section("Run run.md", semantic.runIndex.path, semantic.runIndex.body),
        section("Latest Checkpoint", semantic.latestCheckpoint.path, semantic.latestCheckpoint.body),
        ...semantic.contracts.map((contract) => section("Current Execution Contract", contract.path, contract.body)),
      ].filter(Boolean).join("\n---\n\n"),
      metadata: { mode: "run", format: "semantic", identityStatus: "resolved", identitySource: identity.source, loadedPaths, activeRun: parsed.state.activeRun.id, runPath: semantic.runIndex.path, checkpointPath: semantic.latestCheckpoint.path, contractPaths: semantic.contracts.map((contract) => contract.path) },
    };
  }
  const runPath = runDir ? path.join(runDir, "run.md") : "";
  const runSource = runPath ? directBytes(runPath) : { status: "corrupt" };
  if (runSource.status !== "present") return corruptRecovery(identity, parsed.state.activeRun.id);
  const run = runSource.body.toString("utf8");
  const selected = history.entries.filter((entry) => entry.manifest.mode === "run" && entry.manifest.runId === parsed.state.activeRun.id);
  const loadedPaths = ["context.md", path.relative(identity.sessionDir, runPath), "progress.md"];
  return {
    prompt: [runtimeHeader({ identity, mode: "run", loaded: loadedPaths, activeRun: parsed.state.activeRun.id }), section("Session context.md", contextPath, context), section("Run run.md", runPath, run), section("Session progress.md", progressPath, progress), ...selected.map((entry) => section("Checkpoint history", "history.md", entry.body))].filter(Boolean).join("\n---\n\n"),
    metadata: { mode: "run", identityStatus: "resolved", identitySource: identity.source, loadedPaths, activeRun: parsed.state.activeRun.id, contextPath, runPath, progressPath },
  };
}
