import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findCanonicalProjectRoot } from "./runtime-context.mjs";

test("nested role-local .claude directories do not hide the project runtime manifest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-project-root-"));
  const head = path.join(root, ".claude", "agents", "head");
  fs.mkdirSync(path.join(head, ".claude", "skills"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "head-runtime.json"), '{"version":1,"projectId":"proof"}\n');
  assert.equal(findCanonicalProjectRoot(head), root);
});
