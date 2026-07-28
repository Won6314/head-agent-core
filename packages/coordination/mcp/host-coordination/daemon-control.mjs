import childProcess from "node:child_process";
import crypto from "node:crypto";
import fsNative from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDaemonConfig } from "./daemon-entry.mjs";

const ENTRY = fsNative.realpathSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "daemon-entry.mjs"));
const NODE = fsNative.realpathSync(process.execPath);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonical = (value) => JSON.stringify(normalize(value));
const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
const digest = (json) => crypto.createHash("sha256").update(json).digest("hex");
const owned = (stat) => typeof process.getuid !== "function" || stat.uid === process.getuid();
const mode = (stat, expected) => (stat.mode & 0o777) === expected;
const result = (state, extra = {}) => Object.freeze({ state, ...extra });
const fail = (message, code = "DAEMON_CONTROL_REFUSED") => Object.assign(new Error(message), { code });

function noSymlinkAncestors(fs, target) {
  let current = path.parse(path.resolve(target)).root;
  for (const part of path.relative(current, path.resolve(target)).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw fail("Daemon paths may not have symlink ancestors.", "UNSAFE_DAEMON_PATH");
  }
}

function privateDirectory(fs, root, { create = false } = {}) {
  let existing = root;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  noSymlinkAncestors(fs, existing);
  const resolved = path.join(fs.realpathSync(existing), path.relative(existing, root));
  if (!fs.existsSync(resolved)) {
    if (!create) throw fail("Daemon state root is absent.", "STATE_ROOT_ABSENT");
    fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  }
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !owned(stat) || !mode(stat, 0o700)) throw fail("State root must be an owned private non-symlink directory.", "UNSAFE_STATE_ROOT");
  noSymlinkAncestors(fs, resolved);
  return fs.realpathSync(resolved);
}

function privateFile(fs, file, { absent = false } = {}) {
  if (!fs.existsSync(file)) return null;
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || !owned(stat) || stat.nlink !== 1 || !mode(stat, 0o600)) throw fail("Daemon record is not a private direct owner-held file.", "UNSAFE_DAEMON_RECORD");
  if (absent) throw fail("Daemon record already exists.", "EXISTING_DAEMON_RECORD");
  return stat;
}

function metadataFile(root) { return path.join(root, "daemon.json"); }
function lockFile(root) { return path.join(root, "daemon.lock"); }
function logFile(root, token) { return path.join(root, `daemon-${token}.log`); }

function privateChildDirectory(fs, file) {
  const stat = fs.lstatSync(file);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !owned(stat) || !mode(stat, 0o700)) throw fail("Daemon state has an unsafe direct child.", "UNSAFE_STATE_CHILD");
}

function validateExistingChildren(fs, root) {
  for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name);
    // lstat is deliberate: no direct child may be followed through a link.
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw fail("Daemon state has a symlink direct child.", "UNSAFE_STATE_CHILD");
    if (name === "daemon.json" || name === "daemon.lock") {
      // Both records must be absent; checking their type first prevents an
      // attacker from converting the refusal into an unsafe-file bypass.
      privateFile(fs, file, { absent: true });
      continue;
    }
    if (name === "bindings.json" || name === "daemon.log" || /^daemon-[0-9a-f-]{36}\.log$/i.test(name)) {
      privateFile(fs, file);
      continue;
    }
    if (name === "projects" || name === "bindings.lock" || name === "evidence" || name === "runtime") {
      privateChildDirectory(fs, file);
      continue;
    }
    // Unknown regular files, FIFOs, devices, sockets, and directories do not
    // have a durable host-state contract and are refused rather than trusted.
    throw fail("Daemon state has an unknown direct child.", "UNSAFE_STATE_CHILD");
  }
}

function parseMetadata(fs, root) {
  const file = metadataFile(root); privateFile(fs, file);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw fail("Daemon metadata is invalid.", "INVALID_DAEMON_METADATA"); }
}

function exactMetadata(metadata, expected) {
  if (!metadata || metadata.schema !== 1 || metadata.entry !== expected.entry || !UUID.test(metadata.startToken || "") || metadata.startToken !== expected.startToken || !Number.isInteger(metadata.pid) || metadata.pid < 2 || metadata.configDigest !== expected.configDigest || metadata.host !== expected.host || metadata.port !== expected.port || metadata.socketPath !== expected.socketPath || metadata.stateRoot !== expected.stateRoot) return false;
  return true;
}

function commandProves(line, expected) {
  // The digest is proven by exact metadata-to-config comparison; it is not an
  // argv field. The canonical JSON itself must be present literally in argv.
  return typeof line === "string" && line.includes(expected.node) && line.includes(expected.entry) && line.includes(" serve ") && line.includes(expected.startToken) && line.includes(expected.configJson);
}

async function defaultPortFree(host, port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer().once("error", () => reject(fail("Port is occupied.", "OCCUPIED_PORT"))).once("listening", () => server.close(resolve));
    server.listen(port, host);
  });
}

async function defaultHealth(expected) {
  const body = { jsonrpc: "2.0", id: "daemon-health", method: "health" };
  for (const endpoint of ["agent-task", "agent-comm"]) {
    const response = await fetch(`http://${expected.host}:${expected.port}/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json();
    if (!response.ok || json?.result?.endpoint !== (endpoint === "agent-task" ? "task" : "comm") || !json?.result?.hostIdentity || JSON.stringify(json).match(/workspace|terminal|cwd|socket/i)) throw fail("Daemon health identity is invalid.", "HEALTH_MISMATCH");
  }
}

function defaults() {
  return {
    fs: fsNative, node: NODE, entry: ENTRY,
    spawn: childProcess.spawn,
    ps: (pid) => childProcess.execFileSync("/bin/ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(),
    kill: process.kill.bind(process), portFree: defaultPortFree, health: defaultHealth,
    validateConfig: validateDaemonConfig, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now: () => Date.now(),
    uuid: crypto.randomUUID, startupTimeoutMs: 5000, stopTimeoutMs: 5000, pollMs: 50,
  };
}

/** A fail-closed detached daemon lifecycle controller. All process-sensitive seams are injectable. */
export function createDaemonControl(injected = {}) {
  // Process targets are intentionally not injectable: adapters may simulate the
  // spawn, but production argv can name only these canonical artifacts.
  const d = { ...defaults(), ...injected, node: NODE, entry: ENTRY }, fs = injected.fs || fsNative;
  if (typeof d.spawn !== "function" || typeof d.ps !== "function" || typeof d.kill !== "function" || typeof d.health !== "function") throw new TypeError("spawn, ps, kill, and health adapters are required.");
  const validate = (config) => d.validateConfig(config, d.canonicalSocketPath ? { canonicalSocketPath: d.canonicalSocketPath } : undefined);
  const expectedFor = (config, token) => {
    const c = validate(config), configJson = canonical(c);
    return Object.freeze({ ...c, node: fs.realpathSync(d.node), entry: fs.realpathSync(d.entry), startToken: token, configJson, configDigest: digest(configJson) });
  };
  const acquire = (root) => {
    const file = lockFile(root); privateFile(fs, file, { absent: true });
    fs.writeFileSync(file, `${process.pid}\n`, { flag: "wx", mode: 0o600 }); privateFile(fs, file);
    return file;
  };
  const release = (file) => { try { privateFile(fs, file); fs.unlinkSync(file); } catch { /* Never remove an unproven lock. */ } };
  const status = async (config) => {
    let c;
    try { c = validate(config); } catch (error) { return result("ambiguous", { reason: error.code || "INVALID_CONFIG" }); }
    let root;
    try { root = privateDirectory(fs, c.stateRoot); } catch (error) {
      if (error.code === "STATE_ROOT_ABSENT") { try { await d.portFree(c.host, c.port); return result("stopped", { metadata: false }); } catch { return result("ambiguous", { reason: "LISTENER_WITHOUT_METADATA" }); } }
      return result("ambiguous", { reason: error.code || "UNSAFE_STATE_ROOT" });
    }
    if (!fs.existsSync(metadataFile(root))) {
      try { await d.portFree(c.host, c.port); return result("stopped", { metadata: false }); } catch { return result("ambiguous", { reason: "LISTENER_WITHOUT_METADATA" }); }
    }
    let metadata;
    try { metadata = parseMetadata(fs, root); } catch (error) { return result("ambiguous", { reason: error.code || "INVALID_DAEMON_METADATA" }); }
    const probe = { ...c, stateRoot: root, entry: fs.realpathSync(d.entry), node: fs.realpathSync(d.node), configJson: canonical(c), configDigest: digest(canonical(c)), startToken: metadata.startToken };
    if (!exactMetadata(metadata, probe)) return result("ambiguous", { reason: "METADATA_MISMATCH" });
    let line;
    try { line = d.ps(metadata.pid); } catch { return result("stale", { reason: "PID_NOT_LIVE", pid: metadata.pid }); }
    if (!commandProves(line, probe)) return result("ambiguous", { reason: "PID_IDENTITY_MISMATCH", pid: metadata.pid });
    try { await d.health(probe); } catch { return result("ambiguous", { reason: "HEALTH_MISMATCH", pid: metadata.pid }); }
    return result("running", { pid: metadata.pid, startToken: metadata.startToken });
  };
  return Object.freeze({
    async start(config) {
      const c = validate(config), root = privateDirectory(fs, c.stateRoot, { create: true });
      validateExistingChildren(fs, root);
      const lock = acquire(root);
      let child, expected;
      try {
        privateFile(fs, metadataFile(root), { absent: true });
        const token = d.uuid(); if (!UUID.test(token)) throw fail("UUID generator returned an invalid start token.", "INVALID_START_TOKEN");
        expected = expectedFor({ ...c, stateRoot: root }, token);
        await d.portFree(expected.host, expected.port);
        const currentLog = logFile(root, token); privateFile(fs, currentLog, { absent: true });
        const fd = fs.openSync(currentLog, "wx", 0o600); const stat = fs.fstatSync(fd);
        if (!stat.isFile() || !owned(stat) || !mode(stat, 0o600)) { fs.closeSync(fd); throw fail("Unsafe daemon log.", "UNSAFE_DAEMON_LOG"); }
        child = d.spawn(expected.node, [expected.entry, "serve", "--config-json", expected.configJson, "--start-token", token], { detached: true, stdio: ["ignore", fd, fd] }); fs.closeSync(fd); child.unref?.();
        const deadline = d.now() + d.startupTimeoutMs;
        while (d.now() <= deadline) {
          if (child.exitCode != null || child.signalCode != null) throw fail("Daemon child exited before metadata.", "CHILD_EXITED");
          if (fs.existsSync(metadataFile(root))) {
            const metadata = parseMetadata(fs, root);
            if (!exactMetadata(metadata, { ...expected, pid: child.pid })) throw fail("Daemon metadata does not match child request.", "METADATA_MISMATCH");
            try { await d.health(expected); return result("running", { pid: child.pid, startToken: token, stateRoot: root, logPath: currentLog }); } catch { /* bounded retry */ }
          }
          await d.sleep(d.pollMs);
        }
        throw fail("Daemon startup timed out.", "START_TIMEOUT");
      } catch (error) {
        if (child && expected && child.exitCode == null && child.signalCode == null) { try { if (commandProves(d.ps(child.pid), expected)) d.kill(child.pid, "SIGTERM"); } catch { /* ambiguity deliberately suppresses signaling */ } }
        throw error;
      } finally { release(lock); }
    },
    status,
    async stop(config) {
      const before = await status(config);
      if (before.state === "stopped") return before;
      if (before.state !== "running") return result(before.state, { ...before, refused: true });
      const c = validate(config), root = privateDirectory(fs, c.stateRoot), metadata = parseMetadata(fs, root);
      const expected = { ...c, stateRoot: root, entry: fs.realpathSync(d.entry), node: fs.realpathSync(d.node), configJson: canonical(c), configDigest: digest(canonical(c)), startToken: metadata.startToken };
      // Re-prove immediately before the sole signal; never signal a changed PID.
      let line; try { line = d.ps(metadata.pid); } catch { return result("stale", { reason: "PID_NOT_LIVE", refused: true }); }
      if (!commandProves(line, expected)) return result("ambiguous", { reason: "PID_IDENTITY_MISMATCH", refused: true });
      d.kill(metadata.pid, "SIGTERM");
      const deadline = d.now() + d.stopTimeoutMs;
      while (d.now() <= deadline) {
        const metaGone = !fs.existsSync(metadataFile(root));
        let alive = true; try { d.ps(metadata.pid); } catch { alive = false; }
        let portClosed = false; try { await d.portFree(c.host, c.port); portClosed = true; } catch { /* still listening */ }
        if (!alive && metaGone && portClosed) return result("stopped", { pid: metadata.pid });
        await d.sleep(d.pollMs);
      }
      return result("blocked", { reason: "STOP_TIMEOUT", pid: metadata.pid });
    },
  });
}

async function main(argv) {
  if (!(["start", "status", "stop"].includes(argv[0])) || argv[1] !== "--config-json" || argv.length !== 3) throw fail("Usage: daemon-control.mjs start|status|stop --config-json <json>", "INVALID_ARGUMENTS");
  let config; try { config = JSON.parse(argv[2]); } catch { throw fail("--config-json must contain JSON.", "INVALID_ARGUMENTS"); }
  const value = await createDaemonControl()[argv[0]](config);
  process.stdout.write(`${JSON.stringify(value)}\n`);
  if (value.state === "stale" || value.state === "ambiguous" || value.state === "blocked") process.exitCode = 1;
}
if (process.argv[1] && fsNative.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${JSON.stringify({ error: error.code || "DAEMON_CONTROL_FAILED", message: error.message })}\n`); process.exitCode = 1; });
