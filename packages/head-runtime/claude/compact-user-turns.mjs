#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectCompactedUserTurns,
  formatCompactedUserTurns,
  stamp,
} from "../shared/compact-policy.mjs";

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part && part.type === "text")
      .map((part) => String(part.text || ""))
      .join("\n");
  }
  return "";
}

function answerOf(content) {
  if (!Array.isArray(content)) return "";
  const out = [];
  for (const part of content) {
    if (!part || part.type !== "tool_result") continue;
    const inner = part.content;
    const body = typeof inner === "string" ? inner : textOf(inner);
    if (body.trimStart().startsWith("The user answered")) out.push(body.trim());
  }
  return out.join("\n");
}

function extractTurns(transcriptPath) {
  const spans = [[]];
  const raw = fs.readFileSync(transcriptPath, "utf8");
  for (const line of raw.split("\n")) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const kind = entry.type;
    if (kind === "system" && entry.subtype === "compact_boundary") {
      spans.push([]);
      continue;
    }
    if (kind !== "user" || entry.isMeta || entry.isCompactSummary) continue;
    const message = entry.message || {};
    if (message.role !== "user") continue;
    const content = message.content;
    const answer = answerOf(content);
    if (answer) {
      spans[spans.length - 1].push({ ts: stamp(Date.parse(entry.timestamp || "")), body: `(질문 답변) ${answer}` });
      continue;
    }
    const body = textOf(content).trim();
    if (!body) continue;
    if (body.startsWith("<command-name>/clear")) {
      spans.push([]);
      continue;
    }
    if (body.startsWith("<command-name>") || body.startsWith("<local-command")) continue;
    if (body.startsWith("[Request interrupted")) continue;
    if (/^\/[A-Za-z][\w-]*(\s|$)/.test(body)) continue;
    if (body.startsWith("This session is being continued from a previous conversation")) continue;
    spans[spans.length - 1].push({ ts: stamp(Date.parse(entry.timestamp || "")), body });
  }
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    if (spans[index].length) return spans[index];
  }
  return [];
}

export function runCompactUserTurns({ stdin } = {}) {
  let payload;
  try {
    payload = stdin !== undefined ? stdin : JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return "";
  }
  if (payload.source !== "compact") return "";
  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) return "";
  let turns;
  try {
    turns = collectCompactedUserTurns(extractTurns(transcriptPath));
  } catch {
    return "";
  }
  if (!turns.length) return "";
  return formatCompactedUserTurns(turns);
}

const THIS_FILE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  const text = runCompactUserTurns();
  if (text) process.stdout.write(text.endsWith("\n") ? `${text}\n` : `${text}\n\n`);
}
