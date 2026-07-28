import fs from "node:fs";
import path from "node:path";

const CHECKPOINT_FILE = /^0\d{3,}\.json$/;
const DECISION_TYPES = new Set(["START", "CONTINUE", "REVISE", "USER_DECISION", "DONE"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}

function isHorizon(value) {
  return isObject(value) && isNullableString(value.slice) && isNullableString(value.wave);
}

function isNext(value) {
  return isObject(value)
    && typeof value.output === "string"
    && isNullableString(value.slice)
    && isNullableString(value.wave);
}

export function isValidCheckpointRecord(value) {
  return isObject(value)
    && typeof value.id === "string"
    && typeof value.at === "string"
    && isHorizon(value.horizon)
    && typeof value.expected === "string"
    && typeof value.observed === "string"
    && Array.isArray(value.evidence) && value.evidence.every((reference) => typeof reference === "string")
    && isObject(value.decision) && DECISION_TYPES.has(value.decision.type) && typeof value.decision.reason === "string"
    && isNext(value.next);
}

function checkpointEntries(sessionDir) {
  const ledgerDir = path.join(sessionDir, "ledger");
  try {
    return fs.readdirSync(ledgerDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && CHECKPOINT_FILE.test(entry.name))
      .map((entry) => ({ name: entry.name, sequence: Number.parseInt(entry.name, 10), path: path.join(ledgerDir, entry.name) }));
  } catch { return []; }
}

export function latestValidCheckpoint(sessionDir) {
  const valid = [];
  for (const entry of checkpointEntries(sessionDir)) {
    try {
      const record = JSON.parse(fs.readFileSync(entry.path, "utf8"));
      if (isValidCheckpointRecord(record)) valid.push({ ...entry, record });
    } catch {}
  }
  valid.sort((left, right) => right.sequence - left.sequence);
  return valid[0] || null;
}

function nextCheckpointPath(sessionDir) {
  const entries = checkpointEntries(sessionDir);
  const largest = entries.reduce((maximum, entry) => Math.max(maximum, entry.sequence), -1);
  const sequence = largest + 1;
  const width = Math.max(4, ...entries.map((entry) => entry.name.length - ".json".length));
  return path.join(sessionDir, "ledger", `${String(sequence).padStart(width, "0")}.json`);
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

/** Append the next checkpoint, carrying its expectation and horizon from the prior record. */
export function appendCheckpoint(sessionDir, { id, at, observed, evidence, decision, next }) {
  const previous = latestValidCheckpoint(sessionDir);
  if (!previous) throw new Error("a valid previous checkpoint is required to append");
  const record = {
    id,
    at,
    horizon: {
      slice: previous.record.next.slice,
      wave: previous.record.next.wave,
    },
    expected: previous.record.next.output,
    observed,
    evidence,
    decision,
    next,
  };
  if (!isValidCheckpointRecord(record)) throw new Error("checkpoint record does not satisfy the ledger schema");

  const target = nextCheckpointPath(sessionDir);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.existsSync(target)) throw new Error(`checkpoint already exists: ${path.basename(target)}`);
  let temporary = "";
  try {
    temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
    const descriptor = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      fs.fsyncSync(descriptor);
    } finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, target);
    temporary = "";
    syncDirectory(directory);
    return { path: target, record };
  } finally {
    if (temporary) { try { fs.unlinkSync(temporary); } catch {} }
  }
}

export function currentSlice(sessionDir, checkpoint = latestValidCheckpoint(sessionDir)) {
  const pointer = checkpoint?.record?.next?.slice;
  if (pointer === null || pointer === undefined) return { status: "none", path: "", body: "" };
  if (typeof pointer !== "string" || !pointer.trim()) return { status: "invalid", path: "", body: "" };
  const root = fs.realpathSync(sessionDir);
  const candidate = path.resolve(sessionDir, pointer);
  try {
    const resolved = fs.realpathSync(candidate);
    if (path.relative(root, resolved).startsWith("..") || path.isAbsolute(path.relative(root, resolved))) return { status: "outside", path: "", body: "" };
    if (!fs.statSync(resolved).isFile()) return { status: "missing", path: "", body: "" };
    return { status: "valid", path: resolved, body: fs.readFileSync(resolved, "utf8") };
  } catch { return { status: "missing", path: "", body: "" }; }
}
