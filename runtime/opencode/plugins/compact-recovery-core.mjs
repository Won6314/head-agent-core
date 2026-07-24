import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildHeadPrompt, detectHerdrLocation, logRuntimeEvent, projectRoot } from "../bin/render-runtime-config.mjs";

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const COMPACTION_PROMPT = `Output exactly one fenced \`json\` block and no other text:

\`\`\`json
{
  "session": "<active session directory name>",
  "progress": "# Progress\\n\\n## Current State\\n- <current verified state>\\n\\n## Active Work\\n- <unfinished work>\\n\\n## Next Handoff\\n1. <first action on resume>\\n\\n## References\\n- <only the paths needed to resume>\\n",
  "history_append": "## YYYY-MM-DD: <completed result title>\\n- <completed result>\\n"
}
\`\`\`

\`progress\` replaces \`sessions/{session}/progress.md\`. \`history_append\` appends to \`sessions/{session}/history.md\` and is empty when there is no completed result.`;
export const DEFAULT_NEXT_INSTRUCTION = "Continue from the exact next action recorded in the active run.";

export function compactPrompt(sessionName) {
  return `${COMPACTION_PROMPT.replace("<active session directory name>", sessionName)}\n\n`;
}

export function persistCompactPayload({ root, sessionName, summary }) {
  const updater = path.join(CORE_ROOT, "runtime", "claude-hooks", "compact-session-update.py");
  const result = spawnSync("python3", [updater, "--project-root", root, "--session", sessionName], { input: summary, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Compact persistence failed: ${(result.stderr || result.stdout || "unknown updater failure").trim()}`);
}

export function latestUserModel(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const info = messages[index]?.info;
    const providerID = String(info?.model?.providerID || "");
    const modelID = String(info?.model?.modelID || "");
    if (info?.role === "user" && providerID && modelID) return { providerID, modelID };
  }
  return null;
}

function data(result) {
  if (result && typeof result === "object" && !Array.isArray(result) && result.error) throw new Error("OpenCode session operation failed");
  return result?.data ?? result;
}

function liveSessionLocation(root, detectLocation) {
  if (!root) return null;
  let location;
  try { location = detectLocation(); } catch { return null; }
  const name = String(location?.tabLabel || location?.sessionName || "");
  const sessionsRoot = path.join(root, ".claude", "agents", "head", "sessions");
  const candidate = path.join(sessionsRoot, name);
  try {
    return /^[A-Za-z0-9._-]+$/.test(name)
      && fs.statSync(candidate).isDirectory()
      && path.dirname(fs.realpathSync(candidate)) === fs.realpathSync(sessionsRoot)
      ? Object.freeze({ ...location, tabLabel: name, sessionName: name }) : null;
  } catch { return null; }
}

function isCompactionRequest({ info, parts } = {}) {
  return info?.role === "user" && parts?.some((part) => part?.type === "compaction");
}

function isNativeContinuation({ info, parts } = {}) {
  return info?.role === "user" && parts?.some((part) => part?.synthetic === true && part?.metadata?.compaction_continue === true);
}

function isCompactionPart(part) {
  return part?.type === "compaction" || (part?.synthetic === true && part?.metadata?.compaction_continue === true);
}

function normalizeNextInstruction(value) {
  const instruction = String(value || "").trim();
  return instruction || DEFAULT_NEXT_INSTRUCTION;
}

export async function resolveToolSchema({ env = process.env, filesystem = fs } = {}) {
  const home = env.HOME || os.homedir();
  const configHome = env.XDG_CONFIG_HOME || (home ? path.join(home, ".config") : "");
  const cacheHome = env.XDG_CACHE_HOME || (home ? path.join(home, ".cache") : "");
  const roots = [
    env.OPENCODE_CONFIG_DIR,
    configHome && path.join(configHome, "opencode"),
    cacheHome && path.join(cacheHome, "opencode"),
  ].filter(Boolean);
  for (const root of [...new Set(roots)]) {
    const moduleFile = path.join(root, "node_modules", "@opencode-ai", "plugin", "dist", "index.js");
    if (!filesystem.existsSync(moduleFile)) continue;
    const plugin = await import(pathToFileURL(moduleFile).href);
    if (plugin?.tool?.schema) return plugin.tool.schema;
  }
  throw new Error("OpenCode plugin schema runtime is unavailable from the configured config/cache roots.");
}

export function compactProjection(messages) {
  return messages.flatMap((message, index) => {
    const { info, parts } = message || {};
    if (info?.role === "assistant" && (Boolean(info.summary) || info.mode === "compaction")) return [];
    if (isCompactionRequest(message)) return [];
    if (isNativeContinuation(message)) {
      const answered = messages.slice(index + 1).some(({ info: later } = {}) => later?.role === "assistant" && !later.summary && later.mode !== "compaction");
      if (answered) return [];
      return [{ ...message, parts: parts.map((part) => part?.synthetic === true && part?.metadata?.compaction_continue === true
        ? { ...part, text: "continue" } : part) }];
    }
    return [message];
  });
}

function compactSummary(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index] || {};
    if (message.info?.role !== "assistant" || (!message.info?.summary && message.info?.mode !== "compaction")) continue;
    const text = (message.parts || []).filter((part) => typeof part?.text === "string").map((part) => part.text).join("\n");
    if (text) return text;
  }
  return "";
}

export const CompactRecovery = async ({ client, root: configuredRoot, directory, worktree, persist = persistCompactPayload, detectLocation, schema: providedSchema } = {}) => {
  const root = projectRoot(configuredRoot || directory || worktree);
  const resolveLocation = detectLocation || (() => detectHerdrLocation(process.env, undefined, root));
  const schema = providedSchema || await resolveToolSchema();
  const pending = new Set();
  const inFlight = new Set();
  const compactSystemCalls = new Set();
  const compactSessions = new Map();
  const continuations = new Map();

  return {
    tool: {
      checkpoint_compact: {
        description: "Compact the current OpenCode session at idle, then submit one explicit next instruction as a new user turn.",
        args: {
          next_instruction: schema.string().optional().describe(`Instruction to submit after compaction. Defaults to: ${DEFAULT_NEXT_INSTRUCTION}`),
        },
        async execute(args, context) {
          const sessionID = context.sessionID;
          const location = liveSessionLocation(root, resolveLocation);
          if (!location) return "No validated Herdr tab/session is available for compaction.";
          const instruction = normalizeNextInstruction(args?.next_instruction);
          compactSessions.set(sessionID, location.sessionName);
          continuations.set(sessionID, {
            instruction,
            requestMessageID: String(context.messageID || ""),
            phase: "queued",
          });
          pending.add(sessionID);
          logRuntimeEvent("compact-recovery", { event: "checkpoint_requested", sessionID, sessionName: location.sessionName, hasExplicitNextInstruction: Boolean(String(args?.next_instruction || "").trim()) }, root);
          return `Compaction is queued for the idle boundary; afterward one user turn will be submitted with: ${instruction}`;
        },
      },
    },

    "chat.message": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      const continuation = continuations.get(sessionID);
      if (!continuation || !["queued", "compacting", "compacted"].includes(continuation.phase)) return;
      if (String(input?.messageID || "") === continuation.requestMessageID) return;
      if (output?.message?.role !== "user" || (output?.parts || []).some(isCompactionPart)) return;
      continuation.phase = "superseded";
      continuation.supersededBy = String(input?.messageID || "");
      logRuntimeEvent("compact-recovery", { event: "checkpoint_continuation_superseded", sessionID, messageID: continuation.supersededBy }, root);
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      if (!Array.isArray(output?.messages)) return;
      const projected = compactProjection(output.messages);
      output.messages.splice(0, output.messages.length, ...projected);
    },

    "experimental.chat.system.transform": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      if (!sessionID || !Array.isArray(output?.system)) return;
      if (compactSystemCalls.delete(sessionID)) return;
      const location = liveSessionLocation(root, resolveLocation);
      if (!location) return;
      const payload = buildHeadPrompt({ sessionID, agent: "head", root, location }).prompt;
      if (!payload.trim()) return;
      output.system.push(payload);
    },

    "experimental.session.compacting": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      const location = liveSessionLocation(root, resolveLocation);
      if (!location) return;
      compactSessions.set(sessionID, location.sessionName);
      compactSystemCalls.add(sessionID);
      output.prompt = compactPrompt(location.sessionName);
      if (Array.isArray(output?.context)) output.context.splice(0, output.context.length);
    },

    "experimental.compaction.autocontinue": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      const expected = compactSessions.get(sessionID) || "";
      const location = liveSessionLocation(root, resolveLocation);
      output.enabled = false;
      if (expected && location?.sessionName === expected && continuations.has(sessionID)) {
        logRuntimeEvent("compact-recovery", { event: "checkpoint_native_autocontinue_suppressed", sessionID }, root);
      }
    },

    event: async ({ event }) => {
      const sessionID = String(event?.properties?.sessionID || event?.properties?.info?.sessionID || "");
      if (event.type === "session.compacted") {
        compactSystemCalls.delete(sessionID);
        const sessionName = compactSessions.get(sessionID) || "";
        const location = liveSessionLocation(root, resolveLocation);
        if (!sessionName || location?.sessionName !== sessionName) {
          pending.delete(sessionID);
          inFlight.delete(sessionID);
          continuations.delete(sessionID);
          compactSessions.delete(sessionID);
          return;
        }
        try {
          const messages = data(await client?.session?.messages?.({ path: { id: sessionID } }));
          const summary = compactSummary(messages);
          if (summary) persist({ root, sessionName, summary });
        } catch (error) {
          logRuntimeEvent("compact-recovery", { event: "compact_persistence_error", sessionID, error: String(error).slice(0, 300) }, root);
        }
        const continuation = continuations.get(sessionID);
        if (!continuation) return;
        if (continuation.phase === "superseded") {
          continuations.delete(sessionID);
          compactSessions.delete(sessionID);
          logRuntimeEvent("compact-recovery", { event: "checkpoint_continuation_skipped", sessionID, reason: "superseded_by_user_input" }, root);
          return;
        }
        if (["dispatching", "ambiguous"].includes(continuation.phase)) return;
        continuation.phase = "dispatching";
        try {
          data(await client.session.promptAsync({
            path: { id: sessionID },
            body: { parts: [{ type: "text", text: continuation.instruction }] },
          }));
          continuations.delete(sessionID);
          compactSessions.delete(sessionID);
          logRuntimeEvent("compact-recovery", { event: "checkpoint_continuation_submitted", sessionID }, root);
        } catch (error) {
          continuation.phase = "ambiguous";
          continuation.error = String(error).slice(0, 300);
          logRuntimeEvent("compact-recovery", { event: "checkpoint_continuation_ambiguous", sessionID, error: continuation.error }, root);
        }
      }
      if (event.type === "session.idle") {
        if (!pending.delete(sessionID) || inFlight.has(sessionID)) return;
        inFlight.add(sessionID);
        const continuation = continuations.get(sessionID);
        if (continuation && continuation.phase === "queued") continuation.phase = "compacting";
        try {
          const messages = data(await client.session.messages({ path: { id: sessionID } }));
          const model = latestUserModel(messages);
          const result = data(await client.session.summarize({ path: { id: sessionID }, body: { ...model, auto: true } }));
          if (result !== true) throw new Error("OpenCode compaction failed");
        } catch (error) {
          if (continuation && continuation.phase !== "superseded") {
            continuation.phase = "ambiguous";
            continuation.error = String(error).slice(0, 300);
          }
          logRuntimeEvent("compact-recovery", { event: "checkpoint_compaction_error", sessionID, error: String(error).slice(0, 300) }, root);
        } finally {
          inFlight.delete(sessionID);
        }
        return;
      }
    },
  };
};
