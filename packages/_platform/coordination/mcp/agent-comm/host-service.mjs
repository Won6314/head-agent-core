import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RuntimeContextError, resolveProjectRuntimeContext, runWithRuntimeContext, requireRuntimeContext, assertNoSymlinkAncestors } from "../agent-task/runtime-context.mjs";

const ROLE = /^[a-z][a-z0-9_]{0,63}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const fail = (code, message) => { throw new RuntimeContextError(code, message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function atomic(file, value) {
  const root = requireRuntimeContext().paths.hostStateRoot;
  assertNoSymlinkAncestors(file, { trustedRoot: root });
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  assertNoSymlinkAncestors(temporary, { trustedRoot: root });
  fs.renameSync(temporary, file);
}
function read(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return null; }
}
function role(value) { if (!ROLE.test(String(value || ""))) fail("INVALID_AGENT_ROLE", "An exact agent role is required."); return value; }
function id(value) { if (!ID.test(String(value || ""))) fail("INVALID_MESSAGE_ID", "An exact message ID is required."); return value; }
function same(left, right, fields) { return fields.every((field) => left?.[field] === right?.[field]); }

export class HostAgentCommService {
  constructor({ bindingRegistry, validateCaller, resolveRole, runtime, clock = () => new Date().toISOString(), now = Date.now, wait = sleep, write = atomic } = {}) {
    if (!bindingRegistry || typeof bindingRegistry.withActiveAuthority !== "function" || typeof validateCaller !== "function" || typeof resolveRole !== "function" || !runtime) fail("INVALID_AGENT_COMM_SERVICE", "Binding, caller, role, and Herdr delivery dependencies are required.");
    Object.assign(this, { bindingRegistry, validateCaller, resolveRole, runtime, clock, now, wait, write });
  }
  #env(request, fn) {
    const live = this.validateCaller(request?.caller);
    if (!live || !same(live, request?.caller, ["socket", "workspaceId", "tabId", "paneId", "terminalId", "cwd"])) fail("STALE_CALLER", "The supplied Herdr comm caller is no longer the exact live pane.");
    const initial = resolveProjectRuntimeContext({ caller: live, cwd: live.cwd, bindingRegistry: this.bindingRegistry });
    return this.bindingRegistry.withActiveAuthority({ ...initial.binding, authorityGeneration: request.authorityGeneration }, () => runWithRuntimeContext(resolveProjectRuntimeContext({ caller: live, cwd: live.cwd, bindingRegistry: this.bindingRegistry }), () => fn({ context: requireRuntimeContext(), live, generation: request.authorityGeneration })));
  }
  #root() { const context = requireRuntimeContext(); const root = path.join(context.paths.agentCommStateDir, "v1"); assertNoSymlinkAncestors(root, { trustedRoot: context.paths.hostStateRoot }); return root; }
  #file(...parts) { const context = requireRuntimeContext(), file = path.join(this.#root(), ...parts); assertNoSymlinkAncestors(file, { trustedRoot: context.paths.hostStateRoot }); return file; }
  #role(context, live) {
    const value = role(this.resolveRole({ context, live }));
    const agents = path.join(context.projectRoot, ".claude", "agents"), agent = path.join(agents, value);
    try { if (!fs.lstatSync(agent).isDirectory() || fs.lstatSync(agent).isSymbolicLink() || fs.realpathSync(path.dirname(agent)) !== fs.realpathSync(agents)) fail("UNTRUSTED_ROLE", "The resolved role is not a direct project agent."); } catch (error) { if (error instanceof RuntimeContextError) throw error; fail("UNTRUSTED_ROLE", "The resolved role is not a direct project agent."); }
    return value;
  }
  #message(to, messageId) { return this.#file("inboxes", role(to), `${id(messageId)}.json`); }
  #reply(from, messageId) { return this.#file("replies", role(from), `${id(messageId)}.json`); }
  #read(to, messageId) { return this.#file("reads", role(to), `${id(messageId)}.json`); }
  #target(to) { return this.#file("targets", `${role(to)}.json`); }
  #owned(record, context, generation) { return record && record.projectId === context.manifest.projectId && record.projectRoot === context.projectRoot && record.workspaceId === context.workspace.id && record.authorityGeneration === generation; }
  #projectOwned(record, context, generation) { return record && record.projectId === context.manifest.projectId && record.projectRoot === context.projectRoot && record.authorityGeneration === generation; }
  initialize(request) {
    return this.#env(request, (env) => {
      const currentRole = this.#role(env.context, env.live);
      const target = { role: currentRole, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, socket: env.live.socket, tabId: env.live.tabId, paneId: env.live.paneId, terminalId: env.live.terminalId, cwd: env.live.cwd, attachedAt: this.clock() };
      this.write(this.#target(currentRole), target);
      return target;
    });
  }
  async send(request, { self, to, content, context_files = [], wait_reply = false, timeout_sec = 3600, poll_interval_sec = 5, idempotency_key } = {}) {
    if (self !== undefined) fail("SPOOFED_IDENTITY", "Sender role is host-owned.");
    role(to); if (typeof content !== "string" || !content || !Array.isArray(context_files) || context_files.some((item) => typeof item !== "string" || !item.trim())) fail("INVALID_MESSAGE", "Recipient, content, and context_files are required in canonical form.");
    if (typeof wait_reply !== "boolean" || !Number.isFinite(timeout_sec) || timeout_sec < 1 || !Number.isFinite(poll_interval_sec)) fail("INVALID_WAIT", "Wait bounds are invalid.");
    const key = String(idempotency_key || request?.operationId || ""); if (!ID.test(key)) fail("IDEMPOTENCY_KEY_REQUIRED", "A host operation ID or idempotency_key is required.");
    const created = await this.#env(request, async (env) => {
      const from = this.#role(env.context, env.live), requestFile = this.#file("requests", from, `${key}.json`);
      const fingerprint = JSON.stringify({ from, to, content, context_files, wait_reply, timeout_sec, poll_interval_sec });
      const replay = read(requestFile);
      if (replay) { if (!this.#owned(replay, env.context, env.generation)) fail("STALE_AUTHORITY_GENERATION", "The idempotency record belongs to a different authority generation."); if (replay.fingerprint !== fingerprint) fail("IDEMPOTENCY_CONFLICT", "The idempotency key was used for a different send."); return replay.result; }
      const messageId = crypto.createHash("sha256").update(`${env.context.manifest.projectId}\0${env.generation}\0${key}`).digest("hex").slice(0, 32);
      const message = { id: messageId, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, from, to, content, context_files, sent_at: this.clock() };
      this.write(this.#message(to, messageId), message);
      const result = { message_id: messageId }; this.write(requestFile, { projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, fingerprint, result });
      if (wait_reply) this.write(this.#file("waits", `${messageId}.json`), { ...message, deadlineMs: this.now() + Math.min(timeout_sec, 14400) * 1000, status: "pending" });
      await this.#notify(env, message);
      return result;
    });
    return wait_reply ? this.#waitForReply(request, created.message_id, to, Math.max(2, Math.min(poll_interval_sec, 30))) : created;
  }
  async #notify(env, message) {
    const claim = this.#file("deliveries", `${message.id}.json`);
    if (read(claim)) return;
    this.write(claim, { ...message, status: "claimed", claimedAt: this.clock() });
    const target = read(this.#target(message.to));
    if (!this.#projectOwned(target, env.context, env.generation) || target.role !== message.to) return;
    const live = this.validateCaller(target);
    if (!live || !same(live, target, ["socket", "workspaceId", "tabId", "paneId", "terminalId", "cwd"])) return;
    const current = read(this.#target(message.to));
    if (!same(current, target, ["role", "projectId", "projectRoot", "workspaceId", "authorityGeneration", "socket", "tabId", "paneId", "terminalId", "cwd"])) return;
    const text = Buffer.from(`[from ${message.from} msg:${message.id}] ${message.content.replace(/[\r\n]+/g, " ")}`).subarray(0, 8192).toString("utf8");
    if (typeof this.runtime.invokeVoid !== "function") return;
    try { this.runtime.invokeVoid(live.socket, ["pane", "send-text", live.paneId, text]); this.runtime.invokeVoid(live.socket, ["pane", "send-keys", live.paneId, "Enter"]); this.write(claim, { ...message, status: "delivered", deliveredAt: this.clock() }); } catch { this.write(claim, { ...message, status: "ambiguous", completedAt: this.clock() }); }
  }
  async #waitForReply(request, messageId, recipient, pollMs) {
    while (true) {
      const state = this.#env(request, (env) => read(this.#file("waits", `${messageId}.json`)));
      if (!state) fail("MESSAGE_NOT_FOUND", "No exact durable wait exists in this workspace.");
      if (this.now() >= state.deadlineMs) { this.#env(request, () => this.write(this.#file("waits", `${messageId}.json`), { ...state, status: "timed_out", timedOutAt: this.clock() })); fail("REPLY_TIMEOUT", "No reply was received before the timeout."); }
      const response = this.#env(request, (env) => { const reply = read(this.#reply(this.#role(env.context, env.live), messageId)); if (!this.#projectOwned(reply, env.context, env.generation) || reply.from !== recipient) return null; this.write(this.#file("waits", `${messageId}.json`), { ...state, status: "completed", completedAt: this.clock() }); return { reply: reply.content, from: reply.from, replied_at: reply.replied_at }; });
      if (response) return response;
      await this.wait(Math.min(pollMs * 1000, Math.max(0, state.deadlineMs - this.now())));
    }
  }
  readInbox(request, { self, unread_only = true } = {}) {
    if (self !== undefined || typeof unread_only !== "boolean") fail("INVALID_READ", "Sender role is host-owned and unread_only must be boolean.");
    return this.#env(request, (env) => {
      const currentRole = this.#role(env.context, env.live), directory = this.#file("inboxes", currentRole); let names = []; try { names = fs.readdirSync(directory).sort(); } catch {}
      const messages = [];
      for (const name of names.filter((entry) => entry.endsWith(".json"))) { const messageId = name.slice(0, -5), message = read(this.#message(currentRole, messageId)); if (!this.#projectOwned(message, env.context, env.generation) || message.to !== currentRole) continue; const marker = read(this.#read(currentRole, messageId)), wasRead = !!this.#owned(marker, env.context, env.generation); if (unread_only && wasRead) continue; messages.push({ id: message.id, from: message.from, content: message.content, context_files: message.context_files, sent_at: message.sent_at, read: wasRead }); if (!wasRead) this.write(this.#read(currentRole, messageId), { id: messageId, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, read_at: this.clock() }); }
      return messages.sort((left, right) => left.sent_at.localeCompare(right.sent_at) || left.id.localeCompare(right.id));
    });
  }
  reply(request, { self, in_reply_to, content } = {}) {
    if (self !== undefined) fail("SPOOFED_IDENTITY", "Sender role is host-owned."); id(in_reply_to); if (typeof content !== "string" || !content) fail("INVALID_REPLY", "Reply content is required.");
    return this.#env(request, (env) => { const currentRole = this.#role(env.context, env.live), message = read(this.#message(currentRole, in_reply_to)); if (!this.#projectOwned(message, env.context, env.generation) || message.to !== currentRole) fail("MESSAGE_NOT_FOUND", "No exact message exists in this workspace."); const file = this.#reply(message.from, in_reply_to), prior = read(file); if (prior) { if (prior.content !== content || prior.from !== currentRole) fail("REPLY_IMMUTABLE", "A conflicting reply already exists."); return prior; } const reply = { in_reply_to, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, from: currentRole, to: message.from, content, replied_at: this.clock() }; this.write(file, reply); return reply; });
  }
}
