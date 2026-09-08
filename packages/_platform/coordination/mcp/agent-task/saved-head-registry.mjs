import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RuntimeContextError, assertNoSymlinkAncestors } from "./runtime-context.mjs";

const SESSION = /^ses_[A-Za-z0-9_-]+$/;
const fail = (code, message) => { throw new RuntimeContextError(code, message); };
const validName = (value) => typeof value === "string" && value.length > 0;
const validRecord = (value) => value && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && SESSION.test(String(value.sessionId || "")) && value.immutable === true;

function directPrivateFile(file, stateRoot) {
  assertNoSymlinkAncestors(file, { trustedRoot: stateRoot });
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) {
    fail("UNSAFE_SAVED_HEAD_REGISTRY", "Saved HEAD state must be one owner-private regular file.");
  }
}

export function readSavedHeads(file, stateRoot) {
  try {
    directPrivateFile(file, stateRoot);
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail("INVALID_SAVED_HEAD_REGISTRY", "Saved HEAD registry must be an object.");
    for (const [name, record] of Object.entries(value)) if (!validName(name) || !validRecord(record)) fail("INVALID_SAVED_HEAD_REGISTRY", "Saved HEAD registry contains an invalid record.");
    return value;
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    if (error instanceof RuntimeContextError) throw error;
    fail("INVALID_SAVED_HEAD_REGISTRY", "Saved HEAD registry is unreadable.");
  }
}

export function registerSavedHead({ file, stateRoot, name, sessionId, source = null, createdAt = new Date().toISOString() } = {}) {
  if (!validName(name) || !SESSION.test(String(sessionId || ""))) fail("INVALID_SAVED_HEAD", "A valid immutable saved HEAD name and session are required.");
  const records = readSavedHeads(file, stateRoot);
  if (Object.hasOwn(records, name)) fail("SAVED_HEAD_EXISTS", `Saved HEAD already exists: ${name}`);
  records[name] = { sessionId, source, createdAt, immutable: true };
  const directory = path.dirname(file);
  assertNoSymlinkAncestors(directory, { trustedRoot: stateRoot });
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  directPrivateFile(temporary, stateRoot);
  fs.renameSync(temporary, file);
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  return Object.freeze({ name, source, createdAt, immutable: true });
}

export function requireSavedHead({ file, stateRoot, name } = {}) {
  if (!validName(name)) fail("INVALID_SAVED_HEAD", "A valid saved HEAD name is required.");
  const sessionId = readSavedHeads(file, stateRoot)[name]?.sessionId;
  if (!sessionId) fail("SAVED_HEAD_NOT_FOUND", `Saved HEAD was not found: ${name}`);
  return sessionId;
}
