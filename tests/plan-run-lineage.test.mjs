import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const phaseShape = (relative) => {
  const value = text(relative);
  assert.deepEqual([...value.matchAll(/^## (.+)$/gm)].map((match) => match[1]), ["Trigger", "Exact reads", "Authority", "Produced result", "Mutation class", "Next consumer"]);
};

test("plan-run is packaged and Core routes Runs through it before B uses start-run", () => {
  const paths = JSON.parse(text("release-manifest.json")).packages.flatMap((entry) => entry.paths);
  assert.ok(paths.includes("packages/skills/plan-run"));
  const core = text("packages/core/head/HEAD_CORE.md");
  assert.ok(core.indexOf("`plan-run`") < core.indexOf("`start-run`"));
  assert.match(core, /immutable `A`, then migrates the one live mainline HEAD from planning `P` to an `A`-derived execution successor `B`/);
});

test("plan-run router selects exact lineage support files without phase bodies", () => {
  const router = text("packages/skills/plan-run/SKILL.md");
  const phases = ["anchor-operations.md", "capture-a.md", "contract-a-prime.md", "generation-loop.md", "finalize-A.md", "activate-B.md"];
  for (const phase of phases) assert.match(router, new RegExp(`\\[${phase}\\]\\(${phase}\\)`));
  assert.doesNotMatch(router, /^## Trigger$/m);
  for (const phase of phases) phaseShape(`packages/skills/plan-run/${phase}`);
  assert.match(text("packages/skills/plan-run/anchor-operations.md"), /Never use `save_as` for exploration/);
  assert.match(text("packages/skills/plan-run/contract-a-prime.md"), /raw planning conversation/);
  assert.match(text("packages/skills/plan-run/contract-a-prime.md"), /only the exact accepted Plan Contract/);
  assert.match(text("packages/skills/plan-run/contract-a-prime.md"), /validation evidence, not anchor content/);
  assert.match(text("packages/skills/plan-run/generation-loop.md"), /Do not promote the candidate session/);
});

test("start-run phase files have one owner each", () => {
  const phases = ["prepare-run.md", "activate-run.md", "checkpoint-run.md", "recover-run.md", "finish-run.md"];
  const router = text("packages/skills/start-run/SKILL.md");
  for (const phase of phases) { assert.match(router, new RegExp(`\\[${phase}\\]\\(${phase}\\)`)); phaseShape(`packages/skills/start-run/${phase}`); }
  const combined = phases.map((phase) => text(`packages/skills/start-run/${phase}`)).join("\n");
  assert.equal((combined.match(/head_session\(action = "start_run"/g) || []).length, 1);
  assert.equal((combined.match(/head_session\(action = "finish_run"/g) || []).length, 1);
  assert.equal((combined.match(/latest valid Run ledger governs/g) || []).length, 1);
  assert.match(text("packages/skills/start-run/prepare-run.md"), /There is no `A` or `B` yet/);
  assert.match(text("packages/skills/start-run/activate-run.md"), /already contains valid Run canon/);
  assert.doesNotMatch(text("packages/skills/start-run/activate-run.md"), /Record the evidence in the prepared Run canon/);
});

test("delegate-task phase files have one owner and no workflow duplicate", () => {
  const phases = ["prepare-slice.md", "schedule.md", "dispatch.md", "integrate-result.md"];
  const router = text("packages/skills/delegate-task/SKILL.md");
  for (const phase of phases) { assert.match(router, new RegExp(`\\[${phase}\\]\\(${phase}\\)`)); phaseShape(`packages/skills/delegate-task/${phase}`); }
  const combined = phases.map((phase) => text(`packages/skills/delegate-task/${phase}`)).join("\n");
  assert.equal((combined.match(/select `coder` and load `delegate-coder`/g) || []).length, 1);
  assert.equal((combined.match(/Multiple branches are independently ready/g) || []).length, 1);
  assert.equal((combined.match(/Only active execution successor `B` may dispatch/g) || []).length, 1);
  assert.equal((combined.match(/Worker returns, tests, and reviews are evidence, not authority/g) || []).length, 1);
  assert.match(text("packages/skills/delegate-task/prepare-slice.md"), /During final `A` preparation, stop after the Slice is ready/);
  assert.equal(fs.existsSync(path.join(root, "packages/skills/delegate-task/workflow/delegate-task.md")), false);
});
