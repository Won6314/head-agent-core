#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recoverClaudeCompaction } from "../../../../head-runtime/claude/session-recovery.mjs";

export { recoverClaudeCompaction };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const prompt = recoverClaudeCompaction({ projectRoot: process.argv[2], sessionName: process.argv[3] });
  if (prompt) process.stdout.write(`${prompt}\n`);
}
