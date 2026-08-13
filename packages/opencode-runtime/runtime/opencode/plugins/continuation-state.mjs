import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

export function continuationDirectory(root) {
  return path.join(root, ".claude", "agents", "head", "opencode", "state", "continuations");
}

export function instructionHash(instruction) {
  return crypto.createHash("sha256").update(instruction, "utf8").digest("hex");
}

export function continuationFile(root, sessionID) {
  if (!/^ses_[A-Za-z0-9]+$/.test(String(sessionID || ""))) throw new Error("invalid session ID");
  return path.join(continuationDirectory(root), `${sessionID}.json`);
}

export function loadContinuation(root, sessionID) {
  try { return JSON.parse(fs.readFileSync(continuationFile(root, sessionID), "utf8")); } catch { return null; }
}

export function saveContinuation(root, record) {
  const target = continuationFile(root, record.sessionID);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  syncDirectory(directory);
  let temporary = "";
  try {
    temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
    const descriptor = fs.openSync(temporary, "wx", 0o600);
    try { fs.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`, "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, target); temporary = ""; syncDirectory(directory);
    const readBack = JSON.parse(fs.readFileSync(target, "utf8"));
    if (JSON.stringify(readBack) !== JSON.stringify(record)) throw new Error("continuation state read-back mismatch");
    return readBack;
  } finally { if (temporary) try { fs.unlinkSync(temporary); } catch {} }
}

export function textSummary(parts, assistantID) {
  return parts.filter((part) => part?.type === "text" && part.messageID === assistantID)
    .map((part) => String(part.text || "").trim()).filter(Boolean).join("\n").trim();
}

/** Bind only the successful compaction assistant parented by this exact request. */
export function bindCompactionOutput(messages, compactionID) {
  const matches = messages.filter(({ info } = {}) => info?.role === "assistant" && info.parentID === compactionID
    && info.mode === "compaction" && info.summary === true && info.finish && !info.error);
  if (matches.length !== 1) return { status: "ambiguous", reason: matches.length ? "multiple_summary_assistants" : "missing_summary_assistant" };
  const assistant = matches[0].info;
  const instruction = textSummary(matches[0].parts || [], assistant.id);
  return instruction ? { status: "captured", compactionID, outputID: assistant.id, instruction }
    : { status: "ambiguous", reason: "blank_summary_text", compactionID, outputID: assistant.id };
}
