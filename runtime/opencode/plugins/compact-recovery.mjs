import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHeadPrompt, loadSessionRecord, logRuntimeEvent, projectRoot } from "../bin/render-runtime-config.mjs";

const COMPACT_CONTRACT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../COMPACT_CONTRACT.md");
const SESSION_ID = /^ses_[A-Za-z0-9]+$/;

export function loadCompactInstructions(contractPath = COMPACT_CONTRACT) {
  try {
    return fs.readFileSync(contractPath, "utf8").trim();
  } catch { return ""; }
}
function findSummaryText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const { info, parts } = messages[i] || {};
    if (info?.summary && typeof info.summary === "object" && info.summary.body) return info.summary.body;
    if (info?.summary === true && Array.isArray(parts)) {
      const text = parts.filter((part) => part?.type === "text" && part.text).map((part) => part.text).join("\n");
      if (text) return text;
    }
  }
  return "";
}
function resolveHeadSessionName(sessionID, root) {
  const name = String((loadSessionRecord(sessionID, root) || {}).sessionName || "");
  const sessionsRoot = path.join(root, ".claude", "agents", "head", "sessions");
  const candidate = path.join(sessionsRoot, name);
  try {
    return /^[A-Za-z0-9._-]+$/.test(name) && fs.statSync(candidate).isDirectory() && path.dirname(fs.realpathSync(candidate)) === fs.realpathSync(sessionsRoot) ? name : "";
  } catch { return ""; }
}
function writeSessionFiles(sessionID, summary, sessionName, root) {
  const script = path.join(root, ".claude", "hooks", "compact-session-update.py");
  if (!fs.existsSync(script)) return;
  const result = spawnSync("python3", [script, "--project-root", root, ...(sessionName ? ["--session", sessionName] : [])], { input: summary, encoding: "utf8", timeout: 15000 });
  logRuntimeEvent("compact-recovery", { event: "session_files_update", sessionID, headSession: sessionName, summaryLength: summary.length, exitCode: result.status, stderr: String(result.stderr || "").slice(0, 500) }, root);
}

export const CompactRecovery = async ({ client, root: configuredRoot, directory, worktree, buildPrompt = buildHeadPrompt } = {}) => {
  const root = projectRoot(configuredRoot || directory || worktree);
  logRuntimeEvent("plugin-init", { plugin: "compact-recovery", directory: directory || "", worktree: worktree || "", rootResolved: Boolean(root) }, root);
  return {
    "experimental.session.compacting": async (input, output) => {
      const sessionID = input?.sessionID || "";
      if (!SESSION_ID.test(sessionID) || !root || !Array.isArray(output?.context)) return;
      const instructions = loadCompactInstructions();
      if (instructions) { output.context.push(instructions); logRuntimeEvent("compact-recovery", { event: "compact_instructions_injected", sessionID, length: instructions.length }, root); }
      const { prompt } = buildPrompt({ sessionID, agent: "head", root });
      if (prompt.trim()) output.context.push(prompt);
    },
    event: async ({ event }) => {
      const sessionID = event?.properties?.sessionID || event?.properties?.info?.id || "";
      if (event?.type !== "session.compacted" || !SESSION_ID.test(sessionID) || !root) return;
      if (!client?.session?.messages) return;
      try {
        const result = await client.session.messages({ path: { id: sessionID } });
        const summary = findSummaryText(result?.data ?? result ?? []);
        const sessionName = resolveHeadSessionName(sessionID, root);
        if (summary && sessionName) writeSessionFiles(sessionID, summary, sessionName, root);
        else logRuntimeEvent("compact-recovery", { event: summary ? "session_unmapped" : "summary_not_found", sessionID }, root);
      } catch (error) { logRuntimeEvent("compact-recovery", { event: "summary_fetch_error", sessionID, error: String(error).slice(0, 300) }, root); }
    },
  };
};
