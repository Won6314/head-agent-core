import test from "node:test";
import assert from "node:assert/strict";
import { moveHeadCoreFirst } from "./head-core-first.mjs";

test("current Core is split from runtime wrapper bundle and moved ahead of provider", () => {
  const core = "Instructions from: /core/HEAD_CORE.md\n# HEAD Core\nCORE\n\n";
  const project = "Instructions from: /project/CLAUDE.md\nPROJECT\n\n";
  const x = ["PROVIDER", project + core + "Instructions from: map.md\nMAP"];
  moveHeadCoreFirst(x);
  assert.equal(x[0], core);
  assert.equal(x[1], "PROVIDER");
  assert.equal(x[2], project + "Instructions from: map.md\nMAP");
  assert.deepEqual(moveHeadCoreFirst([...x]), x);
});

test("bare Core and legacy Principles are recognized, no-Core input unchanged", () => {
  for (const heading of ["# HEAD Core", "# HEAD Principles"]) assert.equal(moveHeadCoreFirst(["provider", heading])[0], heading);
  assert.deepEqual(moveHeadCoreFirst(["provider", "project"]), ["provider", "project"]);
});
