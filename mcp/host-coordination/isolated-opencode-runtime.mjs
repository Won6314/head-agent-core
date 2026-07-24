import childProcess from "node:child_process";
import crypto from "node:crypto";
import fsNative from "node:fs";
import path from "node:path";
import { RuntimeContextError } from "../agent-task/runtime-context.mjs";

const ENV = "/usr/bin/env";
const PLUGIN_NAME = "herdr-agent-state.js";
const PLUGIN_HASH = "2c1a0fd9a50728b62618a2a817f42dcb89762f46fccfed07c036fd90c9bad894";
const SESSION = /^ses_[A-Za-z0-9_-]+$/;
const fail = (code, message) => { throw new RuntimeContextError(code, message); };
const owned = (stat) => typeof process.getuid !== "function" || stat.uid === process.getuid();
const inside = (root, candidate) => candidate === root || candidate.startsWith(`${root}${path.sep}`);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const clean = (value) => typeof value === "string" && value.length > 0 && !/[\0\r\n]/.test(value);
const BUILD_PROMPT = "Return exactly the requested non-secret marker. Do not inspect files, invoke tools, access networks, or use external context.";
// This is deliberately the resolved debug-config schema, not the source-file
// schema.  OpenCode may add only these benign resolved defaults to the locked
// plugin-only build configuration below.  A new key is a review event, not an
// implicit capability grant.
const RESOLVED_CONFIG_KEYS = Object.freeze(["$schema", "agent", "autoupdate", "default_agent", "enabled_providers", "instructions", "mcp", "permission", "plugin", "provider", "share", "snapshot", "tools"]);
const BUILD_KEYS = Object.freeze(["permission", "prompt", "tools"]);

export const isolatedOpenCodeConfig = Object.freeze({
  $schema: "https://opencode.ai/config.json",
  autoupdate: false,
  share: "disabled",
  snapshot: false,
  mcp: Object.freeze({}),
  provider: Object.freeze({ openai: Object.freeze({}) }),
  enabled_providers: Object.freeze(["openai"]),
  default_agent: "build",
  agent: Object.freeze({ build: Object.freeze({ prompt: BUILD_PROMPT, tools: Object.freeze({ "*": false }), permission: Object.freeze({ "*": "deny" }) }) }),
  tools: Object.freeze({ "*": false }),
  permission: Object.freeze({ "*": "deny" }),
  instructions: Object.freeze([]),
});

function direct(fs, target, { type, mode, executable = false, ownerOrRoot = false, singleLink = true } = {}) {
  if (!path.isAbsolute(target)) fail("UNSAFE_ISOLATED_PATH", "An absolute direct path is required.");
  let stat; try { stat = fs.lstatSync(target); } catch { fail("UNSAFE_ISOLATED_PATH", "A required direct path is absent."); }
  const ownerOk = ownerOrRoot ? (typeof process.getuid !== "function" || [process.getuid(), 0].includes(stat.uid)) : owned(stat);
  // Package managers may hard-link a root-owned installed executable.  This
  // exception is deliberately unavailable to mutable/source files: allowing a
  // current-user multi-link there would weaken their single-name trust boundary.
  const unsafeHardlink = type === "file" && (singleLink ? stat.nlink !== 1 : (stat.nlink < 1 || (stat.nlink > 1 && stat.uid !== 0)));
  if (stat.isSymbolicLink() || !ownerOk || (type === "file" && (!stat.isFile() || unsafeHardlink)) || (type === "directory" && !stat.isDirectory()) || (mode != null && (stat.mode & 0o777) !== mode) || (executable && !(stat.mode & 0o111))) fail("UNSAFE_ISOLATED_PATH", "A required path has unsafe type, ownership, links, or mode.");
  return target;
}

function noSymlinkAncestors(fs, target) { let current = path.parse(path.resolve(target)).root; for (const part of path.relative(current, path.resolve(target)).split(path.sep).filter(Boolean)) { current = path.join(current, part); if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail("UNSAFE_ISOLATED_PATH", "Isolated paths may not traverse symlink ancestors."); } }

function canonicalUnder(fs, root, target) {
  const canonicalRoot = fs.realpathSync(root), canonical = fs.realpathSync(target);
  if (!inside(canonicalRoot, canonical)) fail("ISOLATION_ESCAPE", "An isolated runtime path escaped its root.");
  return canonical;
}

function mkdirDirect(fs, target) {
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  fs.chmodSync(target, 0o700);
  return direct(fs, target, { type: "directory", mode: 0o700 });
}

function exactObject(value) { return value && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function exactKeysObject(value, keys) { return exactObject(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"); }
function canonicalExport(value) { const normalize = (node) => Array.isArray(node) ? node.map(normalize) : exactObject(node) ? Object.fromEntries(Object.keys(node).sort().map((key) => [key, normalize(node[key])])) : node; return JSON.stringify(normalize(value)); }

/** Fail closed over the parsed result of `opencode debug paths`. */
export function validateIsolatedDebugPaths(value, runtimeRoot) {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { const parsed = {}; for (const line of value.trim().split(/\r?\n/)) { const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s+(\/\S+)\s*$/); if (match) parsed[match[1]] = match[2]; } value = parsed; } }
  if (!exactObject(value)) fail("INVALID_OPENCODE_PATHS", "OpenCode paths output must be an object.");
  const leaves = [];
  const visit = (candidate) => { if (typeof candidate === "string" && path.isAbsolute(candidate)) leaves.push(path.resolve(candidate)); else if (Array.isArray(candidate)) candidate.forEach(visit); else if (exactObject(candidate)) Object.values(candidate).forEach(visit); };
  visit(value);
  if (!leaves.length || leaves.some((candidate) => !inside(path.resolve(runtimeRoot), candidate))) fail("OPENCODE_PATH_ESCAPE", "OpenCode resolved a path outside the isolated runtime.");
  return Object.freeze([...leaves].sort());
}

/** Fail closed over parsed effective `opencode debug config`; raw config is not proof. */
export function validateEffectiveOpenCodeConfig(value, { configRoot, pluginPath } = {}) {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { fail("INVALID_OPENCODE_CONFIG", "Effective OpenCode config is not JSON."); } }
  if (!exactObject(value)) fail("INVALID_OPENCODE_CONFIG", "Effective OpenCode config must be an object.");
  if (!exactKeysObject(value, RESOLVED_CONFIG_KEYS) || Object.hasOwn(value, "permissions") || Object.hasOwn(value, "providers") || Object.hasOwn(value, "plugins")) fail("UNSAFE_EFFECTIVE_CONFIG", "Effective config has an unsupported, alternate, or execution-bearing surface.");
  const mcp = value.mcp, permissions = value.permission, tools = value.tools, providers = value.provider, build = value.agent?.build;
  const wildcardDeny = (candidate, expected) => exactKeysObject(candidate, ["*"]) && candidate["*"] === expected;
  if (!exactObject(mcp) || Object.keys(mcp).length || !wildcardDeny(permissions, "deny") || !wildcardDeny(tools, false) || !exactKeysObject(providers, ["openai"]) || !exactObject(providers.openai) || Object.keys(providers.openai).length) fail("UNSAFE_EFFECTIVE_CONFIG", "Effective MCP, permission, tool, or provider policy is unsafe.");
  if (!Array.isArray(value.enabled_providers) || value.enabled_providers.length !== 1 || value.enabled_providers[0] !== "openai" || value.default_agent !== "build" || !Array.isArray(value.instructions) || value.instructions.length !== 0 || !exactKeysObject(value.agent, ["build"]) || !exactKeysObject(build, BUILD_KEYS) || build.prompt !== BUILD_PROMPT || !wildcardDeny(build.permission, "deny") || !wildcardDeny(build.tools, false)) fail("UNSAFE_EFFECTIVE_CONFIG", "Effective provider allowlist, instructions, or build-agent policy is unsafe.");
  if (![false, "disabled"].includes(value.share) || value.snapshot !== false || value.autoupdate !== false) fail("UNSAFE_EFFECTIVE_CONFIG", "Effective share, snapshot, or autoupdate policy is unsafe.");
  const plugins = value.plugin ?? value.plugins ?? [];
  if (!Array.isArray(plugins) || (pluginPath && (plugins.length !== 1 || ![pluginPath, `file://${pluginPath}`].includes(plugins[0]))) || (!pluginPath && plugins.length)) fail("UNEXPECTED_OPENCODE_PLUGIN", "Effective config does not contain exactly the pinned plugin.");
  const paths = [];
  const visit = (candidate, key = "") => { if (typeof candidate === "string" && /(?:path|config|plugin|directory|dir)$/i.test(key) && path.isAbsolute(candidate)) paths.push(path.resolve(candidate)); else if (Array.isArray(candidate)) candidate.forEach((x) => visit(x, key)); else if (exactObject(candidate)) Object.entries(candidate).forEach(([k, v]) => visit(v, k)); };
  visit(value);
  if (configRoot && paths.some((candidate) => !inside(path.resolve(configRoot), candidate) && candidate !== path.resolve(pluginPath))) fail("UNEXPECTED_OPENCODE_CONFIG_PATH", "Effective config referenced an unexpected path.");
  return true;
}

function parseJsonOutput(text, code) {
  const source = String(text || "").trim();
  try { return JSON.parse(source); } catch {}
  for (const line of source.split(/\r?\n/).reverse()) { try { return JSON.parse(line); } catch {} }
  fail(code, "OpenCode returned no parseable JSON evidence.");
}

function selectedOpenAIAuth(bytes) {
  let parsed;
  try { parsed = JSON.parse(bytes); } catch { fail("INVALID_AUTH_SOURCE", "Auth source is invalid JSON."); }
  const auth = parsed?.openai, authKeys = ["access", "accountId", "expires", "refresh", "type"];
  if (!exactObject(parsed) || !exactKeysObject(auth, authKeys) || auth.type !== "oauth" || ![auth.access, auth.accountId, auth.refresh].every(clean) || !Number.isFinite(auth.expires)) fail("INVALID_AUTH_SOURCE", "Auth source has no exact current OpenAI OAuth record.");
  return { openai: parsed.openai };
}

/** Read-only production input gate; it creates no isolated state. */
export function validateIsolatedOpenCodeInputs({ opencodeBinary, pluginSource, authSource, fs = fsNative, envBinary = ENV } = {}) {
  if (![opencodeBinary, pluginSource, authSource].every((x) => typeof x === "string" && path.isAbsolute(x))) fail("INVALID_ISOLATED_RUNTIME", "Explicit absolute OpenCode, plugin, and auth paths are required.");
  for (const target of [opencodeBinary, pluginSource, authSource, envBinary]) noSymlinkAncestors(fs, target);
  direct(fs, envBinary, { type: "file", executable: true, ownerOrRoot: true });
  direct(fs, opencodeBinary, { type: "file", executable: true, ownerOrRoot: true, singleLink: false });
  direct(fs, pluginSource, { type: "file", mode: 0o644 });
  direct(fs, authSource, { type: "file", mode: 0o600 });
  // Parse only to prove the selected OpenAI record is structurally exact. No
  // result exposes or copies credential bytes at this pre-mutation boundary.
  selectedOpenAIAuth(fs.readFileSync(authSource));
  const bytes = fs.readFileSync(pluginSource);
  if (sha(bytes) !== PLUGIN_HASH || !/(?:version\s*[:=]?\s*9|\bv9\b)/i.test(bytes.toString("utf8", 0, Math.min(bytes.length, 4096)))) fail("INVALID_HERDR_PLUGIN", "Herdr OpenCode plugin version/hash is not pinned.");
  return Object.freeze({ opencodeBinary, pluginSource, authSource });
}

/** Owner-private HOME/XDG runtime and an `/usr/bin/env -i` launcher resolver. */
export function createIsolatedOpenCodeRuntime({ stateRoot, opencodeBinary, pluginSource, authSource, fs = fsNative, execFileSync = childProcess.execFileSync, envBinary = ENV, testPluginPin } = {}) {
  if (![stateRoot, opencodeBinary, pluginSource].every((x) => typeof x === "string" && path.isAbsolute(x))) fail("INVALID_ISOLATED_RUNTIME", "Explicit absolute state, OpenCode, and plugin paths are required.");
  for (const target of [stateRoot, opencodeBinary, pluginSource, envBinary, ...(authSource ? [authSource] : [])]) noSymlinkAncestors(fs, target);
  direct(fs, envBinary, { type: "file", executable: true, ownerOrRoot: true });
  direct(fs, opencodeBinary, { type: "file", executable: true, ownerOrRoot: true, singleLink: false });
  const state = direct(fs, stateRoot, { type: "directory", mode: 0o700 });
  const runtimeRoot = path.join(state, "runtime"), home = path.join(runtimeRoot, "home"), configHome = path.join(runtimeRoot, "config"), dataHome = path.join(runtimeRoot, "data"), cacheHome = path.join(runtimeRoot, "cache"), stateHome = path.join(runtimeRoot, "state"), tmpdir = path.join(runtimeRoot, "tmp");
  const opencodeConfigRoot = path.join(configHome, "opencode"), pluginDir = path.join(opencodeConfigRoot, "plugins"), pluginPath = path.join(pluginDir, PLUGIN_NAME), authPath = path.join(dataHome, "opencode", "auth.json");
  let prepared = false, authSourceDigest = null, pluginSourceDigest = null, pluginSourceMode = null;
  const baseAssignments = () => {
    if (!prepared) fail("ISOLATED_RUNTIME_UNPREPARED", "The isolated runtime must be prepared first.");
    const values = {
      HOME: home, XDG_CONFIG_HOME: configHome, XDG_DATA_HOME: dataHome, XDG_CACHE_HOME: cacheHome, XDG_STATE_HOME: stateHome, TMPDIR: tmpdir,
      PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
      OPENCODE_DISABLE_DEFAULT_PLUGINS: "true", OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_LSP_DOWNLOAD: "true", OPENCODE_DISABLE_MODELS_FETCH: "true", OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "true", OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: "true", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "true",
      OPENCODE_CONFIG_DIR: opencodeConfigRoot, OPENCODE_CONFIG_CONTENT: JSON.stringify(isolatedOpenCodeConfig),
    };
    const seen = new Set(), result = [];
    for (const key of Object.keys(values).sort()) { const value = values[key]; if (!/^[A-Z][A-Z0-9_]*$/.test(key) || seen.has(key) || !clean(value)) fail("INVALID_ISOLATED_ENV", "Isolated environment assignments are not canonical."); seen.add(key); result.push(`${key}=${value}`); }
    return Object.freeze(result);
  };
  const controllerAssignments = () => baseAssignments();
  const launchAssignments = (rootPane) => {
    const tuple = { HERDR_ENV: "1", HERDR_SOCKET_PATH: rootPane?.socket, HERDR_PANE_ID: rootPane?.paneId };
    if (!clean(tuple.HERDR_SOCKET_PATH) || !clean(tuple.HERDR_PANE_ID)) fail("INVALID_HERDR_TUPLE", "An exact trusted Herdr socket/pane tuple is required.");
    return Object.freeze([...baseAssignments(), ...Object.keys(tuple).sort().map((key) => `${key}=${tuple[key]}`)].sort());
  };
  const recheckSources = () => {
    if (pluginSourceDigest !== null) { direct(fs, pluginSource, { type: "file", mode: pluginSourceMode }); const stat = fs.lstatSync(pluginSource); if (sha(fs.readFileSync(pluginSource)) !== pluginSourceDigest || (stat.mode & 0o777) !== pluginSourceMode) fail("PLUGIN_SOURCE_CHANGED", "Pinned plugin source changed during isolated work."); }
    if (authSourceDigest !== null) { direct(fs, authSource, { type: "file", mode: 0o600 }); if (sha(fs.readFileSync(authSource)) !== authSourceDigest) fail("AUTH_SOURCE_CHANGED", "Auth source changed during isolated work."); }
  };
  const runController = (argv, { pure = false } = {}) => execFileSync(envBinary, ["-i", ...controllerAssignments(), opencodeBinary, ...(pure ? ["--pure"] : []), ...argv], { encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  return Object.freeze({
    paths: Object.freeze({ runtimeRoot, home, configHome, dataHome, cacheHome, stateHome, tmpdir, opencodeConfigRoot, pluginPath, authPath }),
    prepare() {
      for (const dir of [runtimeRoot, home, configHome, dataHome, cacheHome, stateHome, tmpdir, opencodeConfigRoot, pluginDir]) mkdirDirect(fs, dir);
      for (const dir of [runtimeRoot, home, configHome, dataHome, cacheHome, stateHome, tmpdir, opencodeConfigRoot, pluginDir]) canonicalUnder(fs, runtimeRoot, dir);
      const source = direct(fs, pluginSource, { type: "file", mode: 0o644 }); const bytes = fs.readFileSync(source), pin = testPluginPin || { hash: PLUGIN_HASH, version: 9 }; pluginSourceDigest = sha(bytes); pluginSourceMode = 0o644;
      if (testPluginPin && (!exactObject(testPluginPin) || Object.keys(testPluginPin).sort().join() !== "hash,version" || !/^[0-9a-f]{64}$/.test(testPluginPin.hash) || testPluginPin.version !== 9)) fail("INVALID_TEST_PIN", "Synthetic plugin pins are test-only and exact.");
      if (sha(bytes) !== pin.hash || !new RegExp(`(?:version\\s*[:=]?\\s*${pin.version}|\\bv${pin.version}\\b)`, "i").test(bytes.toString("utf8", 0, Math.min(bytes.length, 4096)))) fail("INVALID_HERDR_PLUGIN", "Herdr OpenCode plugin version/hash is not pinned.");
      if (fs.readdirSync(pluginDir).some((name) => name !== PLUGIN_NAME)) fail("UNEXPECTED_OPENCODE_PLUGIN", "Isolated plugin directory is not empty/exact.");
      if (!fs.existsSync(pluginPath)) fs.writeFileSync(pluginPath, bytes, { mode: 0o600, flag: "wx" });
      direct(fs, pluginPath, { type: "file", mode: 0o600 }); if (sha(fs.readFileSync(pluginPath)) !== pin.hash) fail("INVALID_HERDR_PLUGIN", "Staged Herdr plugin differs from its pin.");
      prepared = true; return this.paths;
    },
    assignments: launchAssignments,
    launchAssignments,
    controllerAssignments,
    resolveEnvironment({ rootPane } = {}) { return Object.freeze({ executable: envBinary, prefixArgs: Object.freeze(["-i", ...launchAssignments(rootPane)]), binary: opencodeBinary }); },
    probePaths() { const result = validateIsolatedDebugPaths(runController(["debug", "paths"], { pure: true }), runtimeRoot); recheckSources(); return result; },
    validateConfig() { const result = validateEffectiveOpenCodeConfig(parseJsonOutput(runController(["debug", "config"]), "INVALID_OPENCODE_CONFIG"), { configRoot: runtimeRoot, pluginPath }); recheckSources(); return result; },
    stageCredential() {
      if (!authSource) fail("AUTH_SOURCE_REQUIRED", "An explicit auth source is required.");
      const source = direct(fs, authSource, { type: "file", mode: 0o600 }), before = fs.readFileSync(source), selected = selectedOpenAIAuth(before); mkdirDirect(fs, path.dirname(authPath));
      if (fs.existsSync(authPath)) { direct(fs, authPath, { type: "file", mode: 0o600 }); let existing; try { existing = JSON.parse(fs.readFileSync(authPath, "utf8")); } catch { fail("ISOLATED_AUTH_PRESENT", "Existing isolated auth is invalid."); } if (JSON.stringify(existing) !== JSON.stringify(selected)) fail("ISOLATED_AUTH_PRESENT", "Existing isolated auth differs from the selected record."); }
      else fs.writeFileSync(authPath, `${JSON.stringify(selected)}\n`, { mode: 0o600, flag: "wx" }); direct(fs, authPath, { type: "file", mode: 0o600 });
      authSourceDigest = sha(before); if (!fs.readFileSync(source).equals(before)) fail("AUTH_SOURCE_CHANGED", "Auth source bytes changed during staging."); recheckSources();
      return Object.freeze({ staged: true });
    },
    removeCredential() { if (fs.existsSync(authPath)) { direct(fs, authPath, { type: "file", mode: 0o600 }); fs.unlinkSync(authPath); } if (fs.existsSync(authPath)) fail("AUTH_REMOVE_FAILED", "Isolated auth remains."); recheckSources(); return true; },
    exportExactAssistant(_rootPane, sessionId, marker) {
      if (!SESSION.test(sessionId || "") || !clean(marker)) fail("INVALID_EXPORT_REQUEST", "Exact session and marker are required.");
      const value = parseJsonOutput(runController(["export", sessionId]), "INVALID_OPENCODE_EXPORT"), texts = [];
      const visit = (node) => { if (Array.isArray(node)) node.forEach(visit); else if (exactObject(node)) { if (node.role === "assistant" || node.info?.role === "assistant") { if (typeof node.text === "string") texts.push(node.text); if (typeof node.content === "string") texts.push(node.content); for (const part of [...(Array.isArray(node.parts) ? node.parts : []), ...(Array.isArray(node.content) ? node.content : [])]) if (part?.type === "text" && typeof part.text === "string") texts.push(part.text); } Object.values(node).forEach(visit); } };
      visit(value); if (!texts.some((text) => text === marker)) fail("MARKER_EXPORT_MISMATCH", "Export has no exact assistant marker."); recheckSources(); return sha(canonicalExport(value));
    },
  });
}

export const isolatedRuntimePins = Object.freeze({ envBinary: ENV, pluginName: PLUGIN_NAME, pluginHash: PLUGIN_HASH });
