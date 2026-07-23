import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSessionRecord, logRuntimeEvent, projectRoot } from "../bin/render-runtime-config.mjs";
import { beginCompactionSystemTransform, clearCompactionSystemTransform } from "./compaction-phase.mjs";

const COMPACT_CONTRACT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../COMPACT_CONTRACT.md");
const SESSION_ID = /^ses_[A-Za-z0-9]+$/;
const CHECKPOINT_HINT_TOKENS = 200_000;

export function loadCompactInstructions(contractPath = COMPACT_CONTRACT) {
  try {
    return fs.readFileSync(contractPath, "utf8").trim();
  } catch { return ""; }
}

export function compactProjection(messages) {
  return messages.filter(({ info, parts } = {}) => {
    if (info?.role === "assistant" && (Boolean(info.summary) || info.mode === "compaction")) return false;
    if (info?.role === "user" && parts?.some((part) => part?.type === "compaction")) return false;
    if (info?.role === "user" && parts?.some((part) => part?.metadata?.compaction_continue === true)) return false;
    return true;
  });
}

export function assistantTokenTotal(info) {
  if (info?.role !== "assistant" || Boolean(info.summary) || info.mode === "compaction") return 0;
  const tokens = info.tokens || {};
  if (Number.isFinite(tokens.total) && tokens.total > 0) return tokens.total;
  return Number(tokens.input || 0)
    + Number(tokens.output || 0)
    + Number(tokens.reasoning || 0)
    + Number(tokens.cache?.read || 0)
    + Number(tokens.cache?.write || 0);
}

export function latestUserModel(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const info = messages[i]?.info;
    const providerID = String(info?.model?.providerID || "");
    const modelID = String(info?.model?.modelID || "");
    if (info?.role === "user" && providerID && modelID) return { providerID, modelID };
  }
  return null;
}

function sdkData(result, operation) {
  if (result && typeof result === "object" && !Array.isArray(result) && result.error) {
    throw new Error(`${operation} failed`);
  }
  return result?.data ?? result;
}

async function requestCheckpointCompaction(client, sessionID) {
  if (!client?.session?.messages || !client?.session?.summarize) throw new Error("session client is unavailable");
  const messages = sdkData(await client.session.messages({ path: { id: sessionID } }), "session messages");
  if (!Array.isArray(messages)) throw new Error("session messages response is invalid");
  const model = latestUserModel(messages);
  if (!model) throw new Error("session model is unavailable");
  const summarized = sdkData(await client.session.summarize({ path: { id: sessionID }, body: model }), "session summarize");
  if (summarized !== true) throw new Error("session summarize did not complete");
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
  if (!fs.existsSync(script)) return false;
  const result = spawnSync("python3", [script, "--project-root", root, ...(sessionName ? ["--session", sessionName] : [])], { input: summary, encoding: "utf8", timeout: 15000 });
  logRuntimeEvent("compact-recovery", { event: "session_files_update", sessionID, headSession: sessionName, summaryLength: summary.length, exitCode: result.status, stderr: String(result.stderr || "").slice(0, 500) }, root);
  return result.status === 0;
}

function checkpointHint() {
  return "Context has crossed the HEAD checkpoint threshold. At the next natural task boundary, leave the active run or slice reproducible and call `checkpoint_compact`. Do not interrupt an atomic action or narrow the full run just to compact.";
}

export const CompactRecovery = async ({ client, root: configuredRoot, directory, worktree } = {}) => {
  const root = projectRoot(configuredRoot || directory || worktree);
  const pendingHints = new Set();
  const shownHints = new Set();
  const pendingCheckpoints = new Set();
  const compactionsInFlight = new Set();
  const persistedCheckpoints = new Set();
  logRuntimeEvent("plugin-init", { plugin: "compact-recovery", directory: directory || "", worktree: worktree || "", rootResolved: Boolean(root) }, root);

  function persistCheckpoint(messages, sessionIDHint = "") {
    const checkpoint = messages.findLast(({ info } = {}) => Boolean(info?.summary));
    const sessionID = String(sessionIDHint || checkpoint?.info?.sessionID || "");
    const summary = findSummaryText([checkpoint]);
    const checkpointID = String(checkpoint?.info?.id || `${sessionID}:${summary}`);
    if (!checkpoint || !SESSION_ID.test(sessionID) || persistedCheckpoints.has(checkpointID)) return false;
    const sessionName = resolveHeadSessionName(sessionID, root);
    if (!summary || !sessionName) return false;
    const persisted = writeSessionFiles(sessionID, summary, sessionName, root);
    if (persisted) persistedCheckpoints.add(checkpointID);
    return persisted;
  }

  return {
    tool: {
      checkpoint_compact: {
        description: "Queue a HEAD persistence checkpoint and official OpenCode compaction for the idle boundary after this turn.",
        args: {},
        async execute(_args, context) {
          const sessionID = String(context?.sessionID || "");
          if (!SESSION_ID.test(sessionID)) return "No valid HEAD session is available for checkpoint compaction.";
          pendingCheckpoints.add(sessionID);
          pendingHints.delete(sessionID);
          shownHints.add(sessionID);
          logRuntimeEvent("compact-recovery", { event: "checkpoint_requested", sessionID }, root);
          return "Checkpoint compaction is queued for the idle boundary after this turn. Finish the current turn normally.";
        },
      },
    },

    "experimental.chat.system.transform": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      if (!SESSION_ID.test(sessionID) || !Array.isArray(output?.system)) return;
      if (!pendingHints.has(sessionID) || shownHints.has(sessionID)) return;
      output.system.push(checkpointHint());
      pendingHints.delete(sessionID);
      shownHints.add(sessionID);
      logRuntimeEvent("compact-recovery", { event: "checkpoint_hint_injected", sessionID, threshold: CHECKPOINT_HINT_TOKENS }, root);
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      if (!Array.isArray(output?.messages)) return;
      persistCheckpoint(output.messages);
      const projected = compactProjection(output.messages);
      output.messages.splice(0, output.messages.length, ...projected);
    },

    "experimental.session.compacting": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      if (!SESSION_ID.test(sessionID) || !root) return;
      beginCompactionSystemTransform(sessionID);
      const sections = [];
      const instructions = loadCompactInstructions();
      if (instructions) sections.push(instructions);
      if (!sections.length) return;
      output.prompt = sections.join("\n\n---\n\n");
      if (Array.isArray(output.context)) output.context.splice(0, output.context.length);
      logRuntimeEvent("compact-recovery", { event: "compact_prompt_replaced", sessionID, length: output.prompt.length }, root);
    },

    "experimental.compaction.autocontinue": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      if (SESSION_ID.test(sessionID) && client?.session?.messages) {
        try {
          const result = await client.session.messages({ path: { id: sessionID } });
          persistCheckpoint(result?.data ?? result ?? [], sessionID);
        } catch (error) {
          logRuntimeEvent("compact-recovery", { event: "pre_continue_persistence_error", sessionID, error: String(error).slice(0, 300) }, root);
        }
      }
      output.enabled = false;
    },

    event: async ({ event }) => {
      const sessionID = String(event?.properties?.sessionID || event?.properties?.info?.sessionID || "");
      if (!SESSION_ID.test(sessionID) || !root) return;

      if (event.type === "message.updated") {
        const tokenTotal = assistantTokenTotal(event.properties?.info);
        if (tokenTotal >= CHECKPOINT_HINT_TOKENS && !shownHints.has(sessionID)) {
          pendingHints.add(sessionID);
          logRuntimeEvent("compact-recovery", { event: "checkpoint_threshold_crossed", sessionID, tokenTotal }, root);
        }
        return;
      }

      if (event.type === "session.idle") {
        if (!pendingCheckpoints.has(sessionID) || compactionsInFlight.has(sessionID)) return;
        pendingCheckpoints.delete(sessionID);
        compactionsInFlight.add(sessionID);
        try {
          logRuntimeEvent("compact-recovery", { event: "checkpoint_compaction_started", sessionID }, root);
          await requestCheckpointCompaction(client, sessionID);
        } catch (error) {
          pendingCheckpoints.add(sessionID);
          logRuntimeEvent("compact-recovery", { event: "checkpoint_compaction_error", sessionID, error: String(error).slice(0, 300) }, root);
        } finally {
          compactionsInFlight.delete(sessionID);
        }
        return;
      }

      if (event.type !== "session.compacted") return;
      clearCompactionSystemTransform(sessionID);
      pendingHints.delete(sessionID);
      shownHints.delete(sessionID);
      pendingCheckpoints.delete(sessionID);
      if (!client?.session?.messages) return;
      try {
        const result = await client.session.messages({ path: { id: sessionID } });
        const messages = result?.data ?? result ?? [];
        if (!persistCheckpoint(messages, sessionID)) {
          const summary = findSummaryText(messages);
          const sessionName = resolveHeadSessionName(sessionID, root);
          if (!summary || !sessionName) logRuntimeEvent("compact-recovery", { event: summary ? "session_unmapped" : "summary_not_found", sessionID }, root);
        }
      } catch (error) {
        logRuntimeEvent("compact-recovery", { event: "summary_fetch_error", sessionID, error: String(error).slice(0, 300) }, root);
      }
    },
  };
};
