#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectSessionRecovery } from "../shared/session-lifecycle.mjs";

/** Emit the packaged Session/Run projection for the Claude hook. */
export function recoverClaudeCompaction({ projectRoot, sessionName } = {}) {
  if (!projectRoot || !sessionName) return "";
  const recovery = projectSessionRecovery({
    headDirectory: path.join(projectRoot, ".claude", "agents", "head"),
    liveSessionName: sessionName,
  });
  return recovery?.legacy ? "" : recovery.prompt || "";
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const prompt = recoverClaudeCompaction({ projectRoot: process.argv[2], sessionName: process.argv[3] });
  if (prompt) process.stdout.write(`${prompt}\n`);
}
