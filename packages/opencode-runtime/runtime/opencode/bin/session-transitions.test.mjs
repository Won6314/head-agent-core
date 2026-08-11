import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionTransitions } from "./session-transitions.mjs";

function checkpoint({ type, status, slice }) {
  return {
    id: "checkpoint-0001",
    at: "2026-08-11T00:00:00Z",
    horizon: { slice: "slices/01-work.md", wave: null },
    expected: "complete the active slice",
    observed: "user stopped the Run",
    evidence: [],
    decision: { type, ...(status ? { status } : {}), reason: "test decision" },
    next: { output: "no further work", slice, wave: null },
  };
}

function activeRun({ decision }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-session-transition-"));
  const headDirectory = path.join(root, "head");
  const sessionName = "active-session";
  const sessionDirectory = path.join(headDirectory, "sessions", sessionName);
  const runID = "active-run";
  const runDirectory = path.join(sessionDirectory, "runs", runID);
  fs.mkdirSync(path.join(runDirectory, "ledger"), { recursive: true });
  fs.writeFileSync(path.join(sessionDirectory, "session-state.json"), `${JSON.stringify({ schema: 1, generation: 4, mode: "run", activeRun: { id: runID, path: `runs/${runID}` } })}\n`);
  fs.writeFileSync(path.join(runDirectory, "ledger", "0001.json"), `${JSON.stringify(decision)}\n`);
  const transition = createSessionTransitions({
    headDirectory,
    identity: { live: () => ({ sessionName }) },
    binding: { read: () => ({ sessionName }) },
  });
  return { sessionDirectory, transition };
}

test("stop_run returns a user-authorized stopped Run to Session mode", () => {
  const { sessionDirectory, transition } = activeRun({
    decision: checkpoint({ type: "USER_DECISION", status: "STOPPED", slice: null }),
  });

  assert.deepEqual(transition({ action: "stop_run", sessionID: "ses_test", session_handoff: "Return to Session mode." }), {
    ok: true, session: "active-session", mode: "session", activeRun: null, generation: 5,
  });
  assert.equal(fs.readFileSync(path.join(sessionDirectory, "progress.md"), "utf8"), "Return to Session mode.");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(sessionDirectory, "session-state.json"), "utf8")), {
    schema: 1, generation: 5, mode: "session", activeRun: null,
  });
});

test("stop_run rejects a Run without the exact stopped ledger decision", () => {
  const { sessionDirectory, transition } = activeRun({
    decision: checkpoint({ type: "USER_DECISION", status: "STOPPED", slice: "slices/02-unowned-work.md" }),
  });
  const before = fs.readFileSync(path.join(sessionDirectory, "session-state.json"), "utf8");

  assert.deepEqual(transition({ action: "stop_run", sessionID: "ses_test", session_handoff: "Return to Session mode." }), {
    ok: false, code: "RUN_NOT_USER_STOPPED",
  });
  assert.equal(fs.readFileSync(path.join(sessionDirectory, "session-state.json"), "utf8"), before);
  assert.equal(fs.existsSync(path.join(sessionDirectory, "progress.md")), false);
});

test("finish_run retains its terminal DONE transition", () => {
  const { sessionDirectory, transition } = activeRun({
    decision: checkpoint({ type: "DONE", slice: null }),
  });

  assert.deepEqual(transition({ action: "finish_run", sessionID: "ses_test", session_handoff: "Run finished." }), {
    ok: true, session: "active-session", mode: "session", activeRun: null, generation: 5,
  });
  assert.equal(fs.readFileSync(path.join(sessionDirectory, "progress.md"), "utf8"), "Run finished.");
});
