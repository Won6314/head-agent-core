#!/usr/bin/env node
import childProcess from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installHost } from "./host-installer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fail = (message) => { throw new Error(message); };

function parse(argv) {
  if (argv[0] !== "init") fail("Usage: head init <target> [--project-id <id>] [--opencode <file>] [--herdr <file>] [--socket <file>] [--port <number>]");
  const values = { target: "" }, allowed = new Set(["--project-id", "--opencode", "--herdr", "--socket", "--port"]);
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      if (values.target) fail("The public command accepts exactly one target.");
      values.target = item;
      continue;
    }
    if (!allowed.has(item)) fail(`Unknown public option: ${item}.`);
    const key = item === "--project-id" ? "projectId" : item.slice(2);
    if (Object.hasOwn(values, key)) fail(`Duplicate public option: ${item}.`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) fail(`A value is required for ${item}.`);
    values[key] = value;
  }
  if (!values.target) fail("A public init target is required.");
  if (values.port != null && (!/^\d+$/.test(values.port) || Number(values.port) > 65535)) fail("--port must be a valid port number.");
  return values;
}

function invoke(command, args, env) {
  const result = childProcess.spawnSync(command, args, { encoding: "utf8", env });
  const output = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  let body;
  try { body = output ? JSON.parse(output) : null; } catch { body = null; }
  if (result.error || result.status !== 0 || !body) fail(body?.error || result.error?.message || `Installed command failed: ${command} ${args.join(" ")}.`);
  return body;
}

function phaseFailure(phase, resume, error, host, project) {
  return { status: "failed", phase, error: error.message, resume, release: host?.release, host: host?.endpoint, project: project?.projectId };
}

/** Compose the committed host, installed-current project, and onboarding transactions. */
export function publicInit({ argv = process.argv.slice(2), env = process.env, releaseRoot = path.resolve(here, "../.."), install = installHost, run = invoke } = {}) {
  const options = parse(argv);
  const target = path.resolve(options.target);
  let host;
  try {
    host = install({ releaseRoot, opencode: options.opencode, herdr: options.herdr, socket: options.socket, port: options.port == null ? undefined : Number(options.port), env });
    if (host.status !== "installed") fail(host.error || "Host installation did not commit.");
  } catch (error) {
    return phaseFailure("host", { command: "./head", args: [...argv] }, error);
  }
  let project;
  const projectArgs = ["project", "init", target];
  if (options.projectId) projectArgs.push("--project-id", options.projectId);
  try {
    project = run(host.command, projectArgs, env);
  } catch (error) {
    return phaseFailure("project", { command: host.command, args: projectArgs }, error, host);
  }
  let onboarding;
  try {
    onboarding = run(host.command, ["onboarding", "start", target], env);
  } catch (error) {
    return phaseFailure("onboarding", { command: host.command, args: ["onboarding", "start", target] }, error, host, project);
  }
  return {
    status: "ready",
    release: host.release,
    host: { endpoint: host.endpoint, current: host.current, command: host.command, converged: Boolean(host.converged) },
    project: { id: project.projectId, root: project.projectRoot, registration: project.registration },
    onboarding: { session: onboarding.session, workspaceId: onboarding.workspaceId, tabId: onboarding.tabId, paneId: onboarding.paneId, openCodeSessionId: onboarding.openCodeSessionId, reused: onboarding.reused },
    converged: Boolean(host.converged && onboarding.reused),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = publicInit();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "ready" ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "failed", phase: "public", error: error.message })}\n`);
    process.exitCode = 1;
  }
}
