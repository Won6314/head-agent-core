import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.join(directory, relative), "utf8");

test("installed Problem-to-Result sources connect the required primary model", () => {
  const skill = read("SKILL.md");
  const procedure = read("../../procedures/outcome-shaping/problem-to-result.md");
  const devShaping = read("../dev-system-shaping/SKILL.md");
  const delegateOnce = read("../delegate-once/SKILL.md");
  const developer = read("../../agents/developer/DEVELOPER_CORE.md");
  const coder = read("../../agents/coder/CODER_CORE.md");

  assert.match(skill, /current\/needed-state problem/);
  assert.match(procedure, /Non-software result/);
  assert.match(procedure, /Selected Solution/);
  assert.match(procedure, /Result Graph/);
  assert.match(devShaping, /specialization of \[outcome-shaping\]/);
  assert.match(delegateOnce, /required observable output or state/);
  assert.match(developer, /local diagnosis and solution method/);
  assert.match(coder, /materially divergent observable behavior remains possible/);
});
