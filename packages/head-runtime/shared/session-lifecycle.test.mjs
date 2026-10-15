import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseHistoryEntries, projectSessionRecovery, selectStartEntries } from "./session-lifecycle.mjs";

function fixture({ entries = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "recovery-"));
  const session = path.join(root, "sessions", "sample");
  fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(session, "context.md"), "CONTEXT\n");
  if (entries.length) {
    const body = entries.map((item, index) => {
      const stamp = `2026-01-01T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}Z`;
      const tokens = [stamp, ...(item.work ? [`work:${item.work}`] : []), ...(item.runId ? [`run:${item.runId}`] : [])].join(" ");
      return `## ${tokens}\n\n${item.body}\n${item.next ? `\n다음: ${item.next}\n` : ""}`;
    }).join("\n");
    fs.writeFileSync(path.join(session, "history.md"), body);
  }
  return { root, session, recover: () => projectSessionRecovery({ headDirectory: root, liveSessionName: "sample" }) };
}

test("parseHistoryEntries reads work labels, legacy run stamps, and titled headings", () => {
  const entries = parseHistoryEntries("## 2026-01-01T00:00:00Z work:memory-redesign\n\nA\n\n## 2026-01-01T00:00:01Z run:active\n\nB\n\n## 2026-01-01T00:00:02Z work:x run:active\n\nC\n\n## 2026-07-08: Titled entry\n\nD\n");
  assert.deepEqual(entries.map((entry) => [entry.timestamp, entry.work, entry.runId, entry.label]), [
    ["2026-01-01T00:00:00Z", "memory-redesign", "", "memory-redesign"],
    ["2026-01-01T00:00:01Z", "", "active", "active"],
    ["2026-01-01T00:00:02Z", "x", "active", "x"],
    ["2026-07-08:", "", "", ""],
  ]);
  assert.match(entries[3].body, /^## 2026-07-08: Titled entry\n\nD$/);
});

test("Session start loads context, the current work chain (first + last 10) and the recent window, in time order", (t) => {
  const entries = [
    ...[0, 1, 2, 3].map((n) => ({ body: `A-${n}`, work: "alpha" })),
    ...[4, 5].map((n) => ({ body: `U-${n}` })),
    ...Array.from({ length: 14 }, (_, i) => ({ body: `B-${i + 6}`, work: "beta", next: `after B-${i + 6}` })),
  ];
  const data = fixture({ entries }); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(data.session, "progress.md"), "PROGRESS\n");
  const recovery = data.recover();
  assert.deepEqual(recovery.metadata.loadedPaths, ["context.md", "history.md"]);
  assert.equal(recovery.metadata.work, "beta");
  assert.equal(recovery.metadata.historyEntries, 20);
  assert.equal(recovery.metadata.loadedEntries, 11);
  assert.match(recovery.prompt, /history: 20 entries, latest 2026-01-01T00:00:19Z \(read_history\)/);
  assert.match(recovery.prompt, /work: beta \(14 entries\)/);
  assert.match(recovery.prompt, /loaded_entries: 11 of 20/);
  assert.match(recovery.prompt, /cursor: 다음: after B-19/);
  assert.match(recovery.prompt, /CONTEXT[\s\S]*B-6\b[\s\S]*B-10\b[\s\S]*B-19\b/);
  for (const absent of ["A-0", "A-3", "U-4", "U-5", "B-7", "B-8", "B-9", "PROGRESS"]) assert.doesNotMatch(recovery.prompt, new RegExp(`\\b${absent}\\b`));
  assert.doesNotMatch(recovery.prompt, /active_job|progress\.md/);
  const order = ["B-6", "B-10", "B-15", "B-19"].map((marker) => recovery.prompt.indexOf(`\n${marker}\n`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("body headings belong to the preceding dated entry, including legacy dated titles", () => {
  const text = "## 2026-07-08: Titled entry\n\n## 조사\n\n자료 A.\n\n## 2026-07-09 Legacy title\n\n## 결론\n\n자료 B.\n\n## 2026-09-30T12:00:00.000Z work:recall\n\n## 목표와 합의\n\n본문.\n\n## 근거\n\n[자료](evidence/result.md)\n\n다음: 완료\n";
  const entries = parseHistoryEntries(text);
  assert.equal(entries.length, 3);
  assert.ok(entries[0].body.includes("## 조사\n\n자료 A."));
  assert.ok(entries[1].body.includes("## 결론\n\n자료 B."));
  assert.equal(entries[2].work, "recall");
  assert.ok(entries[2].body.includes("[자료](evidence/result.md)"));
  const memory = selectStartEntries(entries);
  assert.equal(memory.latest, "2026-09-30T12:00:00.000Z");
  assert.equal(memory.work, "recall");
  assert.equal(memory.cursor, "다음: 완료");
});

test("an unlabeled last entry loads only the recent window", (t) => {
  const data = fixture({ entries: [{ body: "L-0", work: "alpha" }, { body: "L-1", work: "alpha" }, { body: "L-2", work: "alpha" }, { body: "L-3", work: "alpha" }, { body: "L-4", work: "alpha" }, { body: "L-5", work: "alpha" }, { body: "N-6" }] });
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const recovery = data.recover();
  assert.match(recovery.prompt, /work: none/);
  assert.match(recovery.prompt, /loaded_entries: 5 of 7/);
  assert.match(recovery.prompt, /cursor: none/);
  assert.match(recovery.prompt, /L-2[\s\S]*L-5[\s\S]*N-6/);
  assert.doesNotMatch(recovery.prompt, /L-0|L-1/);
});

test("a legacy run stamp counts as the work label", (t) => {
  const data = fixture({ entries: [{ body: "S-0" }, { body: "R-1", runId: "old-run" }, { body: "S-2" }, { body: "S-3" }, { body: "S-4" }, { body: "S-5" }, { body: "S-6" }, { body: "R-7", runId: "old-run" }] });
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const recovery = data.recover();
  assert.match(recovery.prompt, /work: old-run \(2 entries\)/);
  assert.match(recovery.prompt, /R-1[\s\S]*S-3[\s\S]*R-7/);
  assert.equal(recovery.metadata.loadedEntries, 6);
});

test("empty history recovers context only", (t) => {
  const data = fixture(); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const recovery = data.recover();
  assert.equal(recovery.metadata.mode, "session");
  assert.deepEqual(recovery.metadata.loadedPaths, ["context.md"]);
  assert.match(recovery.prompt, /CONTEXT/);
  assert.match(recovery.prompt, /history: 0 entries \(read_history\)/);
  assert.match(recovery.prompt, /work: none/);
});

test("job pointer, progress.md, session-state.json and runs/ are records only and are not loaded", (t) => {
  const data = fixture({ entries: [{ body: "ENTRY", work: "x" }] });
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const id = "20260907-parity";
  fs.mkdirSync(path.join(data.session, "jobs", id), { recursive: true });
  fs.writeFileSync(path.join(data.session, "jobs", "active.json"), JSON.stringify({ id }));
  fs.writeFileSync(path.join(data.session, "jobs", id, "job.md"), "# job\n\n## 문제\nPROBLEM\n");
  fs.writeFileSync(path.join(data.session, "progress.md"), "PROGRESS\n");
  fs.writeFileSync(path.join(data.session, "session-state.json"), JSON.stringify({ schema: 1, generation: 3, mode: "run", activeRun: { id: "old", path: "runs/old" } }));
  fs.mkdirSync(path.join(data.session, "runs", "old", "checkpoints"), { recursive: true });
  fs.writeFileSync(path.join(data.session, "runs", "old", "run.md"), "RUN-CANON\n");
  fs.writeFileSync(path.join(data.session, "runs", "old", "checkpoints", "0001.md"), "CHECKPOINT-CANON\n");
  const recovery = data.recover();
  assert.match(recovery.prompt, /CONTEXT[\s\S]*ENTRY/);
  assert.doesNotMatch(recovery.prompt, /PROBLEM|PROGRESS|active_job|RUN-CANON|CHECKPOINT-CANON|^mode:|active_run/m);
  assert.deepEqual(recovery.metadata.loadedPaths, ["context.md", "history.md"]);
});

test("history junk or checkpoint junk does not empty Session recovery", (t) => {
  const cases = [
    (data) => { fs.mkdirSync(path.join(data.session, "checkpoints"), { recursive: true }); fs.writeFileSync(path.join(data.session, "checkpoints", "transaction.json"), "{}"); },
    (data) => fs.writeFileSync(path.join(data.session, "history.md"), "TAMPERED"),
  ];
  for (const mutate of cases) {
    const data = fixture({ entries: [{ body: "ENTRY", work: "x" }] });
    mutate(data);
    const recovery = data.recover();
    assert.equal(recovery.metadata.mode, "session");
    assert.match(recovery.prompt, /CONTEXT/);
    assert.doesNotMatch(recovery.prompt, /ledger|slice/i);
    fs.rmSync(data.root, { recursive: true, force: true });
  }
});

test("selectStartEntries is pure and bounded", () => {
  const entries = Array.from({ length: 40 }, (_, i) => ({ timestamp: `t${i}`, work: "w", runId: "", label: "w", body: `## t${i} work:w\n\nE${i}\n\n다음: go ${i}` }));
  const memory = selectStartEntries(entries);
  assert.equal(memory.selected.length, 11);
  assert.equal(memory.selected[0].timestamp, "t0");
  assert.equal(memory.selected[10].timestamp, "t39");
  assert.equal(memory.cursor, "다음: go 39");
  assert.deepEqual(selectStartEntries([]), { total: 0, latest: "", work: "", chainCount: 0, selected: [], cursor: "" });
});
