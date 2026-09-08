import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHostDaemon } from "./composition.mjs";
import { createRealHerdrCliAdapter } from "./real-herdr-cli-adapter.mjs";
import { createProjectPolicyAdapters } from "./policy-adapters.mjs";
import { createOnePaneWorkerLauncher, resolveDefaultOpenCodeBinary } from "./worker-launcher.mjs";
import { RuntimeContextError } from "../agent-task/runtime-context.mjs";
import { createOpenCodeSessionManager } from "../agent-task/opencode-sessions.mjs";
import { armHeadMigration } from "../agent-task/head-migration.mjs";

const ENTRY = fs.realpathSync(fileURLToPath(import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message) => { throw new Error(message); };
const owned = (stat) => typeof process.getuid !== "function" || stat.uid === process.getuid();

function noSymlinkAncestors(target) {
  let current = path.parse(target).root;
  for (const part of path.relative(current, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail("Daemon paths may not have symlink ancestors.");
  }
}

function ensurePrivateStateRoot(stateRoot) {
  let existing = stateRoot;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  stateRoot = path.join(fs.realpathSync(existing), path.relative(existing, stateRoot));
  noSymlinkAncestors(path.dirname(stateRoot));
  if (!fs.existsSync(stateRoot)) fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(stateRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !owned(stat) || (stat.mode & 0o777) !== 0o700) fail("State root must be an owned private non-symlink directory.");
  noSymlinkAncestors(stateRoot);
  return fs.realpathSync(stateRoot);
}

function safeMetadataDestination(root) {
  const file = path.join(root, "daemon.json");
  noSymlinkAncestors(root);
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || !owned(stat) || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1) fail("Unsafe daemon metadata destination.");
    let prior;
    try { prior = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail("Existing daemon metadata is malformed."); }
    if (!Number.isSafeInteger(prior?.pid) || prior.pid <= 0) fail("Existing daemon metadata has no valid owner.");
    let live = false;
    try { process.kill(prior.pid, 0); live = true; }
    catch (error) { if (error?.code !== "ESRCH") fail("Existing daemon metadata owner could not be verified."); }
    if (live) fail("Existing daemon metadata belongs to a live process.");
    fs.unlinkSync(file);
  }
  return file;
}

function writePrivateMetadata(root, metadata) {
  const destination = safeMetadataDestination(root);
  const temporary = path.join(root, `.daemon-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(metadata)}\n`, { mode: 0o600, flag: "wx" });
  const stat = fs.lstatSync(temporary);
  if (!stat.isFile() || stat.isSymbolicLink() || !owned(stat) || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) fail("Unsafe daemon metadata temporary file.");
  safeMetadataDestination(root);
  noSymlinkAncestors(root);
  fs.renameSync(temporary, destination);
  return destination;
}

function removeOwnedMetadata(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isFile() && !stat.isSymbolicLink() && owned(stat) && (stat.mode & 0o777) === 0o600) fs.unlinkSync(file);
  } catch { /* Nothing owned to clean up. */ }
}

export function validateDaemonConfig({ stateRoot, socketPath, herdrBinary, host, port } = {}) {
  if (typeof stateRoot !== "string" || !path.isAbsolute(stateRoot) || typeof socketPath !== "string" || !path.isAbsolute(socketPath) || typeof herdrBinary !== "string" || !path.isAbsolute(herdrBinary) || host !== "127.0.0.1" || !Number.isInteger(port) || port < 1024 || port > 65535) {
    fail("Daemon requires configured absolute state, Herdr executable/socket roots, loopback host, and an unprivileged port.");
  }
  let socket;
  try { socket = fs.realpathSync(socketPath); } catch { fail("Canonical Herdr socket is unavailable."); }
  if (fs.lstatSync(socketPath).isSymbolicLink()) fail("Daemon socket must be a configured direct Herdr socket.");
  return Object.freeze({ stateRoot: path.resolve(stateRoot), socketPath: socket, herdrBinary: fs.realpathSync(herdrBinary), host, port });
}

export async function assertPortFree(host, port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer().once("error", () => reject(new Error("Port is occupied."))).once("listening", () => probe.close(resolve)).listen(port, host);
  });
}

/** Foreground-only production composition. It never detaches or creates a workspace. */
export async function serveShadow(config, deps = {}) {
  const startToken = deps.startToken;
  if (!UUID.test(startToken || "")) fail("A UUID start token is required.");
  const c = validateDaemonConfig(config);
  const stateRoot = ensurePrivateStateRoot(c.stateRoot);
  safeMetadataDestination(stateRoot);
  await assertPortFree(c.host, c.port);
  const herdr = deps.herdr || createRealHerdrCliAdapter({ socketPath: c.socketPath, herdrPath: c.herdrBinary });
  const policy = deps.policy || createProjectPolicyAdapters();
  const launcher = deps.launcher || createOnePaneWorkerLauncher({ runtime: herdr, resolveOpenCodeBinary: deps.resolveOpenCodeBinary || (() => resolveDefaultOpenCodeBinary({ executable: deps.opencodeBinary || config.opencodeBinary })) });
  const sessions = deps.sessions || createOpenCodeSessionManager({ runtime: herdr });
  const migrate = deps.migrate || ((input) => armHeadMigration({ ...input, herdrPath: c.herdrBinary, socketPath: c.socketPath }));
  const preflightExecution = deps.preflightExecution || (({ execution }) => { if (execution.runtime === "claude") throw new RuntimeContextError("UNSUPPORTED_CLAUDE_EVIDENCE", "Claude launch is disabled until exact session evidence exists."); });
  const daemon = createHostDaemon({ hostStateRoot: stateRoot, herdr, launcher, sessions, migrate, ...policy, preflightExecution, verifyTarget: deps.verifyTarget || unavailableTargetVerifier, nativeDeliver: deps.nativeDeliver || unavailableNativeDeliver, terminalDeliver: deps.terminalDeliver || unavailableTerminalDeliver });
  const server = daemon.createServer();
  try {
    await new Promise((resolve, reject) => server.once("error", reject).listen(c.port, c.host, resolve));
  } catch (error) {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    throw error;
  }
  const metadata = Object.freeze({ schema: 1, pid: process.pid, entry: ENTRY, startToken, configDigest: crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex"), host: c.host, port: c.port, socketPath: c.socketPath, stateRoot, processStartedAt: new Date().toISOString() });
  let metadataFile;
  try { metadataFile = writePrivateMetadata(stateRoot, metadata); } catch (error) {
    await new Promise((resolve) => server.close(resolve));
    throw error;
  }
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await new Promise((resolve) => server.close(resolve));
    removeOwnedMetadata(metadataFile);
  };
  const onSignal = () => { stop().then(() => process.exitCode = 0); };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  return Object.freeze({ daemon, server, metadata, stop });
}

export const defaultOpenCodeBinary = resolveDefaultOpenCodeBinary;
export const unavailableTargetVerifier = () => { throw new RuntimeContextError("TARGET_VERIFICATION_UNAVAILABLE", "Native target verification is unavailable."); };
export const unavailableNativeDeliver = async () => "unavailable";
export const unavailableTerminalDeliver = async () => false;

function parseCli(argv) {
  if (argv[0] !== "serve" || argv[1] !== "--config-json" || argv[3] !== "--start-token" || argv.length !== 5) fail("Usage: daemon-entry.mjs serve --config-json <json> --start-token <uuid>");
  let config;
  try { config = JSON.parse(argv[2]); } catch { fail("--config-json must contain JSON."); }
  return { config, startToken: argv[4] };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === ENTRY) {
  const { config, startToken } = parseCli(process.argv.slice(2));
  serveShadow(config, { startToken }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
