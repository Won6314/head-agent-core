#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  chooseCompactPrompt,
  lastCheckpointIso,
} from "../shared/compact-policy.mjs";
import {
  detectHerdrLocation,
  projectRoot,
} from "../shared/context-composition.mjs";

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c && c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
}

export function userTurnsSince(transcriptPath, sinceIso) {
  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, "utf8");
  } catch {
    return -1;
  }
  const since = Date.parse(sinceIso);
  if (Number.isNaN(since)) return -1;
  let count = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== "user" || entry.isMeta || entry.isCompactSummary) continue;
    const message = entry.message || {};
    if (message.role !== "user") continue;
    const ts = Date.parse(entry.timestamp || "");
    if (Number.isNaN(ts) || ts <= since) continue;
    const content = message.content;
    if (Array.isArray(content) && content.some((c) => c && c.type === "tool_result")) {
      const answered = content.some(
        (c) => c && c.type === "tool_result" && typeof c.content === "string" && /"answers"\s*:/.test(c.content),
      );
      if (!answered) continue;
      count += 1;
      continue;
    }
    const body = textOf(content).trim();
    if (!body) continue;
    if (body.startsWith("<command-name>") || body.startsWith("<local-command")) continue;
    if (body.startsWith("[Request interrupted")) continue;
    if (/^\/[A-Za-z][\w-]*(\s|$)/.test(body)) continue;
    if (body.startsWith("This session is being continued from a previous conversation")) continue;
    count += 1;
  }
  return count;
}

function historyTextFor(root, sessionName) {
  const historyPath = path.join(root, ".claude", "agents", "head", "sessions", sessionName, "history.md");
  try {
    return fs.readFileSync(historyPath, "utf8");
  } catch {
    return "";
  }
}

export function chooseOverride({ root, sessionName, transcriptPath }) {
  if (!root || !sessionName) return chooseCompactPrompt({ runtime: "claude" });
  const checkpoint = lastCheckpointIso(historyTextFor(root, sessionName));
  if (!checkpoint || !transcriptPath) return chooseCompactPrompt({ runtime: "claude" });
  const turns = userTurnsSince(transcriptPath, checkpoint);
  return chooseCompactPrompt({
    userTurnsSinceCheckpoint: turns,
    checkpointResolved: checkpoint,
    runtime: "claude",
  });
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

export function runCompactionPrompt({ env = process.env, cwd = process.cwd(), stdin } = {}) {
  const root = projectRoot(env.PROJECT_ROOT || cwd);
  if (!root) return "";
  let sessionName = "";
  try {
    sessionName = String(detectHerdrLocation(env, undefined, root)?.sessionName || "");
  } catch {
    sessionName = "";
  }
  if (!/^[A-Za-z0-9._-]+$/.test(sessionName)) return "";
  const payload = stdin !== undefined ? stdin : readStdin();
  const chosen = chooseOverride({ root, sessionName, transcriptPath: payload.transcript_path || "" });
  if (env.COMPACTION_PROMPT_DEBUG) {
    process.stderr.write(`[compaction-prompt] mode=${chosen.mode} checkpoint=${chosen.checkpoint || "-"} turns=${chosen.turns ?? "-"}\n`);
  }
  return chosen.text;
}

const THIS_FILE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  const text = runCompactionPrompt();
  if (text) process.stdout.write(text);
}
