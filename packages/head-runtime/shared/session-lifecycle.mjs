import fs from "node:fs";
import path from "node:path";

const SESSION_NAME = /^[A-Za-z0-9._-]+$/;

// Start-of-session memory (user decision 2026-09-17: "상태는 버리고 저장만").
// There is no open/closed state to maintain: every checkpoint is an append-only
// history entry that names the work it belonged to, and the start load is derived
// from history each time — the recent window plus the chain of entries sharing the
// last entry's work label, both cut by count, never summarised.
export const RECENT_ENTRIES = 5;
export const WORK_CHAIN_TAIL = 10;
export const WORK_SLUG = /^[a-z0-9가-힣][a-z0-9가-힣-]{0,60}$/;
export const CURSOR_PREFIX = "다음:";
const CURSOR_LIMIT = 400;

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

function directBytes(file) {
  try {
    const metadata = fs.lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return { status: "corrupt" };
    return { status: "present", body: fs.readFileSync(file) };
  } catch (error) { return error?.code === "ENOENT" ? { status: "missing" } : { status: "corrupt" }; }
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

const LOADED_RULE = "loaded_rule: context.md carries the session's intent and constraints. The history entries below are the memory loaded for this start — the current work chain (first entry plus the last "
  + `${WORK_CHAIN_TAIL} that share the last entry's work label) and the recent window (last ${RECENT_ENTRIES}), in time order, cut by count and never summarised. `
  + "The last entry's 다음: line is the cursor. Before acting on a request that continues this session, read the sources the graph selects for it; pull more history with read_history(work=..., grep=..., last=...)";

function runtimeHeader({ identity, loaded = [], diagnosis = "", memory = null }) {
  return [
    "<HEAD_RUNTIME_CONTEXT>",
    `logical_session: ${identity?.sessionName || "unresolved"}`,
    `logical_session_directory: ${identity?.sessionDir || "unresolved"}`,
    `identity_source: ${identity?.source || (identity?.status === "conflict" ? "conflict" : "unresolved")}`,
    "canon_path_rule: resolve paths listed in loaded against logical_session_directory, never against the process working directory",
    LOADED_RULE,
    `loaded: ${loaded.length ? loaded.join(", ") : "none"}`,
    ...(memory ? [
      `history: ${memory.total} entries${memory.total ? `, latest ${memory.latest || "?"}` : ""} (read_history)`,
      `work: ${memory.work ? `${memory.work} (${memory.chainCount} entries)` : "none"}`,
      `loaded_entries: ${memory.selected.length} of ${memory.total}`,
      `cursor: ${memory.cursor || "none"}`,
    ] : []),
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

/**
 * Parse `## <timestamp>[ work:<slug>][ run:<id>]` entries of one history.md.
 * `label` is the work label an entry belongs to: its `work:` token, or — for entries
 * written before labels existed — its `run:` stamp.
 */
export function parseHistoryEntries(body) {
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || "");
  // Only date-led entry headers split history; Markdown section headings stay in the body.
  // Keep legacy YYYY-MM-DD titles as well as the ISO timestamps written today.
  const matches = [...text.matchAll(/^##[ \t]+\d{4}-\d{2}-\d{2}(?=[T: \t\r]|$).*$/gm)];
  return matches.map((match, index) => {
    const tokens = match[0].replace(/^##\s+/, "").trim().split(/\s+/);
    let runId = "";
    let work = "";
    for (const token of tokens.slice(1)) {
      if (!runId && token.startsWith("run:")) runId = token.slice(4);
      else if (!work && token.startsWith("work:")) work = token.slice(5);
    }
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return { timestamp: tokens[0] || "", runId, work, label: work || runId, body: text.slice(start, end).trimEnd() };
  });
}

function cursorOf(entry) {
  if (!entry) return "";
  const lines = entry.body.split("\n").map((line) => line.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || "";
  return last.startsWith(CURSOR_PREFIX) ? last.slice(0, CURSOR_LIMIT) : "";
}

/**
 * The entries a start loads, derived from history alone: the chain of entries sharing
 * the last entry's label (first + last `chainTail`) united with the last `recent`
 * entries, returned in time order. No pointer, no close call, no file that grows.
 */
export function selectStartEntries(entries, { recent = RECENT_ENTRIES, chainTail = WORK_CHAIN_TAIL } = {}) {
  const total = entries.length;
  const last = entries[total - 1];
  const work = last?.label || "";
  const chain = work ? entries.filter((entry) => entry.label === work) : [];
  const chainPick = chain.length <= chainTail + 1 ? chain : [chain[0], ...chain.slice(-chainTail)];
  const picked = new Set([...chainPick, ...entries.slice(-recent)]);
  return {
    total,
    latest: last?.timestamp || "",
    work,
    chainCount: chain.length,
    selected: entries.filter((entry) => picked.has(entry)),
    cursor: cursorOf(last),
  };
}

function memorySection(historyPath, memory) {
  if (!memory.selected.length) return "";
  const heading = `# Loaded File: ${historyPath} — ${memory.selected.length} of ${memory.total} entries (work chain + recent window, time order)`;
  return [heading, "", memory.selected.map((entry) => entry.body).join("\n\n---\n\n"), ""].join("\n");
}

/**
 * Recover a Session by name: context.md plus the memory derived from history.md.
 * There is no mode. session-state.json, jobs/active.json and progress.md are not
 * read — the Run and job mechanisms were removed on 2026-09-17 ("걍 죽여"); their
 * directories stay on disk as records only.
 */
export function projectSessionRecovery({ headDirectory, liveSessionName, sessionRecord } = {}) {
  const identity = resolveSessionIdentity({ headDirectory, liveSessionName, sessionRecord });
  if (identity.status !== "resolved") {
    return { prompt: runtimeHeader({ identity, diagnosis: identity.diagnosis }), metadata: { mode: "unresolved", identityStatus: identity.status, diagnosis: identity.diagnosis, loadedPaths: [] } };
  }
  const contextPath = path.join(identity.sessionDir, "context.md");
  const historyPath = path.join(identity.sessionDir, "history.md");
  const context = presentText(directBytes(contextPath));
  const historySource = directBytes(historyPath);
  const memory = selectStartEntries(historySource.status === "present" ? parseHistoryEntries(historySource.body) : []);
  const historySection = memorySection(historyPath, memory);
  const loadedPaths = [...(context.trim() ? ["context.md"] : []), ...(historySection ? ["history.md"] : [])];
  return {
    prompt: [runtimeHeader({ identity, loaded: loadedPaths, memory }), section("Session context.md", contextPath, context), historySection].filter(Boolean).join("\n---\n\n"),
    metadata: { mode: "session", identityStatus: "resolved", identitySource: identity.source, loadedPaths, work: memory.work, historyEntries: memory.total, loadedEntries: memory.selected.length, cursor: memory.cursor, contextPath, historyPath },
  };
}
