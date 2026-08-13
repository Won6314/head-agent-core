import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("semantic plan-run routing has complete current links and no alphabet roles", () => {
  const skill = read("skills/plan-run/SKILL.md");
  for (const name of ["Planner", "Problem Baseline", "Plan Draft", "Accepted Plan Baseline", "Runner", "Execution Contract", "Produced Result", "Worker Report/Evidence", "Checkpoint Reviewer", "Checkpoint"]) assert.match(skill, new RegExp(name));
  for (const relative of [...skill.matchAll(/\]\((\.\.\/\.\.\/procedures\/[^)]+)\)/g)].map((match) => match[1].replace("../../procedures/", "procedures/"))) assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
  const current = [
    "skills/plan-run/SKILL.md",
    "procedures/README.md",
    "core/theory/context-management/instruction-routing-map.md",
    "core/theory/context-management/ko/instruction-routing-map.md",
    ...fs.readdirSync(path.join(root, "procedures/plan-run/planning")).map((name) => `procedures/plan-run/planning/${name}`),
    ...fs.readdirSync(path.join(root, "procedures/plan-run/results")).map((name) => `procedures/plan-run/results/${name}`),
    ...fs.readdirSync(path.join(root, "procedures/plan-run/run")).map((name) => `procedures/plan-run/run/${name}`),
  ].map(read).join("\n");
  assert.doesNotMatch(current, /(?:Capture A|Contract A Prime|Finalize A|Activate B|\bimmutable A\b|\bexecution B\b|\bplanning P\b|\ba′\b)/);
  assert.match(read("procedures/plan-run/run/apply-checkpoint.md"), /CONTINUE[\s\S]*LOCAL_CORRECTION[\s\S]*correction delta[\s\S]*PLAN_CHANGE_REQUIRED[\s\S]*USER_DECISION[\s\S]*DONE[\s\S]*FAILED/);
  assert.equal(fs.existsSync(path.join(root, "procedures/plan-run/results/integrate-result.md")), false);
});

test("current plan-run procedure links resolve", () => {
  const directories = ["planning", "results", "run", "workers"];
  for (const directory of directories) for (const name of fs.readdirSync(path.join(root, "procedures/plan-run", directory))) {
    const relative = `procedures/plan-run/${directory}/${name}`;
    const source = read(relative);
    for (const target of [...source.matchAll(/\]\(([^:)#]+\.md)\)/g)].map((match) => match[1])) {
      assert.equal(fs.existsSync(path.resolve(path.dirname(path.join(root, relative)), target)), true, `${relative} -> ${target}`);
    }
  }
});
