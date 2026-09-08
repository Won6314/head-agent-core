import { parseHistoryEntries } from "./session-lifecycle.mjs";

export const POINTER =
  "이전 대화는 요약하지 않는다. 컴팩션 전 사용자 발화 원문과 세션 정본은 이 메시지 뒤의 자동 컨텍스트에 있고, 전체 기록은 transcript에 있다.";

export const BUDGET_CHARS = 20_000;
export const KEEP_FULL_TAIL = 5;
export const HEAD_CHARS = 300;
export const USER_TURNS_MARKER = "# 컴팩션된 구간의 사용자 발화 원문";

function commonTail(runtime) {
  return [
    ...(runtime === "claude" ? ["Keep <analysis> to one line."] : []),
    "Do not repeat or paraphrase what the user said (their turns are attached verbatim after this summary).",
    "Do not write next steps, pending tasks, recommendations, or any instruction about how to continue.",
  ];
}

function claudeWrap(innerLines) {
  return [
    "OVERRIDE FOR THIS SUMMARY: do not produce the numbered sections described above.",
    ...innerLines,
  ];
}

export function overridePointerOnly({ runtime = "opencode" } = {}) {
  const body = runtime === "claude"
    ? ["Inside <summary> write exactly this one line and nothing else:", POINTER, ...commonTail(runtime)]
    : ["Write exactly this one line as the entire summary and nothing else:", POINTER, ...commonTail(runtime)];
  return (runtime === "claude" ? claudeWrap(body) : body).join("\n");
}

export function overrideSinceCheckpoint(checkpointIso, userTurns, { runtime = "opencode" } = {}) {
  const progress = runtime === "claude"
    ? "what HEAD did, what it found or concluded, and what it was in the middle of"
    : "what was done, what was found or concluded, and what was in the middle of";
  const intro = runtime === "claude" ? "Inside <summary> write, in Korean:" : "Write, in Korean:";
  const body = [
    intro,
    `Line 1, exactly: ${POINTER}`,
    `Then a section headed "마지막 체크포인트(${checkpointIso}) 이후 진행분" covering ONLY what happened after that timestamp (${userTurns} user turn(s) since then).`,
    `In at most 8 short lines: ${progress} at the moment of compaction. Facts and results only, with file paths or identifiers where they matter.`,
    "Everything before that timestamp is already recorded in the session canon; do not summarise it.",
    ...commonTail(runtime),
  ];
  return (runtime === "claude" ? claudeWrap(body) : body).join("\n");
}

export function overrideCurrentOnly({ runtime = "opencode" } = {}) {
  const line2 = runtime === "claude"
    ? "Line 2: one sentence stating what HEAD was doing at the moment of compaction. Nothing else."
    : "Line 2: one sentence stating what was being done at the moment of compaction. Nothing else.";
  const intro = runtime === "claude" ? "Inside <summary> write, in Korean:" : "Write, in Korean:";
  const body = [intro, `Line 1, exactly: ${POINTER}`, line2, ...commonTail(runtime)];
  return (runtime === "claude" ? claudeWrap(body) : body).join("\n");
}

export function lastCheckpointIso(historyText) {
  const entries = parseHistoryEntries(historyText);
  return entries.length ? entries[entries.length - 1].timestamp : "";
}

export function chooseCompactPrompt({ userTurnsSinceCheckpoint, checkpointResolved, runtime = "opencode" } = {}) {
  const options = { runtime };
  if (!checkpointResolved) {
    return { mode: "current-only", text: overrideCurrentOnly(options) };
  }
  const turns = userTurnsSinceCheckpoint;
  if (!Number.isFinite(turns) || turns < 0) {
    return { mode: "current-only", checkpoint: checkpointResolved, turns, text: overrideCurrentOnly(options) };
  }
  if (turns === 0) {
    return { mode: "pointer-only", checkpoint: checkpointResolved, turns, text: overridePointerOnly(options) };
  }
  return {
    mode: "since-checkpoint",
    checkpoint: checkpointResolved,
    turns,
    text: overrideSinceCheckpoint(checkpointResolved, turns, options),
  };
}

export function stamp(time) {
  if (Number.isNaN(time)) return "--:--";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "--:--";
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

/** Fit already-extracted user turns to the compact budget. Runtime-agnostic. */
export function collectCompactedUserTurns(turns, budget = BUDGET_CHARS) {
  if (!Array.isArray(turns)) return [];
  const total = turns.reduce((sum, turn) => sum + String(turn.body || "").length, 0);
  if (total <= budget) return turns;
  const fitted = turns.map((turn) => ({ ...turn }));
  for (let index = 0; index < fitted.length - KEEP_FULL_TAIL; index += 1) {
    if (fitted[index].body.length > HEAD_CHARS) {
      fitted[index] = { ...fitted[index], body: `${fitted[index].body.slice(0, HEAD_CHARS)} …(생략)` };
    }
    if (fitted.reduce((sum, turn) => sum + turn.body.length, 0) <= budget) break;
  }
  return fitted;
}

export function formatCompactedUserTurns(turns) {
  if (!turns.length) return "";
  const lines = [
    "",
    "---",
    "",
    `${USER_TURNS_MARKER} (${turns.length}건, 시간순 UTC, 마지막 항목이 컴팩션 직전 지시)`,
    "",
  ];
  turns.forEach((turn, index) => {
    lines.push(`[${index + 1}] ${turn.ts}`);
    lines.push(turn.body);
    lines.push("");
  });
  return lines.join("\n");
}
