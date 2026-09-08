import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const MANIFEST_RELATIVE_PATH = path.join(".claude", "head-runtime.json");
const PROJECT_ID = /^[a-z][a-z0-9-]{0,63}$/;
const HERDR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const contexts = new WeakSet();
const leases = new WeakMap();
const storage = new AsyncLocalStorage();

export class RuntimeContextError extends Error {
  constructor(code, message) { super(message); this.name = "RuntimeContextError"; this.code = code; }
}

function fail(code, message) { throw new RuntimeContextError(code, message); }
function lstat(candidate, code, message) { try { return fs.lstatSync(candidate); } catch { fail(code, message); } }
function entryExists(candidate) { try { fs.lstatSync(candidate); return true; } catch { return false; } }
function own(stat, owner, candidate) {
  if (typeof owner === "number" && typeof stat.uid === "number" && stat.uid !== owner) fail("AMBIGUOUS_OWNERSHIP", `${candidate} has an unexpected owner.`);
}
function directDirectory(candidate, owner, code = "INVALID_PROJECT_ROOT") {
  const stat = lstat(candidate, code, `${candidate} is unavailable.`);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("PATH_ESCAPE", `${candidate} must be a direct directory.`);
  own(stat, owner, candidate);
  return stat;
}
function directFile(candidate, owner) {
  const stat = lstat(candidate, "MISSING_MANIFEST", `No manifest exists at ${candidate}.`);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("PATH_ESCAPE", `${candidate} must be a direct regular file.`);
  own(stat, owner, candidate);
}
function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) immutable(item);
    Object.freeze(value);
  }
  return value;
}
function contained(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}
/** Reject every existing segment, including mutable descendants of a trusted root. */
export function assertNoSymlinkAncestors(absolute, { trustedRoot = "" } = {}) {
  if (typeof absolute !== "string" || !path.isAbsolute(absolute)) fail("PATH_ESCAPE", "A direct absolute path is required.");
  if (trustedRoot) {
    if (!path.isAbsolute(trustedRoot) || !contained(absolute, trustedRoot)) fail("PATH_ESCAPE", "The candidate escapes its trusted host-state root.");
    if (entryExists(trustedRoot)) {
      const rootStat = lstat(trustedRoot, "PATH_ESCAPE", `${trustedRoot} is unavailable.`);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail("PATH_ESCAPE", `${trustedRoot} must be a direct directory.`);
    }
  }
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!entryExists(current)) break;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail("PATH_ESCAPE", `${current} must not be a symlink.`);
  }
}
/** Validate the registry atomic replacement immediately before rename. */
export function validateBindingRegistryTemp(temp, root) {
  assertNoSymlinkAncestors(temp, { trustedRoot: root });
  let stat; try { stat = fs.lstatSync(temp); } catch { fail("PATH_ESCAPE", "The binding registry temporary disappeared before rename."); }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) fail("PATH_ESCAPE", "The binding registry temporary is not private.");
}

/** Parse the host-neutral, project-owned .claude/head-runtime.json contract. */
export function readProjectManifest(projectRoot) {
  const root = path.resolve(projectRoot);
  const rootStat = directDirectory(root);
  const owner = rootStat.uid;
  directDirectory(path.join(root, ".claude"), owner);
  const manifestPath = path.join(root, MANIFEST_RELATIVE_PATH);
  directFile(manifestPath, owner);
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch { fail("MALFORMED_MANIFEST", `${manifestPath} must contain valid JSON.`); }
  if (!manifest || Array.isArray(manifest) || Object.getPrototypeOf(manifest) !== Object.prototype) fail("MALFORMED_MANIFEST", "The runtime manifest must be a JSON object.");
  if (Object.keys(manifest).sort().join(",") !== "projectId,version" || manifest.version !== 1 || !PROJECT_ID.test(manifest.projectId)) {
    fail("MALFORMED_MANIFEST", "The runtime manifest has unsupported or invalid fields.");
  }
  return immutable({ version: 1, projectId: manifest.projectId });
}

/** Find the nearest canonical project root containing a direct runtime manifest. */
export function findCanonicalProjectRoot(cwd) {
  if (typeof cwd !== "string" || !cwd.trim()) fail("INVALID_CWD", "A validated live pane CWD is required.");
  let current;
  try {
    current = fs.realpathSync(cwd);
    if (!fs.statSync(current).isDirectory()) current = path.dirname(current);
  } catch { fail("INVALID_CWD", "The live pane CWD is unavailable."); }
  while (true) {
    if (entryExists(path.join(current, MANIFEST_RELATIVE_PATH))) { readProjectManifest(current); return current; }
    const parent = path.dirname(current);
    if (parent === current) fail("MISSING_MANIFEST", "No project runtime manifest exists above the live pane CWD.");
    current = parent;
  }
}

/** Validate a host-owned state root without creating it. */
export function validateHostStateRoot(hostStateRoot = path.join(os.homedir(), ".local", "state", "head-agent-core"), { projectRoot = "" } = {}) {
  if (typeof hostStateRoot !== "string" || !path.isAbsolute(hostStateRoot)) fail("INVALID_HOST_STATE_ROOT", "The host state root must be absolute.");
  const requested = path.resolve(hostStateRoot);
  assertNoSymlinkAncestors(requested);
  let existing = requested;
  while (!entryExists(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) fail("INVALID_HOST_STATE_ROOT", "No parent exists for the host state root.");
    existing = parent;
  }
  directDirectory(existing, typeof process.getuid === "function" ? process.getuid() : undefined, "INVALID_HOST_STATE_ROOT");
  const canonical = path.join(fs.realpathSync(existing), path.relative(existing, requested));
  if (projectRoot && contained(canonical, fs.realpathSync(projectRoot))) fail("STATE_ROOT_IN_PROJECT", "The host state root must not be inside the project root.");
  return canonical;
}

export function deriveHostRuntimePaths(projectId, hostStateRoot, { projectRoot = "" } = {}) {
  if (!PROJECT_ID.test(String(projectId || ""))) fail("INVALID_PROJECT_ID", "A valid project ID is required for host paths.");
  const root = validateHostStateRoot(hostStateRoot, { projectRoot });
  const projectStateDir = path.join(root, "projects", projectId);
  return immutable({ hostStateRoot: root, projectStateDir, runtimeDir: path.join(projectStateDir, "runtime"), agentTaskStateDir: path.join(projectStateDir, "agent-task"), agentCommStateDir: path.join(projectStateDir, "agent-comm") });
}

/** Durable registrations contain project identity only; live callers are ephemeral. */
export class HostBindingRegistry {
  constructor({ hostStateRoot } = {}) {
    this.hostStateRoot = validateHostStateRoot(hostStateRoot);
    this.filePath = path.join(this.hostStateRoot, "bindings.json");
    this.lockPath = path.join(this.hostStateRoot, "bindings.lock");
    this.byProjectId = new Map(); this.byProjectRoot = new Map(); this.live = new Map(); this.attachments = new Map();
    this.#load();
  }
  #load() {
    assertNoSymlinkAncestors(this.filePath, { trustedRoot: this.hostStateRoot }); if (!entryExists(this.filePath)) return;
    directFile(this.filePath, typeof process.getuid === "function" ? process.getuid() : undefined);
    if ((fs.lstatSync(this.filePath).mode & 0o777) !== 0o600 || fs.lstatSync(this.filePath).nlink !== 1) fail("PATH_ESCAPE", "The project registry must be a private direct file.");
    let records; try { records = JSON.parse(fs.readFileSync(this.filePath, "utf8")); } catch { fail("MALFORMED_BINDING_REGISTRY", "The project registry is invalid JSON."); }
    if (!Array.isArray(records)) fail("MALFORMED_BINDING_REGISTRY", "The project registry must be an array.");
    for (const record of records) this.#insertRegistration(record);
  }
  #reload() { this.byProjectId.clear(); this.byProjectRoot.clear(); this.#load(); }
  refresh() { this.#reload(); return this; }
  revision() { try { const stat = fs.statSync(this.filePath); return `${stat.ino}:${stat.mtimeMs}:${stat.size}`; } catch { return "empty"; } }
  #insertRegistration(record) {
    if (!record || Object.keys(record).sort().join(",") !== "projectId,projectRoot" || !PROJECT_ID.test(String(record.projectId || "")) || !path.isAbsolute(String(record.projectRoot || ""))) fail("MALFORMED_BINDING_REGISTRY", "A registration must contain only project ID and root.");
    const projectRoot = fs.realpathSync(record.projectRoot), projectId = record.projectId, existing = this.byProjectId.get(projectId) || this.byProjectRoot.get(projectRoot);
    if (existing && (existing.projectId !== projectId || existing.projectRoot !== projectRoot)) fail("DUPLICATE_PROJECT_REGISTRATION", "Project ID and canonical root are one-to-one.");
    const registration = immutable({ projectId, projectRoot }); this.byProjectId.set(projectId, registration); this.byProjectRoot.set(projectRoot, registration); return registration;
  }
  #save() { const temp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp, `${JSON.stringify([...this.byProjectId.values()], null, 2)}\n`, { mode: 0o600, flag: "wx" }); validateBindingRegistryTemp(temp, this.hostStateRoot); fs.renameSync(temp, this.filePath); }
  #withRegistrationLock(fn) {
    assertNoSymlinkAncestors(this.lockPath, { trustedRoot: this.hostStateRoot });
    fs.mkdirSync(this.hostStateRoot, { recursive: true, mode: 0o700 });
    const rootStat = fs.lstatSync(this.hostStateRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (rootStat.mode & 0o777) !== 0o700 || (typeof process.getuid === "function" && rootStat.uid !== process.getuid())) fail("INVALID_HOST_STATE_ROOT", "The host state root must be a private owner-held directory.");
    try { fs.mkdirSync(this.lockPath, { mode: 0o700 }); const lock = fs.lstatSync(this.lockPath); if (!lock.isDirectory() || lock.isSymbolicLink() || (lock.mode & 0o777) !== 0o700 || (typeof process.getuid === "function" && lock.uid !== process.getuid())) fail("PATH_ESCAPE", "The binding lock is not private."); }
    catch { fail("BINDING_REGISTRY_LOCKED", "The host binding registry is locked; registration fails closed."); }
    const release = () => { try { fs.rmdirSync(this.lockPath); } catch { fail("BINDING_REGISTRY_LOCK_RELEASE_FAILED", "The host binding registry lock could not be released."); } };
    try {
      const result = fn();
      // A delivery fence remains exclusive through async final acceptance.  This
      // is deliberately not used by reply polling, which performs short,
      // independent fenced reads instead of retaining a lock while sleeping.
      if (result && typeof result.then === "function") return Promise.resolve(result).then((value) => { release(); return value; }, (error) => { release(); throw error; });
      release(); return result;
    } catch (error) { release(); throw error; }
  }
  register(input) {
    if (!input || Object.keys(input).sort().join(",") !== "projectId,projectRoot") fail("INVALID_PROJECT_REGISTRATION", "Registration contains only projectId and projectRoot.");
    const { projectId, projectRoot } = input;
    const root = findCanonicalProjectRoot(projectRoot);
    const manifest = readProjectManifest(root);
    if (manifest.projectId !== projectId) fail("BINDING_MANIFEST_MISMATCH", "The binding project ID must match the project manifest.");
    const trustedRoot = validateHostStateRoot(this.hostStateRoot, { projectRoot: root });
    if (trustedRoot !== this.hostStateRoot) fail("INVALID_HOST_STATE_ROOT", "The host state root changed after registry initialization.");
    return this.#withRegistrationLock(() => {
      this.#reload();
      try {
        const binding = this.#insertRegistration({ projectId, projectRoot: root });
        this.#save();
        return binding;
      } catch (error) {
        this.#reload();
        throw error;
      }
    });
  }
  unregister(input) {
    if (!input || Object.keys(input).sort().join(",") !== "projectId,projectRoot") fail("INVALID_PROJECT_REGISTRATION", "Registration contains only projectId and projectRoot.");
    return this.#withRegistrationLock(() => {
      this.#reload();
      const current = this.byProjectId.get(input.projectId);
      if (!current || current.projectRoot !== input.projectRoot) fail("MISSING_PROJECT_REGISTRATION", "Only the exact project registration may be removed.");
      this.byProjectId.delete(current.projectId); this.byProjectRoot.delete(current.projectRoot); this.#save();
      return current;
    });
  }
  attachHead(caller) { return this.#attach(caller, true); }
  attachRole(caller) { return this.#attach(caller, false); }
  #attach(caller, head) {
    if (!caller || typeof caller !== "object" || !HERDR_ID.test(String(caller.workspaceId || "")) || (head && caller.role !== "head") || (!head && (!caller.role || caller.role === "head"))) fail("INVALID_CALLER", "An exact host-derived role caller is required.");
    const projectRoot = findCanonicalProjectRoot(caller.cwd), manifest = readProjectManifest(projectRoot), registration = this.byProjectId.get(manifest.projectId);
    if (!registration || registration.projectRoot !== projectRoot) fail("UNREGISTERED_PROJECT", "The live caller project is not registered.");
    const active = this.live.get(manifest.projectId);
    if (head) {
      const generation = active?.authorityGeneration || crypto.randomBytes(32).toString("base64url");
      const authority = immutable({ ...registration, workspaceId: caller.workspaceId, authorityGeneration: generation, caller: immutable({ ...caller }) });
      if (!active) this.live.set(manifest.projectId, authority);
      this.attachments.set(`${manifest.projectId}\0${caller.workspaceId}`, authority);
      return authority;
    }
    if (!active) fail("STALE_AUTHORITY_GENERATION", "A role caller must attach to the active HEAD generation.");
    const attached = immutable({ ...registration, workspaceId: caller.workspaceId, authorityGeneration: active.authorityGeneration, caller: immutable({ ...caller }) }); this.attachments.set(`${manifest.projectId}\0${caller.workspaceId}`, attached); return attached;
  }
  resolve({ workspaceId, projectId, projectRoot }) {
    const active = this.live.get(projectId);
    if (!active || active.projectRoot !== projectRoot) fail("UNBOUND_WORKSPACE", "The project has no active authority.");
    if (active.caller.workspaceId === workspaceId) return immutable({ ...active, workspaceId });
    const attached = this.attachments.get(`${projectId}\0${workspaceId}`);
    if (attached && attached.projectRoot === projectRoot && attached.authorityGeneration === active.authorityGeneration) return attached;
    fail("UNBOUND_WORKSPACE", "The validated workspace is not attached to this project authority.");
  }
  activeAuthority({ projectId, projectRoot }) {
    const active = this.live.get(projectId);
    if (!active || active.projectRoot !== projectRoot) fail("UNBOUND_WORKSPACE", "The project has no active authority.");
    return active;
  }
  /** Fence every mutable operation to the currently durable authority generation. */
  assertActiveAuthority({ workspaceId, projectId, projectRoot, authorityGeneration }) {
    const binding = this.resolve({ workspaceId, projectId, projectRoot });
    if (!binding.authorityGeneration || !HERDR_ID.test(String(authorityGeneration || "")) || binding.authorityGeneration !== authorityGeneration) {
      fail("STALE_AUTHORITY_GENERATION", "The caller does not hold the active authority generation for this binding.");
    }
    return binding;
  }
  /**
   * Serialize a mutable host operation with rotation.  The durable registry is
   * reloaded while the exclusive lock is held; callers must do all effects in
   * this callback, not after it returns.
   */
  withActiveAuthority(binding, fn) {
    if (typeof fn !== "function") fail("INVALID_CALLBACK", "An authority callback is required.");
    return this.#withRegistrationLock(() => {
      this.#reload();
      const active = this.assertActiveAuthority(binding);
      return fn(active);
    });
  }
}

export function createHostBindingRegistry(options) { return new HostBindingRegistry(options); }

/** Create an immutable request binding; caller validation and host registry registration are prerequisites. */
export function resolveProjectRuntimeContext({ caller, cwd = caller?.cwd, bindingRegistry } = {}) {
  if (!caller || typeof caller !== "object" || !HERDR_ID.test(String(caller.workspaceId || ""))) fail("INVALID_CALLER", "A validated Herdr caller with a workspace ID is required.");
  if (!(bindingRegistry instanceof HostBindingRegistry)) fail("MISSING_BINDING_REGISTRY", "A host-owned binding registry is required.");
  const projectRoot = findCanonicalProjectRoot(cwd);
  const manifest = readProjectManifest(projectRoot);
  const binding = bindingRegistry.resolve({ workspaceId: caller.workspaceId, projectId: manifest.projectId, projectRoot });
  const context = immutable({ projectRoot, manifest, binding, workspace: { id: caller.workspaceId }, caller: { ...caller, cwd: fs.realpathSync(cwd) }, paths: deriveHostRuntimePaths(manifest.projectId, bindingRegistry.hostStateRoot, { projectRoot }) });
  contexts.add(context);
  leases.set(context, { active: false, settled: false });
  return context;
}

export function runWithRuntimeContext(context, fn) {
  if (!contexts.has(context)) fail("INVALID_CONTEXT", "Only a resolved project runtime context may be installed.");
  if (typeof fn !== "function") fail("INVALID_CALLBACK", "A runtime context callback is required.");
  const lease = leases.get(context);
  if (lease.active || lease.settled) fail("CONTEXT_IN_USE", "A runtime context may serve only its original request.");
  lease.active = true;
  const settle = () => { lease.active = false; lease.settled = true; };
  let result;
  try { result = storage.run(context, fn); }
  catch (error) { settle(); throw error; }
  if (!result || typeof result.then !== "function") {
    settle();
    return result;
  }
  return Promise.resolve(result).then(
    (value) => { settle(); return value; },
    (error) => { settle(); throw error; },
  );
}

export function getRuntimeContext() {
  const context = storage.getStore();
  return context && leases.get(context)?.active ? context : null;
}
export function requireRuntimeContext() {
  const context = getRuntimeContext();
  if (!context) fail("MISSING_CONTEXT", "No active project runtime context is available for this request.");
  return context;
}
