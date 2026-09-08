import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSessionTransitions } from "./session-transitions.mjs";
import { resolveSemanticRun } from "./semantic-run.mjs";

const write = (file, body) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); };
const pointer = (contracts, checkpoint) => JSON.stringify({ format: "semantic-plan-run", version: 1, runId: "semantic-proof", runIndex: "run.md", latestCheckpoint: `checkpoints/${checkpoint}`, currentExecutionContracts: contracts.map((name) => `execution-contracts/${name}`) });

test("semantic Run completes dependent Results, recovers at the next Contract, then returns to Session", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-run-e2e-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const head = path.join(root, ".claude", "agents", "head"), session = path.join(head, "sessions", "proof"), run = path.join(session, "runs", "semantic-proof");
  const plan = `# Accepted Plan Baseline\nProblem Definition: prospective attendees cannot determine venue accessibility.\nGoal/Evidence: attendees can read an accessibility notice.\nAlternatives and user decision: short notice selected over a venue-map campaign.\nSelected Solution: publish a short accessibility notice.\nConsumable Result Graph: R1 publish notice → R2 confirm attendee delivery.\n`;
  write(path.join(session, "context.md"), plan);
  write(path.join(session, "session-state.json"), JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }));
  write(path.join(run, "run.md"), "# Semantic proof\nPlanner: saved-planner\n");
  write(path.join(run, "checkpoints", "0000.md"), "# Checkpoint\nDecision: START\nStatus: READY\n");
  write(path.join(run, "execution-contracts", "r1.md"), "# Execution Contract R1\nFrozen input: accepted Plan.\nResult: publish accessibility notice.\n");
  write(path.join(run, "run.json"), pointer(["r1.md"], "0000.md"));

  for (const claim of ["Problem Definition", "Goal/Evidence", "Alternatives and user decision", "Selected Solution", "Consumable Result Graph"]) assert.match(plan, new RegExp(claim));

  const transition = createSessionTransitions({ headDirectory: head, identity: { live: () => ({ sessionName: "proof" }) }, binding: { read: () => ({ sessionName: "proof" }) } });
  assert.deepEqual(transition({ action: "start_run", sessionID: "ses_proof", run_id: "semantic-proof" }), { ok: true, session: "proof", mode: "run", activeRun: "semantic-proof", generation: 1 });
  assert.equal(resolveSemanticRun(run, "semantic-proof").contracts[0].body.includes("R1"), true);

  write(path.join(run, "produced-results", "r1.md"), "Published accessibility notice for prospective attendees.\n");
  write(path.join(run, "worker-reports", "r1.md"), "Worker Report/Evidence: produced-results/r1.md consumed by attendees.\n");
  write(path.join(run, "checkpoints", "0001.md"), "# Checkpoint\nDecision: CONTINUE\nStatus: R1_ACCEPTED\n");
  write(path.join(run, "execution-contracts", "r2.md"), "# Execution Contract R2\nFrozen input: accepted R1 result.\nResult: confirm consumer delivery.\n");
  write(path.join(run, "run.json"), pointer(["r2.md"], "0001.md"));
  const recovered = resolveSemanticRun(run, "semantic-proof");
  assert.equal(recovered.latestCheckpoint.body.includes("CONTINUE"), true);
  assert.equal(recovered.contracts[0].body.includes("R2"), true);

  write(path.join(run, "produced-results", "r2.md"), "Prospective attendees received the notice.\n");
  write(path.join(run, "worker-reports", "r2.md"), "Worker Report/Evidence: produced-results/r2.md.\n");
  write(path.join(run, "checkpoints", "0002.md"), "# Checkpoint\nDecision: DONE\nStatus: TERMINAL\n");
  write(path.join(run, "run.json"), pointer([], "0002.md"));
  assert.deepEqual(transition({ action: "finish_run", sessionID: "ses_proof", session_handoff: "Semantic proof completed." }), { ok: true, session: "proof", mode: "session", activeRun: null, generation: 2 });
  assert.equal(JSON.parse(fs.readFileSync(path.join(session, "session-state.json"))).mode, "session");
});
