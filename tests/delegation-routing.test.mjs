import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("HEAD routes development shaping and exactly named delegation levels", () => {
  const core = text("packages/core/head/HEAD_CORE.md");
  assert.match(core, /load `dev-system-shaping`/i);
  assert.match(core, /load `delegate-once`/);
  assert.match(core, /load `start-run`/);
  assert.match(core, /level is unclear, execute directly/i);
});

test("one-shot and Run delegation follow separate skill chains", () => {
  const once = text("packages/skills/delegate-once/SKILL.md");
  const run = text("packages/skills/start-run/SKILL.md");
  const task = text("packages/skills/delegate-task/SKILL.md");
  assert.match(once, /load `delegate-developer`/);
  assert.doesNotMatch(once, /delegate-coder/);
  assert.match(run, /load `delegate-task`/);
  assert.match(task, /select `coder` and load `delegate-coder`/i);
  assert.doesNotMatch(task, /select `developer`/i);
});

test("skill discovery descriptions expose exclusive entry points before loading", () => {
  assert.match(text("packages/skills/delegate-once/SKILL.md"), /description: Use only when HEAD Core selects the one-shot delegation level/);
  assert.match(text("packages/skills/start-run/SKILL.md"), /description: Use only when HEAD Core selects the Run delegation level/);
  assert.match(text("packages/skills/delegate-task/SKILL.md"), /description: Do not use for Session one-shots; load only from start-run or an active Run/);
  assert.match(text("packages/skills/delegate-developer/SKILL.md"), /description: Do not load directly; load only from delegate-once/);
  assert.match(text("packages/skills/delegate-coder/SKILL.md"), /description: Do not load directly; load only from delegate-task/);
});

test("developer and coder have distinct authority contracts", () => {
  const developer = text("packages/agents/developer/DEVELOPER_CORE.md");
  const coder = text("packages/agents/coder/CODER_CORE.md");
  assert.match(developer, /one bounded one-shot implementation outcome/i);
  assert.match(coder, /fully decided Run contract/i);
  assert.match(coder, /Do not add uncontracted validation, fallback, recovery/i);
  assert.match(coder, /contract is incomplete/i);
});

test("base release includes every delegation skill and the agent package", () => {
  const manifest = JSON.parse(text("release-manifest.json"));
  const paths = manifest.packages.flatMap((entry) => entry.paths);
  for (const relative of [
    "packages/skills/delegate-once",
    "packages/skills/delegate-developer",
    "packages/skills/delegate-task",
    "packages/skills/delegate-coder",
    "packages/skills/dev-system-shaping",
    "packages/agents",
  ]) assert.ok(paths.includes(relative), relative);
});
