import fs from "node:fs";
import path from "node:path";
import { latestValidCheckpoint } from "./checkpoint-ledger.mjs";
import { parseSessionState } from "./session-lifecycle.mjs";

function regularFile(file) {
  try {
    const metadata = fs.lstatSync(file);
    return metadata.isFile() && !metadata.isSymbolicLink();
  } catch { return false; }
}

function regularText(file) {
  return regularFile(file) ? fs.readFileSync(file, "utf8") : "";
}

function directSessions(headDirectory) {
  const sessionsDirectory = path.join(headDirectory, "sessions");
  try {
    return fs.readdirSync(sessionsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && regularFile(path.join(sessionsDirectory, entry.name, "context.md")))
      .map((entry) => ({ name: entry.name, directory: path.join(sessionsDirectory, entry.name) }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch { return []; }
}

function relative(headDirectory, file) {
  return path.relative(headDirectory, file).split(path.sep).join("/");
}

function classifyMissingState(sessionDirectory) {
  const checkpoint = latestValidCheckpoint(sessionDirectory);
  const run = regularText(path.join(sessionDirectory, "run.md"));
  if (checkpoint?.record.decision.type === "DONE") {
    return { classification: "session", state: { schema: 1, generation: 0, mode: "session", activeRun: null } };
  }
  if (checkpoint && run.trim()) {
    return { classification: "run", state: { schema: 1, generation: 0, mode: "run", activeRun: { id: "legacy-root", path: "." } } };
  }
  if (!checkpoint && !run) return { classification: "session", state: { schema: 1, generation: 0, mode: "session", activeRun: null } };
  return { classification: "ambiguous" };
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

/** Atomically publish a new file without replacing an already-existing state file. */
function writeNewState(file, state) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  try {
    fs.linkSync(temporary, file);
    syncDirectory(directory);
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

/**
 * Inventory direct logical Sessions and, only with apply enabled, publish explicit
 * state for classifications that do not require interpreting Session prose.
 */
export function migrateSessionStates({ headDirectory, apply = false } = {}) {
  const head = path.resolve(String(headDirectory || ""));
  const entries = [];
  const created = [];
  const skipped = [];
  const errors = [];

  for (const session of directSessions(head)) {
    const statePath = path.join(session.directory, "session-state.json");
    const stateReference = relative(head, statePath);
    const existing = parseSessionState(session.directory);
    if (existing.status === "corrupt") {
      const entry = { session: session.name, path: stateReference, classification: "error", outcome: "error", code: "SESSION_STATE_CORRUPT" };
      entries.push(entry); errors.push(stateReference); continue;
    }
    if (existing.status === "session" || existing.status === "run") {
      const entry = { session: session.name, path: stateReference, classification: "existing", outcome: "unchanged" };
      entries.push(entry); skipped.push(stateReference); continue;
    }

    const classification = classifyMissingState(session.directory);
    if (classification.classification === "ambiguous") {
      const entry = { session: session.name, path: stateReference, classification: "ambiguous", outcome: "ambiguous" };
      entries.push(entry); skipped.push(stateReference); continue;
    }
    if (!apply) {
      const entry = { session: session.name, path: stateReference, classification: classification.classification, outcome: "would_create" };
      entries.push(entry); continue;
    }
    try {
      writeNewState(statePath, classification.state);
      const entry = { session: session.name, path: stateReference, classification: classification.classification, outcome: "created" };
      entries.push(entry); created.push(stateReference);
    } catch (error) {
      const code = error?.code === "EEXIST" ? "SESSION_STATE_EXISTS" : "SESSION_STATE_WRITE_FAILED";
      const entry = { session: session.name, path: stateReference, classification: "error", outcome: "error", code };
      entries.push(entry); errors.push(stateReference);
    }
  }
  return { dryRun: !apply, considered: entries, created, skipped, errors };
}

function commandLine(argumentsList) {
  let headDirectory = "";
  let apply = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    if (argumentsList[index] === "--apply") apply = true;
    else if (argumentsList[index] === "--head-directory") headDirectory = argumentsList[++index] || "";
    else throw new Error(`unknown argument: ${argumentsList[index]}`);
  }
  if (!headDirectory) throw new Error("--head-directory is required");
  return migrateSessionStates({ headDirectory, apply });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.stdout.write(`${JSON.stringify(commandLine(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
