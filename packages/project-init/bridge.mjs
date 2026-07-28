import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { forwardStdio } from "../coordination/mcp/host-coordination/stdio-bridge.mjs";

export function configuredHost(env = process.env) {
  const home = env.HOME || os.homedir();
  const file = env.HEAD_HOST_CONFIG || path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "head", "host.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function runBridge(endpoint, env = process.env) {
  if (!["agent-task", "agent-comm"].includes(endpoint)) throw new Error("Only agent-task and agent-comm bridges exist.");
  return forwardStdio({ endpoint: `${configuredHost(env).endpoint}/${endpoint}` });
}
if (process.argv[1] === new URL(import.meta.url).pathname) runBridge(process.argv[2]).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
