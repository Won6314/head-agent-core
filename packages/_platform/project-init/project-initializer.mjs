import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHostAdmin } from "../coordination/mcp/host-coordination/admin.mjs";

const roles = ["head", "developer", "coder", "reviewer"];
const managedFiles = [
  ".claude/head-runtime.json",
  ".claude/head-project.json",
  ".claude/agents/head/opencode.json",
  ".claude/agents/developer/opencode.json",
  ".claude/agents/coder/opencode.json",
  ".claude/agents/reviewer/opencode.json",
  "scripts/resume-session.sh",
];
const projectIdPattern = /^[a-z][a-z0-9-]{0,63}$/;
const exists = (file) => { try { fs.lstatSync(file); return true; } catch { return false; } };
const fail = (message) => { throw new Error(message); };
const locations = (env) => { const home = env.HOME || os.homedir(); return { data: env.XDG_DATA_HOME || path.join(home, ".local", "share"), config: env.XDG_CONFIG_HOME || path.join(home, ".config") }; };
const canonical = (file) => fs.realpathSync(file);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function assertDirectExisting(candidate, kind = "directory") {
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink() || (kind === "directory" ? !stat.isDirectory() : !stat.isFile())) fail(`${candidate} must be a direct regular ${kind}.`);
}
function assertSafeAncestors(candidate) {
  const parsed = path.parse(candidate); let current = parsed.root;
  for (const part of candidate.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!exists(current)) return;
    if (fs.lstatSync(current).isSymbolicLink()) fail(`${current} must not be a symlink.`);
  }
}
function projectIdFor(target, supplied) {
  const value = supplied || path.basename(target).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!projectIdPattern.test(value)) fail("Project ID must be lowercase alphanumeric hyphen syntax and begin with a letter.");
  return value;
}
function health(endpoint, expected) {
  const script = `fetch(process.argv[1],{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'health'})}).then(async r=>{const b=await r.json();process.exit(r.ok&&b.result?.endpoint===process.argv[2]?0:1)}).catch(()=>process.exit(1))`;
  childProcess.execFileSync(process.execPath, ["-e", script, endpoint, expected], { stdio: "ignore", timeout: 1_000 });
}
/** Read and validate the installed host authority without changing it. */
export function readInstalledHost(env = process.env) {
  const where = locations(env);
  const hostFile = env.HEAD_HOST_CONFIG || path.join(where.config, "head", "host.json");
  assertSafeAncestors(hostFile); assertDirectExisting(hostFile, "file");
  const host = JSON.parse(fs.readFileSync(hostFile, "utf8"));
  if (!host || host.schemaVersion !== 1 || typeof host.releaseRoot !== "string" || typeof host.stateRoot !== "string" || typeof host.endpoint !== "string") fail("Installed host configuration is incompatible.");
  const current = path.join(where.data, "head", "current");
  assertSafeAncestors(path.dirname(current));
  if (!exists(current) || !fs.lstatSync(current).isSymbolicLink() || canonical(current) !== canonical(host.releaseRoot)) fail("Installed stable current does not resolve to the configured immutable release.");
  health(`${host.endpoint}/agent-task`, "task"); health(`${host.endpoint}/agent-comm`, "comm");
  return { host, current };
}
function config(coreRoot, target, role) {
  const absolute = (...parts) => path.join(...parts);
  const mcp = (name) => ({ type: "local", command: [process.execPath, absolute(coreRoot, "packages", "_platform", "project-init", "head.mjs"), name] });
  if (role === "head") return {
    instructions: [absolute(coreRoot, "packages/core/head/HEAD_CORE.md"), absolute(target, ".claude/agents/head/CLAUDE.md"), absolute(target, ".claude/agents/head/HEAD_CONTEXT.md")],
    skills: { paths: [absolute(coreRoot, "packages/skills"), absolute(target, ".claude/skills")] },
    plugin: [absolute(coreRoot, "packages/opencode-runtime/runtime/opencode/plugins/head-core-first.mjs"), absolute(coreRoot, "packages/opencode-runtime/runtime/opencode/save-opencode-session-id.js"), absolute(coreRoot, "packages/opencode-runtime/runtime/opencode/plugins/head-session.mjs"), absolute(coreRoot, "packages/opencode-runtime/runtime/opencode/plugins/compact-recovery.mjs")],
    mcp: { "agent-task": mcp("agent-task"), "agent-comm": mcp("agent-comm") },
  };
  const core = { developer: "DEVELOPER_CORE.md", coder: "CODER_CORE.md", reviewer: "REVIEWER_CORE.md" }[role];
  return { instructions: [absolute(coreRoot, "packages/agents", role, core), absolute(target, ".claude/agents", role, "CLAUDE.md"), absolute(target, ".claude/agents", role, "EXPERTISE.md")], mcp: { "agent-comm": mcp("agent-comm") } };
}
function seed(relative) {
  if (relative === "CLAUDE.md") return "# Project instructions\n\nOnboarding will define project identity, repository boundaries, and project-wide constraints.\n";
  if (relative.endsWith("HEAD_CONTEXT.md")) return "# Canonical project sources\n\nOnboarding will index the canonical project sources.\n";
  if (relative.endsWith("EXPERTISE.md")) return "";
  return "# Role instructions\n\nOnboarding will define this role's project-specific constraints.\n";
}
function expected(target, projectId, coreRoot) {
  const files = new Map();
  files.set(".claude/head-runtime.json", json({ version: 1, projectId }));
  files.set(".claude/head-project.json", json({ version: 1, profile: "file-only-generic", projectId, coreRoot, managedFiles }));
  for (const role of roles) files.set(`.claude/agents/${role}/opencode.json`, json(config(coreRoot, target, role)));
  files.set("scripts/resume-session.sh", `#!/bin/sh\nHEAD_PROJECT_ROOT=${JSON.stringify(target)} exec ${JSON.stringify(path.join(coreRoot, "packages/_platform/project-init/resume-session.sh"))} "$@"\n`);
  return files;
}
function preflight(target, projectId, coreRoot, admin) {
  assertSafeAncestors(target);
  const parent = path.dirname(target);
  assertDirectExisting(parent);
  if (exists(target)) assertDirectExisting(target);
  const files = expected(target, projectId, coreRoot);
  const manifest = path.join(target, ".claude/head-project.json");
  const hasManifest = exists(manifest);
  if (hasManifest) { assertDirectExisting(manifest, "file"); }
  const projectSkills = path.join(target, ".claude/skills");
  if (exists(projectSkills)) assertDirectExisting(projectSkills);
  for (const [relative, content] of files) {
    const file = path.join(target, relative); assertSafeAncestors(file);
    if (!exists(file)) continue;
    assertDirectExisting(file, "file");
    if (!hasManifest || fs.readFileSync(file, "utf8") !== content) fail(`Managed file collision: ${relative}.`);
  }
  for (const relative of ["CLAUDE.md", ".claude/agents/head/CLAUDE.md", ".claude/agents/head/HEAD_CONTEXT.md", ...roles.filter((role) => role !== "head").flatMap((role) => [`.claude/agents/${role}/CLAUDE.md`, `.claude/agents/${role}/EXPERTISE.md`])]) {
    const file = path.join(target, relative); assertSafeAncestors(file); if (exists(file)) assertDirectExisting(file, "file");
  }
  for (const registration of admin.inspect()) if ((registration.projectId === projectId || registration.projectRoot === target) && (registration.projectId !== projectId || registration.projectRoot !== target)) fail("Project ID or canonical root is already registered to another project.");
  return files;
}
function publish(file, content, created, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${crypto.randomUUID()}`; fs.writeFileSync(temp, content, { mode, flag: "wx" }); fs.renameSync(temp, file); created.push(file);
}
function rollback(created, directories) {
  for (const file of created.reverse()) { try { fs.unlinkSync(file); } catch {} }
  for (const directory of directories.reverse()) { try { fs.rmdirSync(directory); } catch {} }
}
function within(candidate, root) { const relative = path.relative(canonical(root), canonical(candidate)); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".."); }
function verifyReference(reference, root, kind) {
  assertDirectExisting(reference, kind);
  if (!within(reference, root)) fail(`Generated reference escapes its managed root: ${reference}.`);
}
function verifyConfig(role, file, target, coreRoot) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail(`Generated config is invalid JSON: ${role}.`); }
  const expectedConfig = config(coreRoot, target, role);
  if (JSON.stringify(parsed) !== JSON.stringify(expectedConfig)) fail(`Generated config verification failed: ${role}.`);
  for (const instruction of parsed.instructions || []) verifyReference(instruction, instruction.startsWith(coreRoot) ? coreRoot : target, "file");
  for (const skillRoot of parsed.skills?.paths || []) verifyReference(skillRoot, skillRoot.startsWith(coreRoot) ? coreRoot : target, "directory");
  for (const plugin of parsed.plugin || []) {
    verifyReference(plugin, coreRoot, "file");
    childProcess.execFileSync(process.execPath, ["--input-type=module", "--eval", "import(process.argv[1])", plugin], { stdio: "ignore" });
  }
  const expectedMcp = expectedConfig.mcp || {};
  if (JSON.stringify(parsed.mcp || {}) !== JSON.stringify(expectedMcp)) fail(`Generated MCP verification failed: ${role}.`);
  for (const [action, definition] of Object.entries(parsed.mcp || {})) {
    if (!Array.isArray(definition.command) || definition.type !== "local" || definition.command.length !== 3 || definition.command[0] !== process.execPath || definition.command[1] !== path.join(coreRoot, "packages", "_platform", "project-init", "head.mjs") || definition.command[2] !== action || !["agent-task", "agent-comm"].includes(action)) fail(`Generated MCP command is invalid: ${role}/${action}.`);
  }
}
function verify(target, projectId, coreRoot, files, host, admin) {
  for (const [relative, content] of files) if (fs.readFileSync(path.join(target, relative), "utf8") !== content) fail(`Generated file verification failed: ${relative}.`);
  const inventory = JSON.parse(fs.readFileSync(path.join(target, ".claude/head-project.json"), "utf8"));
  if (JSON.stringify(inventory.managedFiles) !== JSON.stringify(managedFiles)) fail("Project managed inventory verification failed.");
  for (const role of roles) verifyConfig(role, path.join(target, ".claude/agents", role, "opencode.json"), target, coreRoot);
  const restore = path.join(coreRoot, "packages/_platform/project-init/resume-session.sh");
  verifyReference(restore, coreRoot, "file");
  if ((fs.statSync(restore).mode & 0o100) === 0) fail("Installed recovery engine is not owner-executable.");
  const matches = admin.inspect().filter((item) => item.projectId === projectId && item.projectRoot === target);
  if (matches.length !== 1) fail("Host registration verification failed.");
  health(`${host.endpoint}/agent-task`, "task"); health(`${host.endpoint}/agent-comm`, "comm");
}

export function initializeProject({ target, projectId, env = process.env } = {}) {
  if (typeof target !== "string" || !target) fail("A target directory is required.");
  const absoluteTarget = path.resolve(target); const id = projectIdFor(absoluteTarget, projectId);
  const { host, current } = readInstalledHost(env); const admin = createHostAdmin({ hostStateRoot: host.stateRoot });
  const files = preflight(absoluteTarget, id, current, admin); const created = []; const directories = [];
  const registrationExisted = admin.inspect().some((item) => item.projectId === id && item.projectRoot === absoluteTarget);
  let registrationCreated = false;
  try {
    for (const directory of [absoluteTarget, path.join(absoluteTarget, ".claude"), path.join(absoluteTarget, ".claude/agents"), ...roles.map((role) => path.join(absoluteTarget, ".claude/agents", role)), path.join(absoluteTarget, ".claude/agents/head/sessions"), path.join(absoluteTarget, ".claude/skills"), path.join(absoluteTarget, "scripts")]) if (!exists(directory)) { fs.mkdirSync(directory, { mode: 0o700 }); directories.push(directory); }
    for (const [relative, content] of files) if (!exists(path.join(absoluteTarget, relative))) publish(path.join(absoluteTarget, relative), content, created, relative === "scripts/resume-session.sh" ? 0o700 : 0o600);
    for (const relative of ["CLAUDE.md", ".claude/agents/head/CLAUDE.md", ".claude/agents/head/HEAD_CONTEXT.md", ...roles.filter((role) => role !== "head").flatMap((role) => [`.claude/agents/${role}/CLAUDE.md`, `.claude/agents/${role}/EXPERTISE.md`])]) if (!exists(path.join(absoluteTarget, relative))) publish(path.join(absoluteTarget, relative), seed(relative), created);
    admin.register({ projectId: id, projectRoot: absoluteTarget }); registrationCreated = !registrationExisted;
    verify(absoluteTarget, id, current, files, host, admin);
    return { status: "launch_ready", projectId: id, projectRoot: absoluteTarget, coreRoot: current, registration: { projectId: id, projectRoot: absoluteTarget }, readiness: "onboarding" };
  } catch (error) { if (registrationCreated) { try { admin.unregister({ projectId: id, projectRoot: absoluteTarget }); } catch {} } rollback(created, directories); throw error; }
}
