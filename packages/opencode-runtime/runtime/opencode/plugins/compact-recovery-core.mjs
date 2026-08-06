import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildHeadPrompt, detectHerdrLocation, headDir, logRuntimeEvent, projectRoot } from "../bin/render-runtime-config.mjs";

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const HEAD_CORE_PATH = fs.existsSync(path.resolve(CORE_ROOT, "head", "HEAD_CORE.md"))
  ? path.resolve(CORE_ROOT, "head", "HEAD_CORE.md")
  : path.resolve(CORE_ROOT, "..", "core", "head", "HEAD_CORE.md");
const CHECKPOINT_HINT_TOKENS = 200_000;
const COMPACTION_PROMPT = `Write only the lossy compaction message that will be injected into the compacted conversation for session <active session directory name>.

Preserve enough conversational meaning to make the immediate next turn intelligible: the current topic, the user's latest intent, established decisions that are not already obvious from canonical recovery context, unfinished questions, and the immediate continuation. Prefer concise prose over chronology or transcript replay.

This message is non-canonical runtime continuity. It must not create, replace, append, or propose file-backed Session or Run state. Do not emit a persistence payload, JSON envelope, progress.md content, history entry, ledger record, or claim that any canonical file was updated. Canonical Session/Run recovery files loaded separately remain authoritative.`;
export const DEFAULT_NEXT_INSTRUCTION = "Continue from the exact next action recorded in the active recovery context.";

function requiredInstructionFile(filePath, label, filesystem = fs) {
  let body = "";
  try { body = filesystem.readFileSync(filePath, "utf8").trim(); } catch {}
  if (!body) throw new Error(`Compaction requires ${label}: ${filePath}`);
  return `# Loaded Instruction: ${filePath}\n\n${body}`;
}

export function compactionInstructionContext(root, { filesystem = fs, headCorePath = HEAD_CORE_PATH } = {}) {
  const active = projectRoot(root);
  if (!active) throw new Error("Compaction requires a validated HEAD project root.");
  return [
    requiredInstructionFile(headCorePath, "HEAD Core", filesystem),
    requiredInstructionFile(path.join(active, "CLAUDE.md"), "project CLAUDE.md", filesystem),
    requiredInstructionFile(path.join(headDir(active), "CLAUDE.md"), "HEAD CLAUDE.md", filesystem),
  ].join("\n\n---\n\n");
}

export function compactPrompt(sessionName, instructionContext = "") {
  const instructions = String(instructionContext || "").trim();
  const authority = instructions
    ? `Apply the following canonical HEAD behavior and project instructions while constructing the non-canonical compaction message. Shape the intended current behavior directly; do not replace it with a catalogue of conversation-specific prohibitions or cleanup history.\n\n${instructions}\n\n---\n\n`
    : "";
  return `${authority}${COMPACTION_PROMPT.replace("<active session directory name>", sessionName)}\n\n`;
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

function checkpointHint() {
  return "Context has crossed the HEAD checkpoint threshold. At the next natural task boundary, leave the active run or slice reproducible and call `checkpoint_compact`. Do not interrupt an atomic action or narrow the full run just to compact.";
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

export const CompactRecovery = async ({ client, root: configuredRoot, directory, worktree, detectLocation, schema: providedSchema } = {}) => {
  const root = projectRoot(configuredRoot || directory || worktree);
  const resolveLocation = detectLocation || (() => detectHerdrLocation(process.env, undefined, root));
  const schema = providedSchema || await resolveToolSchema();
  const pending = new Set();
  const inFlight = new Set();
  const compactSystemCalls = new Set();
  const compactSessions = new Map();
  const continuations = new Map();
  const pendingHints = new Set();
  const shownHints = new Set();
  const notifiedHints = new Set();

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
          pendingHints.delete(sessionID);
          shownHints.add(sessionID);
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
      if (payload.trim()) output.system.push(payload);
      if (pendingHints.has(sessionID) && !shownHints.has(sessionID)) {
        output.system.push(checkpointHint());
        pendingHints.delete(sessionID);
        shownHints.add(sessionID);
        logRuntimeEvent("compact-recovery", { event: "checkpoint_hint_injected", sessionID, threshold: CHECKPOINT_HINT_TOKENS }, root);
      }
    },

    "experimental.session.compacting": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      const location = liveSessionLocation(root, resolveLocation);
      if (!location) return;
      compactSessions.set(sessionID, location.sessionName);
      compactSystemCalls.add(sessionID);
      output.prompt = compactPrompt(location.sessionName, compactionInstructionContext(root));
      if (Array.isArray(output?.context)) output.context.splice(0, output.context.length);
    },

    "experimental.compaction.autocontinue": async (input, output) => {
      const sessionID = String(input?.sessionID || "");
      const expected = compactSessions.get(sessionID) || "";
      const location = liveSessionLocation(root, resolveLocation);
      const hasCheckpointContinuation = Boolean(expected && location?.sessionName === expected && continuations.has(sessionID));
      output.enabled = !hasCheckpointContinuation;
      if (hasCheckpointContinuation) {
        logRuntimeEvent("compact-recovery", { event: "checkpoint_native_autocontinue_suppressed", sessionID }, root);
      }
    },

    event: async ({ event }) => {
      const sessionID = String(event?.properties?.sessionID || event?.properties?.info?.sessionID || "");
      if (event.type === "message.updated") {
        if (!sessionID) return;
        const tokenTotal = assistantTokenTotal(event.properties?.info);
        if (tokenTotal >= CHECKPOINT_HINT_TOKENS && !shownHints.has(sessionID)) {
          pendingHints.add(sessionID);
          logRuntimeEvent("compact-recovery", { event: "checkpoint_threshold_crossed", sessionID, tokenTotal }, root);
          if (!notifiedHints.has(sessionID)) {
            notifiedHints.add(sessionID);
            try {
              await client.tui.showToast({
                body: {
                  title: "HEAD checkpoint ready",
                  message: "Context crossed 200k tokens. At the next natural boundary, make the active work reproducible and call checkpoint_compact.",
                  variant: "warning",
                  duration: 12000,
                },
              });
              logRuntimeEvent("compact-recovery", { event: "checkpoint_toast_shown", sessionID, threshold: CHECKPOINT_HINT_TOKENS }, root);
            } catch (error) {
              logRuntimeEvent("compact-recovery", { event: "checkpoint_toast_error", sessionID, error: String(error).slice(0, 300) }, root);
            }
          }
        }
        return;
      }
      if (event.type === "session.compacted") {
        compactSystemCalls.delete(sessionID);
        pendingHints.delete(sessionID);
        shownHints.delete(sessionID);
        notifiedHints.delete(sessionID);
        const sessionName = compactSessions.get(sessionID) || "";
        const location = liveSessionLocation(root, resolveLocation);
        if (!sessionName || location?.sessionName !== sessionName) {
          pending.delete(sessionID);
          inFlight.delete(sessionID);
          continuations.delete(sessionID);
          compactSessions.delete(sessionID);
          return;
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
