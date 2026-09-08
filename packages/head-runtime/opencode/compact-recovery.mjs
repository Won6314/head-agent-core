import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildHeadPrompt, detectHerdrLocation, headStateDir, logRuntimeEvent, projectRoot } from "../shared/context-composition.mjs";
import {
  BUDGET_CHARS,
  POINTER,
  USER_TURNS_MARKER,
  chooseCompactPrompt,
  collectCompactedUserTurns,
  formatCompactedUserTurns,
  lastCheckpointIso,
  stamp,
} from "../shared/compact-policy.mjs";

export const CONTINUATION_IDLE_POLL_INTERVAL_MS = 1_000;
export const CONTINUATION_IDLE_POLL_TIMEOUT_MS = 60_000;
export const SESSION_CONTEXT_MARKER = "<HEAD_RUNTIME_CONTEXT>";
export { POINTER, USER_TURNS_MARKER, BUDGET_CHARS };

const SESSION_ID = /^ses_[A-Za-z0-9]+$/;
const SLASH_COMMAND = /^\/[A-Za-z][\w-]*(\s|$)/;
const CONTINUATION_PREFIX = "This session is being continued from a previous conversation";

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function spanDirectory(root) {
  return path.join(headStateDir(root), "compact-spans");
}

function spanFile(root, sessionID) {
  return path.join(spanDirectory(root), `${sessionID}.json`);
}

export function messageTime(message) {
  const created = message?.info?.time?.created;
  if (typeof created === "number" && Number.isFinite(created)) return created;
  if (typeof created === "string") return Date.parse(created);
  return NaN;
}

function isCompactionMessage(message) {
  return message?.info?.role === "user" && (message.parts || []).some((part) => part?.type === "compaction");
}

function isSyntheticContinue(part) {
  return part?.synthetic === true || part?.metadata?.compaction_continue === true;
}

function textOf(parts) {
  return (parts || [])
    .filter((part) => part?.type === "text" && !part.ignored && !isSyntheticContinue(part) && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function isClearCommand(body) {
  return body.startsWith("<command-name>/clear") || /^\/clear(\s|$)/.test(body);
}

function skipUserBody(body) {
  if (!body) return true;
  if (body.startsWith("<command-name>") || body.startsWith("<local-command")) return true;
  if (body.startsWith("[Request interrupted")) return true;
  if (SLASH_COMMAND.test(body)) return true;
  if (body.startsWith(CONTINUATION_PREFIX)) return true;
  return false;
}

function questionAnswer(message) {
  if (message?.info?.role === "assistant" && (message.info.summary || message.info.mode === "compaction")) return "";
  const answers = [];
  for (const part of message?.parts || []) {
    if (part?.type !== "tool") continue;
    const name = part.tool || part.name;
    if (name !== "question" || part.state?.status !== "completed") continue;
    const output = String(part.state.output || "").trim();
    if (output) answers.push(output);
  }
  return answers.join("\n");
}

export function realUserTurn(message) {
  if (isCompactionMessage(message)) return null;
  const time = stamp(messageTime(message));
  const answer = questionAnswer(message);
  if (answer) return { ts: time, body: `(질문 답변) ${answer}` };
  if (message?.info?.role !== "user") return null;
  const body = textOf(message.parts);
  if (skipUserBody(body) || isClearCommand(body)) return null;
  return { ts: time, body };
}

export function extractCompactedUserTurns(messages) {
  const spans = [[]];
  if (!Array.isArray(messages)) return [];
  for (const message of messages) {
    if (isCompactionMessage(message)) {
      spans.push([]);
      continue;
    }
    if (message?.info?.role === "user") {
      const body = textOf(message.parts);
      if (isClearCommand(body)) {
        spans.push([]);
        continue;
      }
    }
    const turn = realUserTurn(message);
    if (turn) spans[spans.length - 1].push(turn);
  }
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    if (spans[index].length) return spans[index];
  }
  return [];
}

export function userTurnsSince(messages, sinceIso) {
  if (!Array.isArray(messages)) return -1;
  const since = Date.parse(sinceIso);
  if (Number.isNaN(since)) return -1;
  let count = 0;
  for (const message of messages) {
    if (!realUserTurn(message)) continue;
    const time = messageTime(message);
    if (Number.isNaN(time) || time <= since) continue;
    count += 1;
  }
  return count;
}

export function loadCompactedUserTurns(root, sessionID) {
  if (!SESSION_ID.test(String(sessionID || ""))) return null;
  try {
    return JSON.parse(fs.readFileSync(spanFile(root, sessionID), "utf8"));
  } catch {
    return null;
  }
}

export function saveCompactedUserTurns(root, sessionID, record) {
  if (!SESSION_ID.test(String(sessionID || ""))) return null;
  const target = spanFile(root, sessionID);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  syncDirectory(directory);
  let temporary = "";
  try {
    temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
    const descriptor = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, target);
    temporary = "";
    syncDirectory(directory);
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } finally {
    if (temporary) try { fs.unlinkSync(temporary); } catch {}
  }
}

export function latestUserModel(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const model = messages[index]?.info?.model;
    if (messages[index]?.info?.role === "user" && model?.providerID && model?.modelID) return model;
  }
  return null;
}

function data(value) {
  if (value?.error) throw new Error("OpenCode session operation failed");
  return value?.data ?? value;
}

function liveSessionLocation(root, detectLocation) {
  if (!root) return null;
  let location;
  try {
    location = detectLocation();
  } catch {
    return null;
  }
  const name = String(location?.tabLabel || location?.sessionName || "");
  const rootDir = path.join(root, ".claude", "agents", "head", "sessions");
  const candidate = path.join(rootDir, name);
  try {
    return /^[A-Za-z0-9._-]+$/.test(name)
      && fs.statSync(candidate).isDirectory()
      && path.dirname(fs.realpathSync(candidate)) === fs.realpathSync(rootDir)
      ? Object.freeze({ ...location, sessionName: name, tabLabel: name })
      : null;
  } catch {
    return null;
  }
}

export function sessionIsIdle(statuses, sessionID) {
  if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) return false;
  const status = statuses[sessionID];
  return !status || status.type === "idle";
}

export function compactProjection(messages) {
  return messages.filter(({ info, parts } = {}) => !(info?.role === "user" && parts?.some((part) => part?.type === "compaction")));
}

function instructionSource(line) {
  const match = /^Instructions from:\s*(.+)$/.exec(line);
  return match ? match[1].trim() : "";
}

export function isHeadCoreSystemEntry(entry) {
  if (typeof entry !== "string") return false;
  for (const line of entry.split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("# HEAD Core") || trimmed.startsWith("# HEAD Principles")) return true;
    const source = instructionSource(line);
    if (source && /(?:^|[\\/])HEAD_CORE\.md$/.test(source)) return true;
  }
  return false;
}

export function placeSessionContext(system, payload) {
  if (!Array.isArray(system) || !String(payload || "").trim()) return system;
  for (let index = system.length - 1; index >= 0; index -= 1) {
    if (typeof system[index] === "string" && system[index].includes(SESSION_CONTEXT_MARKER)) system.splice(index, 1);
  }
  const coreIndex = system.findIndex(isHeadCoreSystemEntry);
  system.splice(coreIndex >= 0 ? coreIndex + 1 : 0, 0, payload);
  return system;
}

export function placeUserTurns(system, payload) {
  if (!Array.isArray(system)) return system;
  for (let index = system.length - 1; index >= 0; index -= 1) {
    if (typeof system[index] === "string" && system[index].includes(USER_TURNS_MARKER)) system.splice(index, 1);
  }
  if (!String(payload || "").trim()) return system;
  const sessionIndex = system.findIndex((entry) => typeof entry === "string" && entry.includes(SESSION_CONTEXT_MARKER));
  if (sessionIndex >= 0) {
    system.splice(sessionIndex + 1, 0, payload);
    return system;
  }
  const coreIndex = system.findIndex(isHeadCoreSystemEntry);
  system.splice(coreIndex >= 0 ? coreIndex + 1 : 0, 0, payload);
  return system;
}

export async function resolveToolSchema({ env = process.env, filesystem = fs } = {}) {
  const home = env.HOME || os.homedir();
  const config = env.XDG_CONFIG_HOME || (home && path.join(home, ".config"));
  const cache = env.XDG_CACHE_HOME || (home && path.join(home, ".cache"));
  for (const root of [...new Set([env.OPENCODE_CONFIG_DIR, config && path.join(config, "opencode"), cache && path.join(cache, "opencode")].filter(Boolean))]) {
    const file = path.join(root, "node_modules", "@opencode-ai", "plugin", "dist", "index.js");
    if (filesystem.existsSync(file)) {
      const plugin = await import(pathToFileURL(file).href);
      if (plugin?.tool?.schema) return plugin.tool.schema;
    }
  }
  throw new Error("OpenCode plugin schema runtime is unavailable from the configured config/cache roots.");
}

function stageCompactedTurns(sessionID, sessionName, messages) {
  const turns = collectCompactedUserTurns(extractCompactedUserTurns(messages));
  return {
    sessionID,
    sessionName,
    text: formatCompactedUserTurns(turns),
    updatedAt: Date.now(),
  };
}

function historyTextFor(root, sessionName) {
  try {
    return fs.readFileSync(path.join(root, ".claude", "agents", "head", "sessions", sessionName, "history.md"), "utf8");
  } catch {
    return "";
  }
}

export const CompactRecovery = async ({
  client,
  root: configuredRoot,
  directory,
  worktree,
  detectLocation,
  schema: providedSchema,
} = {}) => {
  const root = projectRoot(configuredRoot || directory || worktree);
  const resolveLocation = detectLocation || (() => detectHerdrLocation(process.env, undefined, root));
  if (!providedSchema) await resolveToolSchema();
  const pending = new Set();
  const inFlight = new Set();
  const compactSystemCalls = new Set();
  const stagedSpans = new Map();

  async function loadMessages(sessionID) {
    try {
      return data(await client.session.messages({ path: { id: sessionID } }));
    } catch {
      return null;
    }
  }

  return {
    tool: {
      checkpoint_compact: {
        description: "Compact the current OpenCode session at idle.",
        args: {},
        async execute(_args, context) {
          const location = liveSessionLocation(root, resolveLocation);
          if (!location) return "No validated Herdr tab/session is available for compaction.";
          pending.add(context.sessionID);
          return "Compaction is queued for the idle boundary.";
        },
      },
    },
    "experimental.chat.system.transform": async (input, output) => {
      const id = String(input?.sessionID || "");
      if (!id || !Array.isArray(output?.system) || compactSystemCalls.delete(id)) return;
      const location = liveSessionLocation(root, resolveLocation);
      if (!location) return;
      const payload = buildHeadPrompt({ sessionID: id, agent: "head", root, location }).prompt;
      placeSessionContext(output.system, payload);
      const span = loadCompactedUserTurns(root, id);
      const turnsText = span?.sessionName === location.sessionName ? span.text : "";
      placeUserTurns(output.system, turnsText);
    },
    "experimental.session.compacting": async (input, output) => {
      const id = String(input?.sessionID || "");
      const location = liveSessionLocation(root, resolveLocation);
      if (!location) return;
      compactSystemCalls.add(id);
      const messages = await loadMessages(id);
      const checkpoint = lastCheckpointIso(historyTextFor(root, location.sessionName));
      const turns = userTurnsSince(messages, checkpoint);
      output.prompt = chooseCompactPrompt({
        userTurnsSinceCheckpoint: turns,
        checkpointResolved: checkpoint,
        runtime: "opencode",
      }).text;
      if (Array.isArray(output.context)) output.context.splice(0);
      if (messages) stagedSpans.set(id, stageCompactedTurns(id, location.sessionName, messages));
    },
    "experimental.compaction.autocontinue": async (input) => {
      const id = String(input?.sessionID || "");
      compactSystemCalls.delete(id);
      const staged = stagedSpans.get(id);
      if (staged) saveCompactedUserTurns(root, id, staged);
    },
    event: async ({ event }) => {
      const id = String(event?.properties?.sessionID || event?.properties?.info?.sessionID || "");
      if (event.type === "session.compacted") {
        compactSystemCalls.delete(id);
        const staged = stagedSpans.get(id);
        if (staged) {
          saveCompactedUserTurns(root, id, staged);
          stagedSpans.delete(id);
        }
        return;
      }
      if (event.type !== "session.idle") return;
      if (!pending.delete(id) || inFlight.has(id)) return;
      inFlight.add(id);
      try {
        const before = data(await client.session.messages({ path: { id } }));
        const model = latestUserModel(before);
        const result = data(await client.session.summarize({ path: { id }, body: { ...model, auto: true } }));
        if (result !== true) throw new Error("OpenCode compaction failed");
      } catch (error) {
        logRuntimeEvent("compact-recovery", { event: "tool_compact_failed", sessionID: id, error: String(error).slice(0, 300) }, root);
      } finally {
        inFlight.delete(id);
      }
    },
  };
};

export default Object.freeze({
  id: "head-core-compact-recovery",
  server: CompactRecovery,
});
