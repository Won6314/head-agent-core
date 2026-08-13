import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("outcome-shaping is released for installed Skill discovery without test artifacts", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repository, "release-manifest.json"), "utf8"));
  const durableSkills = manifest.packages.find((pkg) => pkg.name === "durable-skills");
  assert.ok(durableSkills.paths.includes("packages/skills/outcome-shaping"));
  assert.equal(fs.existsSync(path.join(repository, "packages/skills/outcome-shaping/SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(repository, "packages/procedures/outcome-shaping/problem-to-result.md")), true);
  assert.equal(fs.existsSync(path.join(repository, "packages/skills/outcome-shaping/outcome-shaping-release.test.mjs")), true);
});
