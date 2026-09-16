import fs from "node:fs";
import path from "node:path";
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

const JOB_ID = /^[0-9]{8}-[a-z0-9가-힣][a-z0-9가-힣-]{0,60}$/;

/** The job in progress: `jobs/active.json` names it, `jobs/<id>/job.md` is its record. Never a Run pointer. */
export function resolveActiveJob(sessionDir) {
  const pointer = directBytes(path.join(sessionDir, "jobs", "active.json"));
  if (pointer.status !== "present") return { status: pointer.status === "missing" ? "none" : "corrupt" };
  let id;
  try { id = JSON.parse(pointer.body.toString("utf8"))?.id; } catch { return { status: "corrupt" }; }
  if (typeof id !== "string" || !JOB_ID.test(id)) return { status: "corrupt" };
  const file = path.join(sessionDir, "jobs", id, "job.md");
  const body = presentText(directBytes(file));
  if (!body.trim()) return { status: "corrupt", id };
  const direction = /^## 해결방향[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)?.[1] || "";
  return { status: "active", id, file, body, directionFilled: Boolean(direction.trim()) };
}

function jobHeaderLine(job) {
  if (!job || job.status === "none") return "active_job: none";
  if (job.status !== "active") return `active_job: corrupt${job.id ? ` (${job.id})` : ""}`;
  return `active_job: ${job.id} (해결방향 ${job.directionFilled ? "filled" : "empty"})`;
}

function runtimeHeader({ identity, mode, loaded = [], activeRun = "none", diagnosis = "", job = null, history = "" }) {
  return [
    "<HEAD_RUNTIME_CONTEXT>",
    `logical_session: ${identity?.sessionName || "unresolved"}`,
    `logical_session_directory: ${identity?.sessionDir || "unresolved"}`,
    `mode: ${mode}`,
    `identity_source: ${identity?.source || (identity?.status === "conflict" ? "conflict" : "unresolved")}`,
    "canon_path_rule: resolve paths listed in loaded against logical_session_directory, never against the process working directory",
    "loaded_rule: context.md and progress.md carry the session's intent, constraints, and cursor, not its working context. Before answering or acting on a request that continues this session, rebuild that context: read the recent history entries (read_history), the job or run canon the cursor names, and the sources the graph selects for the request",
    `loaded: ${loaded.length ? loaded.join(", ") : "none"}`,
    `active_run: ${activeRun}`,
    jobHeaderLine(job),
    ...(history ? [history] : []),
    ...(diagnosis ? [`diagnosis: ${diagnosis}`] : []),
    "</HEAD_RUNTIME_CONTEXT>",
  ].join("\n");
}

function section(label, file, body) {
  return body.trim() ? [`# Loaded File: ${file || label}`, "", body.trim(), ""].join("\n") : "";
}

function presentText(source) {
  return source.status === "present" ? source.body.toString("utf8") : "";
}

export function parseHistoryEntries(body) {
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || "");
  const matches = [...text.matchAll(/^##\s+.+$/gm)];
  return matches.map((match, index) => {
    const heading = match[0];
    const parsed = heading.match(/^##\s+(\S+)(?:\s+run:(\S+))?/);
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return { timestamp: parsed?.[1] || "", runId: parsed?.[2] || "", body: text.slice(start, end).trimEnd() };
  });
}

// Session mode injects no history: the record stays on disk and HEAD reads it through
// `read_history` when the work needs it (user decision 2026-09-03; the same rule was
// recorded 2026-07-18 and 2026-08-11). Run mode keeps its own Run-scoped checkpoint
// history because the Run canon is the exception that carries it.
function selectedHistory(entries, mode, runId) {
  if (mode === "run" && runId) return entries.filter((entry) => entry.runId === runId);
  return [];
}

function historyHeaderLine(entries) {
  if (!entries.length) return "history: 0 entries";
  const latest = entries[entries.length - 1];
  return `history: ${entries.length} entries, latest ${latest.timestamp || "?"} (read_history)`;
}

/** Recover Session files by session name. History hashes never empty the payload. */
export function projectSessionRecovery({ headDirectory, liveSessionName, sessionRecord } = {}) {
  const identity = resolveSessionIdentity({ headDirectory, liveSessionName, sessionRecord });
  if (identity.status !== "resolved") {
    return { prompt: runtimeHeader({ identity, mode: "unresolved", diagnosis: identity.diagnosis }), metadata: { mode: "unresolved", identityStatus: identity.status, diagnosis: identity.diagnosis, loadedPaths: [], activeRun: "" } };
  }

  const parsed = parseSessionState(identity.sessionDir);
  const mode = parsed.status === "run" ? "run" : "session";
  const runId = mode === "run" ? parsed.state.activeRun.id : "";
  const contextPath = path.join(identity.sessionDir, "context.md");
  const progressPath = path.join(identity.sessionDir, "progress.md");
  const historyPath = path.join(identity.sessionDir, "history.md");
  const context = presentText(directBytes(contextPath));
  const progress = presentText(directBytes(progressPath)).slice(0, PROGRESS_LIMIT);
  const historySource = directBytes(historyPath);
  const allEntries = historySource.status === "present" ? parseHistoryEntries(historySource.body) : [];
  const selected = selectedHistory(allEntries, mode, runId);
  const historyLine = historyHeaderLine(allEntries);
  const loadedPaths = [
    ...(context.trim() ? ["context.md"] : []),
    ...(progress.trim() ? ["progress.md"] : []),
    ...(selected.length ? ["history.md"] : []),
  ];
  const historySections = selected.map((entry) => section("Checkpoint history", historyPath, entry.body));
  const job = resolveActiveJob(identity.sessionDir);
  const jobRel = job.status === "active" ? path.relative(identity.sessionDir, job.file) : "";
  if (jobRel) loadedPaths.splice(context.trim() ? 1 : 0, 0, jobRel);
  const jobSection = job.status === "active" ? section("Job job.md", job.file, job.body) : "";

  if (mode === "session") {
    return {
      prompt: [runtimeHeader({ identity, mode: "session", loaded: loadedPaths, job, history: historyLine }), section("Session context.md", contextPath, context), jobSection, section("Session progress.md", progressPath, progress), ...historySections].filter(Boolean).join("\n---\n\n"),
      metadata: { mode: "session", identityStatus: "resolved", identitySource: identity.source, loadedPaths, activeRun: "", activeJob: job.status === "active" ? job.id : "", contextPath, progressPath },
    };
  }

  const runDir = resolveActiveRun(identity.sessionDir, parsed.state.activeRun);
  const semantic = runDir && resolveSemanticRun(runDir, parsed.state.activeRun.id);
  const runPath = runDir ? path.join(runDir, "run.md") : "";
  const run = runPath ? presentText(directBytes(runPath)) : "";
  if (run.trim()) loadedPaths.splice(loadedPaths.includes("progress.md") ? loadedPaths.indexOf("progress.md") : loadedPaths.length, 0, path.relative(identity.sessionDir, runPath));
  const semanticSections = semantic?.status === "valid" ? [
    section("Run run.md", semantic.runIndex.path, semantic.runIndex.body),
    section("Latest Checkpoint", semantic.latestCheckpoint.path, semantic.latestCheckpoint.body),
    ...semantic.contracts.map((contract) => section("Current Execution Contract", contract.path, contract.body)),
  ] : [section("Run run.md", runPath, run)];
  if (semantic?.status === "valid") {
    loadedPaths.push(path.relative(identity.sessionDir, semantic.latestCheckpoint.path), ...semantic.contracts.map((contract) => path.relative(identity.sessionDir, contract.path)));
  }
  return {
    prompt: [runtimeHeader({ identity, mode: "run", loaded: loadedPaths, activeRun: runId, job, history: historyLine }), section("Session context.md", contextPath, context), jobSection, ...semanticSections, section("Session progress.md", progressPath, progress), ...historySections].filter(Boolean).join("\n---\n\n"),
    metadata: { mode: "run", format: semantic?.status === "valid" ? "semantic" : "legacy", identityStatus: "resolved", identitySource: identity.source, loadedPaths, activeRun: runId, activeJob: job.status === "active" ? job.id : "", contextPath, runPath, progressPath },
  };
}
