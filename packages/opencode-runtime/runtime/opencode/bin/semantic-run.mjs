import fs from "node:fs";
import path from "node:path";

const FORMAT = "semantic-plan-run";

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function pointerPath(runDirectory, pointer) {
  if (typeof pointer !== "string" || !pointer.trim() || path.isAbsolute(pointer)) return null;
  const candidate = path.resolve(runDirectory, pointer);
  const relative = path.relative(runDirectory, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  try {
    const metadata = fs.lstatSync(candidate);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return null;
    const resolved = fs.realpathSync(candidate);
    const root = fs.realpathSync(runDirectory);
    const resolvedRelative = path.relative(root, resolved);
    if (resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) return null;
    return { pointer, path: resolved, body: fs.readFileSync(resolved, "utf8") };
  } catch {
    return null;
  }
}

/** Validate and resolve the complete pointer-only semantic Run index. */
export function resolveSemanticRun(runDirectory, expectedRunId) {
  const pointerFile = path.join(runDirectory, "run.json");
  let source;
  try {
    const metadata = fs.lstatSync(pointerFile);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return { status: "corrupt" };
    source = { body: fs.readFileSync(pointerFile, "utf8") };
  } catch (error) {
    return error?.code === "ENOENT" ? { status: "absent" } : { status: "corrupt" };
  }
  let pointer;
  try { pointer = JSON.parse(source.body); } catch { return { status: "corrupt" }; }
  if (!exactKeys(pointer, ["format", "version", "runId", "runIndex", "latestCheckpoint", "currentExecutionContracts"])
    || pointer.format !== FORMAT || pointer.version !== 1 || pointer.runId !== expectedRunId
    || pointer.runIndex !== "run.md" || typeof pointer.latestCheckpoint !== "string" || !pointer.latestCheckpoint.startsWith("checkpoints/") || !Array.isArray(pointer.currentExecutionContracts)
    || pointer.currentExecutionContracts.some((value) => typeof value !== "string")
    || pointer.currentExecutionContracts.some((value) => !value.startsWith("execution-contracts/"))
    || new Set(pointer.currentExecutionContracts).size !== pointer.currentExecutionContracts.length) return { status: "corrupt" };

  const runIndex = pointerPath(runDirectory, pointer.runIndex);
  const latestCheckpoint = pointerPath(runDirectory, pointer.latestCheckpoint);
  const contracts = pointer.currentExecutionContracts.map((contract) => pointerPath(runDirectory, contract));
  if (!runIndex || !latestCheckpoint || contracts.some((contract) => !contract)) return { status: "corrupt" };
  return { status: "valid", pointer, runIndex, latestCheckpoint, contracts };
}

/** Read the terminal decision without creating a state projection or replaying history. */
export function semanticCheckpointDecision(runDirectory, expectedRunId) {
  const semantic = resolveSemanticRun(runDirectory, expectedRunId);
  if (semantic.status !== "valid") return null;
  const decision = semantic.latestCheckpoint.body.match(/^Decision:\s*(START|CONTINUE|LOCAL_CORRECTION|PLAN_CHANGE_REQUIRED|USER_DECISION|DONE|FAILED)\s*$/mi)?.[1] || "";
  const status = semantic.latestCheckpoint.body.match(/^Status:\s*([^\r\n]+)\s*$/mi)?.[1]?.trim() || "";
  return decision ? { decision, status } : null;
}
