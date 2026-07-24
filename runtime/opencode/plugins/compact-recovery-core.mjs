import fs from "node:fs";
import path from "node:path";
import { loadSessionRecord, logRuntimeEvent, projectRoot } from "../bin/render-runtime-config.mjs";
import { beginCompactionSystemTransform, clearCompactionSystemTransform } from "./compaction-phase.mjs";

const SESSION_ID = /^ses_[A-Za-z0-9]+$/;
const RESUME_INPUT = "continue";

function isCompactionRequest({ info, parts } = {}) {
  return info?.role === "user" && parts?.some((part) => part?.type === "compaction");
}

function isNativeContinuation({ info, parts } = {}) {
  return info?.role === "user" && parts?.some((part) => part?.synthetic === true && part?.metadata?.compaction_continue === true);
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
        ? { ...part, text: RESUME_INPUT } : part) }];
    }
    return [message];
  });
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

function mappedSession(sessionID, root) {
  if (!SESSION_ID.test(sessionID) || !root) return false;
  const name = String((loadSessionRecord(sessionID, root) || {}).sessionName || "");
  const sessionsRoot = path.join(root, ".claude", "agents", "head", "sessions");
  const candidate = path.join(sessionsRoot, name);
  try {
    return /^[A-Za-z0-9._-]+$/.test(name)
      && fs.statSync(candidate).isDirectory()
      && path.dirname(fs.realpathSync(candidate)) === fs.realpathSync(sessionsRoot);
  } catch { return false; }
}

export const CompactRecovery = async ({ client, root: configuredRoot, directory, worktree } = {}) => {
  const root = projectRoot(configuredRoot || directory || worktree);
  const pending = new Set();
  const compacting = new Set();
  const resume = new Set();

  return {
    tool: {
      checkpoint_compact: {
        description: "Compact the mapped HEAD pane/session at idle and continue once.",
        args: {},
        async execute(_args, context) {
          const sessionID = String(context?.sessionID || "");
          if (!mappedSession(sessionID, root)) return "No mapped HEAD pane/session is available for compaction.";
          pending.add(sessionID);
          logRuntimeEvent("compact-recovery", { event: "checkpoint_requested", sessionID }, root);
          return "Compaction is queued for the idle boundary; the mapped session will continue once afterward.";
        },
      },
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      if (!Array.isArray(output?.messages)) return;
      const projected = compactProjection(output.messages);
      output.messages.splice(0, output.messages.length, ...projected);
    },

    "experimental.session.compacting": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      if (!mappedSession(sessionID, root)) return;
      beginCompactionSystemTransform(sessionID);
      if (Array.isArray(output?.context)) output.context.splice(0, output.context.length);
    },

    "experimental.compaction.autocontinue": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      output.enabled = mappedSession(sessionID, root) && resume.delete(sessionID);
    },

    event: async ({ event }) => {
      const sessionID = String(event?.properties?.sessionID || event?.properties?.info?.sessionID || "");
      if (event.type === "session.compacted") {
        clearCompactionSystemTransform(sessionID);
        if (!mappedSession(sessionID, root)) {
          pending.delete(sessionID);
          compacting.delete(sessionID);
          resume.delete(sessionID);
          return;
        }
      } else if (!mappedSession(sessionID, root)) return;
      if (event.type === "session.idle") {
        if (!pending.delete(sessionID) || compacting.has(sessionID)) return;
        compacting.add(sessionID);
        resume.add(sessionID);
        try {
          const messages = data(await client.session.messages({ path: { id: sessionID } }));
          const model = latestUserModel(messages);
          const result = data(await client.session.summarize({ path: { id: sessionID }, body: { ...model, auto: true } }));
          if (result !== true) throw new Error("OpenCode compaction failed");
        } catch (error) {
          resume.delete(sessionID);
          pending.add(sessionID);
          logRuntimeEvent("compact-recovery", { event: "checkpoint_compaction_error", sessionID, error: String(error).slice(0, 300) }, root);
        } finally {
          compacting.delete(sessionID);
        }
        return;
      }
    },
  };
};
