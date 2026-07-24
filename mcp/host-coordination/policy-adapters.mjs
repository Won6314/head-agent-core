import fs from "node:fs";
import path from "node:path";
import { RuntimeContextError } from "../agent-task/runtime-context.mjs";
const ROLE = /^[a-z][a-z0-9_]{0,63}$/;
const MODEL = /^[A-Za-z0-9._/:+-]{1,200}$/;
const fail = (code, message) => { throw new RuntimeContextError(code, message); };
function directAgent(context, role) {
  if (!ROLE.test(String(role || ""))) return null;
  const agents = path.join(context.projectRoot, ".claude", "agents"), candidate = path.join(agents, role);
  try {
    const root = fs.realpathSync(agents), stat = fs.lstatSync(candidate), canonical = fs.realpathSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.dirname(canonical) !== root || (typeof process.getuid === "function" && stat.uid !== process.getuid())) return null;
    return canonical;
  } catch { return null; }
}
export function createProjectPolicyAdapters() {
  return Object.freeze({
    resolveOverlay: () => ({ resolveAgent: directAgent }),
    resolveRole: ({ context, live }) => {
      const agents = fs.realpathSync(path.join(context.projectRoot, ".claude", "agents"));
      const cwd = fs.realpathSync(live.cwd), role = path.basename(cwd), stat = fs.lstatSync(cwd);
      if (path.dirname(cwd) !== agents || !ROLE.test(role) || !stat.isDirectory() || stat.isSymbolicLink() || (typeof process.getuid === "function" && stat.uid !== process.getuid())) fail("UNTRUSTED_ROLE", "Live CWD is not an owned direct project agent.");
      return role;
    },
    resolveExecution: ({ runtime = "opencode", model = "", reviewMode = "" }) => {
      if (runtime === "claude") fail("UNSUPPORTED_CLAUDE_EVIDENCE", "Claude is disabled until exact runtime session evidence is implemented.");
      if (runtime !== "opencode" || (model && !MODEL.test(model)) || typeof reviewMode !== "string" || reviewMode.length > 128) fail("INVALID_EXECUTION_POLICY", "Invalid OpenCode execution policy.");
      return Object.freeze({ runtime: "opencode", model: model || "openai/gpt-5.6-terra", variant: "", reviewMode, rootSessionId: null });
    },
  });
}
