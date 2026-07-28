import fs from "node:fs";
import path from "node:path";

const SESSION_NAME = /^[A-Za-z0-9._-]+$/;
const SESSION_STATE = `${JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }, null, 2)}\n`;

function directDirectory(directory, description) {
  const metadata = fs.lstatSync(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${description} must be a direct directory`);
  }
  return fs.realpathSync(directory);
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function pathExists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function writeDurableFile(file, body) {
  const descriptor = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, body, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Publish a new Session-mode context without creating runtime or host state. */
export function bootstrapOnboardingSession({ headDirectory, name, context } = {}) {
  if (!SESSION_NAME.test(String(name || ""))) throw new Error("invalid Session name");
  if (typeof context !== "string" || !context.trim()) throw new Error("initial context is required");

  const head = directDirectory(headDirectory, "HEAD directory");
  const sessions = path.join(head, "sessions");
  const resolvedSessions = directDirectory(sessions, "sessions directory");
  if (path.dirname(resolvedSessions) !== head) throw new Error("sessions directory escapes HEAD directory");

  const session = path.join(sessions, name);
  if (pathExists(session)) throw new Error("Session already exists");

  let temporary = "";
  try {
    temporary = fs.mkdtempSync(path.join(sessions, ".bootstrap-"));
    writeDurableFile(path.join(temporary, "context.md"), context);
    writeDurableFile(path.join(temporary, "session-state.json"), SESSION_STATE);
    syncDirectory(temporary);

    if (pathExists(session)) throw new Error("Session already exists");
    fs.renameSync(temporary, session);
    temporary = "";
    syncDirectory(sessions);
    return session;
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
}
