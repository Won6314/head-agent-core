import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { completeItem, focusItem, isValidPortfolio, listItems, openItem } from "../runtime/opencode/bin/work-items.mjs";

function checkpoint() {
  return {
    id: "cp-0007", at: "2026-07-27T00:00:00Z", horizon: { slice: null, wave: null }, expected: "start",
    observed: "paused", evidence: ["run.md"], decision: { type: "CONTINUE", reason: "test" },
    next: { output: "resume", slice: null, wave: null },
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "work-items-"));
  const session = path.join(root, ".claude/agents/head/sessions/paused-run");
  fs.mkdirSync(path.join(session, "ledger"), { recursive: true });
  fs.writeFileSync(path.join(session, "run.md"), "paused run\n");
  fs.writeFileSync(path.join(session, "ledger/0007.json"), `${JSON.stringify(checkpoint(), null, 2)}\n`);
  return { root, session };
}

test("open, focus, complete preserves the latest ledger return reference and one active focus", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const runBefore = fs.readFileSync(path.join(state.session, "run.md"));
  const ledgerBefore = fs.readFileSync(path.join(state.session, "ledger/0007.json"));

  const opened = openItem(state.root, { id: "side-proof", title: "Verify side work", source: "user" });
  assert.equal(opened.status, "open");
  const focused = focusItem(state.root, { id: "side-proof", session: "paused-run" });
  assert.equal(focused.status, "active");
  assert.deepEqual(focused.returnReference, {
    session: "paused-run",
    checkpoint: { path: ".claude/agents/head/sessions/paused-run/ledger/0007.json", id: "cp-0007" },
  });

  openItem(state.root, { id: "later", title: "Later work" });
  assert.throws(() => focusItem(state.root, { id: "later", session: "paused-run" }), /active focus already exists/);
  const completed = completeItem(state.root);
  assert.equal(completed.item.status, "done");
  assert.deepEqual(completed.returnReference, focused.returnReference);
  assert.equal(listItems(state.root).activeFocus, null);
  assert.deepEqual(fs.readFileSync(path.join(state.session, "run.md")), runBefore);
  assert.deepEqual(fs.readFileSync(path.join(state.session, "ledger/0007.json")), ledgerBefore);
});

test("portfolio writes are atomic and invalid explicit input fails", (t) => {
  const state = fixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  openItem(state.root, { id: "atomic", title: "Atomic item" });
  const portfolioPath = path.join(state.root, ".claude/agents/head/work-items.json");
  const portfolio = JSON.parse(fs.readFileSync(portfolioPath, "utf8"));
  assert.ok(isValidPortfolio(portfolio));
  assert.equal(fs.readdirSync(path.dirname(portfolioPath)).filter((entry) => entry.endsWith(".tmp")).length, 0);
  assert.throws(() => openItem(state.root, { id: "", title: "Missing ID" }), /id is required/);
});
