import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CANONICAL_TOOL_TEMPLATES, COORDINATION_TOOL_NAMES, CoordinationKernel, createCoordinationContext } from "./coordination-kernel.mjs";

function hostContext(workerRoles = ["developer"]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coordination-kernel-"));
  const workerRoleDirectories = {};
  for (const role of ["head", ...workerRoles]) {
    const directory = path.join(root, ".claude", "agents", role);
    fs.mkdirSync(directory, { recursive: true });
    if (role !== "head") workerRoleDirectories[role] = directory;
  }
  return createCoordinationContext({ projectRoot: root, workerRoleDirectories, identity: { caller: "host" }, state: { generation: 1 } });
}

function capabilities(calls = []) {
  return COORDINATION_TOOL_NAMES.map((name) => ({ name, handler: (args, context) => {
    calls.push({ name, args, context });
    return { name, args, context };
  } }));
}

function semanticSchema(tool) {
  const schema = structuredClone(tool.inputSchema);
  if (tool.name === "quick_task") delete schema.properties.agent.enum;
  return schema;
}

const expectedSchemas = {
  quick_task: { type: "object", properties: { agent: { type: "string" }, command: { type: "string" }, review_mode: { type: "string" }, runtime: { type: "string", enum: ["opencode", "claude"] }, model: { type: "string" } }, required: ["agent", "command"] },
  quick_task_control: { type: "object", properties: { task_id: { type: "string" }, action: { type: "string", enum: ["interrupt", "continue"] }, strategy: { type: "string", enum: ["resume", "fork", "new"] }, command: { type: "string" } }, required: ["task_id", "action"] },
  frozen_wave: { type: "object", properties: { manifest: { type: "object" } }, required: ["manifest"] },
  head_advisor_wave: { type: "object", properties: { wave_id: { type: "string" }, checkpoint_packet: { type: "string" }, canonical_files: { type: "array", items: { type: "string" } }, evidence_files: { type: "array", items: { type: "string" } } }, required: ["wave_id", "checkpoint_packet"] },
  save_tip: { type: "object", properties: { text: { type: "string" }, tags: { type: "array", items: { type: "string" } }, source_task: { type: "string" } }, required: ["text", "tags"] },
  list_tips: { type: "object", properties: { tags: { type: "array", items: { type: "string" } }, query: { type: "string" } } },
};

function stripDescriptions(value) {
  if (Array.isArray(value)) return value.map(stripDescriptions);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "description").map(([key, child]) => [key, stripDescriptions(child)]));
}

test("registry preserves the six current public schema contracts in canonical order", () => {
  assert.deepEqual(CANONICAL_TOOL_TEMPLATES.map((tool) => tool.name), COORDINATION_TOOL_NAMES);
  assert.deepEqual(Object.fromEntries(CANONICAL_TOOL_TEMPLATES.map((tool) => [tool.name, stripDescriptions(semanticSchema(tool))])), expectedSchemas);
});

test("host worker context and bounded policy compose discovery without changing contracts", () => {
  const context = hostContext(["reviewer", "developer"]);
  const kernel = new CoordinationKernel({ capabilities: capabilities() });
  const tools = kernel.tools(createCoordinationContext({
    projectRoot: context.projectRoot,
    workerRoleDirectories: Object.fromEntries(context.workerRoleNames.map((role) => [role, path.join(context.projectRoot, ".claude", "agents", role)])),
    policyGuidance: "Use the project review boundary.",
  }));
  const quick = tools[0];
  assert.deepEqual(quick.inputSchema.properties.agent.enum, ["developer", "reviewer"]);
  assert.equal(quick.inputSchema.properties.agent.enum.includes("head"), false);
  assert.match(quick.description, /Project policy: Use the project review boundary\.$/);
  assert.deepEqual(stripDescriptions(semanticSchema(quick)), expectedSchemas.quick_task);
  assert.deepEqual(tools.slice(1).map((tool) => tool.name), COORDINATION_TOOL_NAMES.slice(1));
});

test("discovery and host context are immutable", () => {
  const context = hostContext();
  const tools = new CoordinationKernel({ capabilities: capabilities() }).tools(context);
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(tools));
  assert.ok(Object.isFrozen(tools[0].inputSchema.properties.agent.enum));
  assert.throws(() => { tools.push({}); }, TypeError);
  assert.throws(() => { context.identity.caller = "caller"; }, TypeError);
  assert.equal(new CoordinationKernel({ capabilities: capabilities() }).tools(context)[0].inputSchema.properties.agent.enum[0], "developer");
});

test("worker authority rejects empty, HEAD, symlinked, and unowned directory sets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coordination-kernel-"));
  const agentsRoot = path.join(root, ".claude", "agents");
  const developer = path.join(agentsRoot, "developer");
  const head = path.join(agentsRoot, "head");
  const outside = path.join(root, "outside");
  fs.mkdirSync(developer, { recursive: true });
  fs.mkdirSync(head, { recursive: true });
  fs.mkdirSync(outside);
  assert.throws(() => createCoordinationContext({ projectRoot: root, workerRoleDirectories: {} }), /At least one dispatchable worker role directory/);
  assert.throws(() => createCoordinationContext({ projectRoot: root, workerRoleDirectories: { head } }), /HEAD cannot be a dispatchable worker role/);
  assert.throws(() => createCoordinationContext({ projectRoot: root, workerRoleDirectories: { developer: outside } }), /owned direct project role directories/);
  fs.rmSync(developer, { recursive: true });
  fs.symlinkSync(outside, developer);
  assert.throws(() => createCoordinationContext({ projectRoot: root, workerRoleDirectories: { developer } }), /owned direct project role directories/);
});

test("each canonical name dispatches only its injected handler", () => {
  const calls = [], context = hostContext(), kernel = new CoordinationKernel({ capabilities: capabilities(calls) });
  for (const name of COORDINATION_TOOL_NAMES) assert.equal(kernel.dispatch(name, { target: name }, context).name, name);
  assert.deepEqual(calls.map((call) => call.name), COORDINATION_TOOL_NAMES);
  assert.ok(calls.every((call) => call.context === context));
});

test("missing and duplicate capabilities are rejected and unknown tools retain terminal meaning", () => {
  assert.throws(() => new CoordinationKernel({ capabilities: capabilities().slice(1) }), /Missing capabilities/);
  assert.throws(() => new CoordinationKernel({ capabilities: [...capabilities(), capabilities()[0]] }), /Duplicate capability/);
  const result = new CoordinationKernel({ capabilities: capabilities() }).dispatch("not_a_tool", {}, hostContext());
  assert.deepEqual(result, { content: [{ type: "text", text: "Unknown tool: not_a_tool" }] });
});

test("base registry bytes contain no source product role, model route, API, or storage presentation", () => {
  const source = fs.readFileSync(new URL("./coordination-kernel.mjs", import.meta.url), "utf8");
  for (const forbidden of ["NoahChat", "Qdrant", "chat_quality_reviewer", "character_chat_platform_auditor", "gpt-5", "Herdr"]) assert.equal(source.includes(forbidden), false, forbidden);
});
