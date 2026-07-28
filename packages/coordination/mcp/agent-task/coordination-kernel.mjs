import fs from "node:fs";
import path from "node:path";

export const COORDINATION_TOOL_NAMES = Object.freeze([
  "quick_task",
  "quick_task_control",
  "frozen_wave",
  "head_advisor_wave",
  "save_tip",
  "list_tips",
]);

const ROLE_NAME = /^[a-z][a-z0-9_-]*$/;
const MAX_POLICY_GUIDANCE_LENGTH = 2_000;
const contexts = new WeakSet();

function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function fail(message) {
  throw new TypeError(message);
}

function dispatchableWorkerRoleNames(projectRoot, workerRoleDirectories) {
  if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot)) fail("A host project root is required.");
  if (!workerRoleDirectories || Object.getPrototypeOf(workerRoleDirectories) !== Object.prototype) fail("Host dispatchable worker role directories must be a plain object.");
  const agentsRoot = path.join(fs.realpathSync(projectRoot), ".claude", "agents");
  const canonicalAgentsRoot = fs.realpathSync(agentsRoot);
  const roles = [];
  for (const [role, directory] of Object.entries(workerRoleDirectories)) {
    if (role === "head") fail("HEAD cannot be a dispatchable worker role.");
    if (!ROLE_NAME.test(role) || typeof directory !== "string" || !path.isAbsolute(directory)) fail("Host dispatchable worker role directories must be direct named directories.");
    const expected = path.join(canonicalAgentsRoot, role);
    if (path.resolve(directory) !== expected) fail("Host dispatchable worker role directories must be owned direct project role directories.");
    const entry = fs.lstatSync(directory);
    const canonical = fs.realpathSync(directory);
    if (!entry.isDirectory() || entry.isSymbolicLink() || canonical !== expected) {
      fail("Host dispatchable worker role directories must be owned direct project role directories.");
    }
    roles.push(role);
  }
  if (!roles.length) fail("At least one dispatchable worker role directory is required.");
  return roles.sort();
}

/**
 * Create the only context accepted by the inactive kernel. The host owns this
 * value; callers never provide it through a tool argument.
 */
export function createCoordinationContext({ projectRoot, workerRoleDirectories, policyGuidance = "", identity = null, state = null } = {}) {
  if (typeof policyGuidance !== "string" || policyGuidance.length > MAX_POLICY_GUIDANCE_LENGTH) fail("Project policy guidance must be a bounded string.");
  const context = immutable({
    projectRoot: fs.realpathSync(projectRoot),
    workerRoleNames: dispatchableWorkerRoleNames(projectRoot, workerRoleDirectories),
    policyGuidance: policyGuidance.trim(),
    identity,
    state,
  });
  contexts.add(context);
  return context;
}

function requireContext(context) {
  if (!contexts.has(context)) fail("A host-created coordination context is required.");
  return context;
}

const schemas = {
  quick_task: {
    type: "object",
    properties: {
      agent: { type: "string", description: "Target available worker role." },
      command: { type: "string", description: "Outcome-focused task instruction." },
      review_mode: { type: "string", description: "Optional worker mode." },
      runtime: { type: "string", enum: ["opencode", "claude"], description: "Optional execution runtime." },
      model: { type: "string", description: "Optional execution model override." },
    },
    required: ["agent", "command"],
  },
  quick_task_control: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Exact task ID." },
      action: { type: "string", enum: ["interrupt", "continue"] },
      strategy: { type: "string", enum: ["resume", "fork", "new"], description: "Required for continuation." },
      command: { type: "string", description: "Continuation instruction." },
    },
    required: ["task_id", "action"],
  },
  frozen_wave: {
    type: "object",
    properties: { manifest: { type: "object", description: "Complete declared wave manifest." } },
    required: ["manifest"],
  },
  head_advisor_wave: {
    type: "object",
    properties: {
      wave_id: { type: "string" },
      checkpoint_packet: { type: "string" },
      canonical_files: { type: "array", items: { type: "string" } },
      evidence_files: { type: "array", items: { type: "string" } },
    },
    required: ["wave_id", "checkpoint_packet"],
  },
  save_tip: {
    type: "object",
    properties: {
      text: { type: "string", description: "Short reusable guidance." },
      tags: { type: "array", items: { type: "string" }, description: "Categorization tags." },
      source_task: { type: "string", description: "Optional source task." },
    },
    required: ["text", "tags"],
  },
  list_tips: {
    type: "object",
    properties: {
      tags: { type: "array", items: { type: "string" }, description: "Optional tag filter." },
      query: { type: "string", description: "Optional query." },
    },
  },
};

export const CANONICAL_TOOL_TEMPLATES = immutable([
  { name: "quick_task", description: "Start one asynchronous task.", inputSchema: schemas.quick_task },
  { name: "quick_task_control", description: "Interrupt one running task or continue one terminal task.", inputSchema: schemas.quick_task_control },
  { name: "frozen_wave", description: "Start one declared deterministic task wave.", inputSchema: schemas.frozen_wave },
  { name: "head_advisor_wave", description: "Start one constrained advisor wave.", inputSchema: schemas.head_advisor_wave },
  { name: "save_tip", description: "Save reusable guidance.", inputSchema: schemas.save_tip },
  { name: "list_tips", description: "List reusable guidance.", inputSchema: schemas.list_tips },
]);

function discoveryTool(template, context) {
  const tool = structuredClone(template);
  if (tool.name === "quick_task") {
    tool.inputSchema.properties.agent.enum = [...context.workerRoleNames];
    if (context.policyGuidance) tool.description = `${tool.description}\n\nProject policy: ${context.policyGuidance}`;
  }
  return immutable(tool);
}

/** A construction-only registry and explicit handler dispatch boundary. */
export class CoordinationKernel {
  #handlers;

  constructor({ capabilities } = {}) {
    if (!Array.isArray(capabilities)) fail("Kernel capabilities must be an array.");
    const handlers = new Map();
    for (const capability of capabilities) {
      const { name, handler } = capability || {};
      if (!COORDINATION_TOOL_NAMES.includes(name) || typeof handler !== "function") fail("Each capability must name a canonical tool and handler.");
      if (handlers.has(name)) fail(`Duplicate capability: ${name}`);
      handlers.set(name, handler);
    }
    const missing = COORDINATION_TOOL_NAMES.filter((name) => !handlers.has(name));
    if (missing.length) fail(`Missing capabilities: ${missing.join(", ")}`);
    this.#handlers = handlers;
    Object.freeze(this);
  }

  tools(context) {
    const hostContext = requireContext(context);
    return immutable(CANONICAL_TOOL_TEMPLATES.map((template) => discoveryTool(template, hostContext)));
  }

  dispatch(name, args, context) {
    const hostContext = requireContext(context);
    const handler = this.#handlers.get(name);
    if (!handler) return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    return handler(args, hostContext);
  }
}
