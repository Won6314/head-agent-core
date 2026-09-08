import assert from "node:assert/strict";
import test from "node:test";
import {
  BUDGET_CHARS,
  HEAD_CHARS,
  KEEP_FULL_TAIL,
  POINTER,
  chooseCompactPrompt,
  collectCompactedUserTurns,
  lastCheckpointIso,
  overrideCurrentOnly,
  overridePointerOnly,
  overrideSinceCheckpoint,
} from "./compact-policy.mjs";
import { parseHistoryEntries } from "./session-lifecycle.mjs";

test("lastCheckpointIso uses parseHistoryEntries and accepts run: suffixes", () => {
  const text = [
    "## 2026-09-01T00:00:00Z",
    "",
    "session checkpoint",
    "",
    "## 2026-09-01T01:00:00Z run:active-run",
    "",
    "run checkpoint",
    "",
  ].join("\n");
  const entries = parseHistoryEntries(text);
  assert.equal(entries.length, 2);
  assert.equal(entries[1].runId, "active-run");
  assert.equal(lastCheckpointIso(text), "2026-09-01T01:00:00Z");
  assert.equal(lastCheckpointIso(""), "");
});

test("chooseCompactPrompt branches pointer-only, since-checkpoint, and current-only", () => {
  const checkpoint = "2026-09-01T00:00:00.000Z";
  assert.equal(chooseCompactPrompt({}).mode, "current-only");
  assert.equal(chooseCompactPrompt({ checkpointResolved: checkpoint, userTurnsSinceCheckpoint: 0 }).mode, "pointer-only");
  assert.equal(chooseCompactPrompt({ checkpointResolved: checkpoint, userTurnsSinceCheckpoint: 2 }).mode, "since-checkpoint");
  assert.equal(chooseCompactPrompt({ checkpointResolved: checkpoint, userTurnsSinceCheckpoint: -1 }).mode, "current-only");
  assert.equal(
    chooseCompactPrompt({ checkpointResolved: checkpoint, userTurnsSinceCheckpoint: 0 }).text,
    overridePointerOnly(),
  );
  assert.equal(
    chooseCompactPrompt({ checkpointResolved: checkpoint, userTurnsSinceCheckpoint: 2 }).text,
    overrideSinceCheckpoint(checkpoint, 2),
  );
  assert.equal(chooseCompactPrompt({}).text, overrideCurrentOnly());
});

test("runtime wrapping keeps Claude override/summary/analysis and OpenCode unwrapped body", () => {
  const claude = overridePointerOnly({ runtime: "claude" });
  const opencode = overridePointerOnly({ runtime: "opencode" });
  assert.match(claude, /OVERRIDE FOR THIS SUMMARY/);
  assert.match(claude, /Inside <summary>/);
  assert.match(claude, /Keep <analysis> to one line/);
  assert.doesNotMatch(opencode, /OVERRIDE FOR THIS SUMMARY/);
  assert.doesNotMatch(opencode, /Keep <analysis>/);
  assert.match(opencode, new RegExp(POINTER));
  assert.equal(BUDGET_CHARS, 20_000);
  assert.equal(KEEP_FULL_TAIL, 5);
  assert.equal(HEAD_CHARS, 300);
});

test("collectCompactedUserTurns shortens older long turns under the budget", () => {
  const long = "x".repeat(8_000);
  const turns = Array.from({ length: 8 }, (_, index) => ({ ts: "01-01 00:00", body: index < 3 ? long : "short" }));
  const fitted = collectCompactedUserTurns(turns);
  assert.match(fitted[0].body, /…\(생략\)$/);
  assert.equal(fitted[0].body.length, HEAD_CHARS + " …(생략)".length);
  assert.equal(fitted[fitted.length - 1].body, "short");
});
