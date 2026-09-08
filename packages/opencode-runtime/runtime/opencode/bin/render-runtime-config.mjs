#!/usr/bin/env node
// moved to packages/head-runtime/shared/context-composition.mjs
export * from "../../../../head-runtime/shared/context-composition.mjs";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const THIS_FILE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
  const target = path.resolve(path.dirname(THIS_FILE), "../../../../head-runtime/shared/context-composition.mjs");
  const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}
