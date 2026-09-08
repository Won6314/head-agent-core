import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installHost } from "./host-installer.mjs";
import { serveShadow } from "../coordination/mcp/host-coordination/daemon-entry.mjs";
import { runBridge } from "./bridge.mjs";
import { initializeProject } from "./project-initializer.mjs";
import { startOnboarding } from "./onboarding-driver.mjs";

const args = process.argv.slice(2);
const value = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
if (args[0] === "install") {
  const result = installHost({ releaseRoot: value("--release"), opencode: value("--opencode"), herdr: value("--herdr"), socket: value("--socket"), port: value("--port") ? Number(value("--port")) : undefined });
  process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.status === "installed" ? 0 : 1;
} else if (args[0] === "daemon" && args[1] === "--config") {
  const config = JSON.parse(fs.readFileSync(path.resolve(args[2]), "utf8"));
  serveShadow({ stateRoot: config.stateRoot, socketPath: config.socketPath, herdrBinary: config.herdrPath, opencodeBinary: config.opencodePath, host: "127.0.0.1", port: Number(new URL(config.endpoint).port) }, { startToken: crypto.randomUUID() }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
} else if (["agent-task", "agent-comm"].includes(args[0])) {
  runBridge(args[0]).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
} else if (args[0] === "project" && args[1] === "init" && args[2]) {
  try { process.stdout.write(`${JSON.stringify(initializeProject({ target: args[2], projectId: value("--project-id") }))}\n`); } catch (error) { process.stderr.write(`${JSON.stringify({ status: "failed", error: error.message })}\n`); process.exitCode = 1; }
} else if (args[0] === "onboarding" && args[1] === "start" && args[2]) {
  try { process.stdout.write(`${JSON.stringify(startOnboarding({ target: args[2] }))}\n`); } catch (error) { process.stderr.write(`${JSON.stringify({ status: "failed", error: error.message })}\n`); process.exitCode = 1; }
} else if (process.argv[1] === fileURLToPath(import.meta.url)) process.stderr.write("Usage: head-host install [--release DIR] [--opencode FILE] [--herdr FILE] [--socket FILE] | head-host project init <target> [--project-id <id>] | head-host onboarding start <target>\n");
