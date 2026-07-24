import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RuntimeContextError, resolveProjectRuntimeContext, runWithRuntimeContext, requireRuntimeContext, assertNoSymlinkAncestors } from "../agent-task/runtime-context.mjs";

const ROLE = /^[a-z][a-z0-9_]{0,63}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const SESSION = /^ses_[A-Za-z0-9_-]+$/;
const fail = (code, message) => { throw new RuntimeContextError(code, message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const same = (left, right, fields) => fields.every((field) => left?.[field] === right?.[field]);

function atomic(file, record) {
  const root = requireRuntimeContext().paths.hostStateRoot;
  assertNoSymlinkAncestors(file, { trustedRoot: root });
  assertNoSymlinkAncestors(path.dirname(file), { trustedRoot: root });
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  assertNoSymlinkAncestors(temporary, { trustedRoot: root });
  fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  assertNoSymlinkAncestors(file, { trustedRoot: root });
  validateAtomicTemp(temporary, root);
  fs.renameSync(temporary, file);
}
export function validateAtomicTemp(temporary, root) { assertNoSymlinkAncestors(temporary, { trustedRoot: root }); let entry; try { entry = fs.lstatSync(temporary); } catch { fail("PATH_ESCAPE", "Atomic temporary file disappeared before rename."); } if (!entry.isFile() || entry.isSymbolicLink() || (entry.mode & 0o777) !== 0o600 || entry.nlink !== 1 || (typeof process.getuid === "function" && entry.uid !== process.getuid())) fail("PATH_ESCAPE", "Atomic temporary file was replaced or has unsafe ownership/mode."); }
function validRole(role) { if (!ROLE.test(String(role || ""))) fail("INVALID_AGENT_ROLE", "An exact agent role is required."); return role; }
function validId(id) { if (!ID.test(String(id || ""))) fail("INVALID_MESSAGE_ID", "An exact message ID is required."); return id; }
function directFile(file) {
  try {
    const directory = fs.lstatSync(path.dirname(file)), entry = fs.lstatSync(file);
    return directory.isDirectory() && !directory.isSymbolicLink() && (directory.mode & 0o777) === 0o700 && entry.isFile() && !entry.isSymbolicLink() && (entry.mode & 0o777) === 0o600 && entry.nlink === 1 && (typeof process.getuid !== "function" || (directory.uid === process.getuid() && entry.uid === process.getuid()));
  } catch { return false; }
}
function readRecord(file) {
  if (!directFile(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function removeDirect(file) { const root = requireRuntimeContext().paths.hostStateRoot; assertNoSymlinkAncestors(file, { trustedRoot: root }); if (directFile(file)) { assertNoSymlinkAncestors(file, { trustedRoot: root }); fs.unlinkSync(file); } }
function targetKey(target) { return crypto.createHash("sha256").update(`${target.socket}\0${target.paneId}`).digest("hex"); }
function targetFields() { return ["role", "projectId", "projectRoot", "workspaceId", "authorityGeneration", "socket", "tabId", "paneId", "terminalId", "cwd", "directory", "sessionID", "serverUrl", "token"]; }
function validUrl(value) { try { const url = new URL(value); return url.protocol === "http:" && url.hostname === "127.0.0.1" && !!url.port && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password; } catch { return false; } }
function validTarget(record, { context, role, generation } = {}) {
  if (!record || record.version !== 1 || !targetFields().every((key) => typeof record[key] === "string" && record[key])) return false;
  if (!TOKEN.test(record.token) || !SESSION.test(record.sessionID) || !Number.isFinite(record.updatedAtMs) || !validUrl(record.serverUrl)) return false;
  if (context && (record.projectId !== context.manifest.projectId || record.projectRoot !== context.projectRoot || record.workspaceId !== context.workspace.id)) return false;
  return (!role || record.role === role) && (!generation || record.authorityGeneration === generation);
}
function validateWaitInput({ wait_reply = false, timeout_sec = 3600, poll_interval_sec = 5 } = {}) {
  if (!wait_reply) return { timeout_sec, poll_interval_sec };
  if (typeof timeout_sec !== "number" || !Number.isFinite(timeout_sec) || timeout_sec < 1) return { error: "'timeout_sec' must be a finite number of at least 1 when wait_reply is true; values above 14400 are clamped" };
  if (typeof poll_interval_sec !== "number" || !Number.isFinite(poll_interval_sec)) return { error: "'poll_interval_sec' must be a finite number when wait_reply is true" };
  return { timeout_sec: Math.min(timeout_sec, 14400), poll_interval_sec: Math.max(2, Math.min(poll_interval_sec, 30)) };
}
function validateEscalation(escalation) {
  if (escalation === undefined) return null;
  const allowed = ["type", "blocked_decision", "required_authority", "affected_outputs"];
  if (!escalation || typeof escalation !== "object" || Array.isArray(escalation) || Object.keys(escalation).length !== allowed.length || Object.keys(escalation).some((key) => !allowed.includes(key)) || allowed.some((key) => !(key in escalation))) return "'escalation' must contain exactly type, blocked_decision, required_authority, and affected_outputs";
  if (escalation.type !== "AUTHORITY_GAP") return "'escalation.type' must be AUTHORITY_GAP";
  if (typeof escalation.blocked_decision !== "string" || !escalation.blocked_decision.trim()) return "'escalation.blocked_decision' must be a non-empty string";
  if (!Array.isArray(escalation.required_authority) || !escalation.required_authority.length || escalation.required_authority.some((item) => typeof item !== "string" || !item.trim())) return "'escalation.required_authority' must be a non-empty array of non-empty strings";
  if (!Array.isArray(escalation.affected_outputs) || escalation.affected_outputs.some((item) => typeof item !== "string" || !item.trim())) return "'escalation.affected_outputs' must be an array of non-empty strings";
  return null;
}
const provisional = (generation) => String(generation).startsWith("provisional-");
const syntheticAllowed = (generation, tag) => !provisional(generation) || tag === `synthetic:${generation}`;

export function createNativeDelivery({ runtime, fetchImpl = fetch, now = Date.now, timeoutMs = 30000 } = {}) {
  if (!runtime || typeof runtime.livePane !== "function" || typeof runtime.invoke !== "function") throw new TypeError("A Herdr runtime is required.");
  return ({ context, generation, target, id, content, self }) => {
    if (!validTarget(target, { context, generation })) return "unavailable";
    const root = path.join(context.paths.agentCommStateDir, "v1", "opencode-targets");
    const file = path.join(root, `${targetKey(target)}.json`);
    const roleFile = path.join(root, `${target.role}.json`);
    assertNoSymlinkAncestors(file, { trustedRoot: context.paths.hostStateRoot }); assertNoSymlinkAncestors(roleFile, { trustedRoot: context.paths.hostStateRoot });
    const current = readRecord(file), roleCurrent = readRecord(roleFile);
    if (!current || !roleCurrent || !same(current, target, targetFields()) || !same(roleCurrent, target, targetFields()) || current.updatedAtMs > now() || now() - current.updatedAtMs > 5000) return "unavailable";
    const live = runtime.livePane(target, { expectedCwd: target.cwd });
    if (!live || !same(live, target, ["socket", "workspaceId", "tabId", "paneId", "terminalId"])) return "unavailable";
    let pane; try { pane = runtime.invoke(live.socket, ["pane", "get", live.paneId]); } catch { return "unavailable"; }
    const value = pane?.result?.pane || pane?.result || pane?.pane || pane;
    if (value?.agent !== "opencode" || value?.agent_session?.source !== "herdr:opencode" || value?.agent_session?.value !== target.sessionID) return "unavailable";
    // Re-read both aliases directly before POST.  Registration, heartbeat, or
    // revoke can only cause unavailable/fallback, never a POST using an old capability.
    assertNoSymlinkAncestors(file, { trustedRoot: context.paths.hostStateRoot }); assertNoSymlinkAncestors(roleFile, { trustedRoot: context.paths.hostStateRoot }); const final = readRecord(file), finalRole = readRecord(roleFile);
    if (!final || !finalRole || !same(final, target, targetFields()) || !same(finalRole, target, targetFields()) || final.authorityGeneration !== generation) return "unavailable";
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetchImpl(`${target.serverUrl}/session/${encodeURIComponent(target.sessionID)}/prompt_async?directory=${encodeURIComponent(target.directory)}`, { method: "POST", redirect: "error", headers: { "content-type": "application/json", authorization: `Bearer ${target.token}` }, body: JSON.stringify({ messageID: `msg_agentcomm_${String(id).replace(/[^A-Za-z0-9]/g, "")}`, parts: [{ type: "text", text: `[from ${self} msg:${id}] ${content.replace(/[\r\n]+/g, " ")}` }] }), signal: controller.signal }).then((response) => response.status === 204 ? "accepted" : "ambiguous", () => "ambiguous").finally(() => clearTimeout(timer));
  };
}

export class HostAgentCommService {
  constructor({ bindingRegistry, validateCaller, resolveRole, verifyTarget, nativeDeliver = async () => "unavailable", terminalDeliver = async () => false, clock = () => new Date().toISOString(), wait = sleep, write = atomic, now = Date.now } = {}) {
    if (!bindingRegistry || typeof bindingRegistry.withActiveAuthority !== "function" || typeof validateCaller !== "function" || typeof resolveRole !== "function" || typeof verifyTarget !== "function") fail("INVALID_AGENT_COMM_SERVICE", "Binding, caller, host-owned role, and target verifier dependencies are required.");
    Object.assign(this, { bindingRegistry, validateCaller, resolveRole, verifyTarget, nativeDeliver, terminalDeliver, clock, wait, write, now });
  }
  #env(request, fn) {
    const live = this.validateCaller(request?.caller);
    if (!live || ["socket", "workspaceId", "tabId", "paneId"].some((key) => live[key] !== request?.caller?.[key])) fail("STALE_CALLER", "The supplied Herdr caller is no longer the exact live pane.");
    const initial = resolveProjectRuntimeContext({ caller: live, cwd: live.cwd, bindingRegistry: this.bindingRegistry });
    if (!syntheticAllowed(request.authorityGeneration, request.syntheticTag)) fail("PROVISIONAL_SYNTHETIC_TAG_REQUIRED", "A provisional authority generation permits only its exact synthetic tag.");
    return this.bindingRegistry.withActiveAuthority({ ...initial.binding, authorityGeneration: request.authorityGeneration }, () => runWithRuntimeContext(resolveProjectRuntimeContext({ caller: live, cwd: live.cwd, bindingRegistry: this.bindingRegistry }), () => fn({ context: requireRuntimeContext(), live, generation: request.authorityGeneration })));
  }
  #root() { const context = requireRuntimeContext(); const root = path.join(context.paths.agentCommStateDir, "v1"); assertNoSymlinkAncestors(root, { trustedRoot: context.paths.hostStateRoot }); return root; }
  #checked(file) { const context = requireRuntimeContext(); assertNoSymlinkAncestors(file, { trustedRoot: context.paths.hostStateRoot }); return file; }
  #role(context, live) {
    const role = validRole(this.resolveRole({ context, live })), agents = path.join(context.projectRoot, ".claude", "agents"), agent = path.join(agents, role);
    let entry; try { entry = fs.lstatSync(agent); } catch { fail("UNTRUSTED_ROLE", "The resolved role is not a direct project agent."); }
    if (!entry.isDirectory() || entry.isSymbolicLink() || fs.realpathSync(path.dirname(agent)) !== fs.realpathSync(agents)) fail("UNTRUSTED_ROLE", "The resolved role is not a direct project agent.");
    return role;
  }
  #roleDir(role) { return this.#checked(path.join(this.#root(), "inboxes", validRole(role))); }
  #message(role, id) { return this.#checked(path.join(this.#roleDir(role), `${validId(id)}.json`)); }
  #reply(role, id) { return this.#checked(path.join(this.#roleDir(role), `${validId(id)}.reply.json`)); }
  #read(role, id) { return this.#checked(path.join(this.#roleDir(role), `${validId(id)}.read`)); }
  #scoped(record, context, role, id) { return !!record && record.id === id && record.to === role && record.projectId === context.manifest.projectId && record.projectRoot === context.projectRoot && record.workspaceId === context.workspace.id && ID.test(String(record.authorityGeneration || "")); }
  #waitFile(id) { return this.#checked(path.join(this.#root(), "waits", `${id}.json`)); }
  #waitRecord(file, context, id, generation) { const record = readRecord(file); return record && record.id === id && record.projectId === context.manifest.projectId && record.projectRoot === context.projectRoot && record.workspaceId === context.workspace.id && record.authorityGeneration === generation && Number.isFinite(record.deadlineMs) && ["pending", "completed", "timed_out"].includes(record.status) ? record : null; }
  #replyRecord(file, context, id, generation, from) { const record = readRecord(file), fields = ["in_reply_to", "projectId", "projectRoot", "workspaceId", "authorityGeneration", "from", "content", "replied_at"]; return record && Object.keys(record).sort().join(",") === fields.sort().join(",") && record.in_reply_to === id && record.projectId === context.manifest.projectId && record.projectRoot === context.projectRoot && record.workspaceId === context.workspace.id && record.authorityGeneration === generation && record.from === from && typeof record.content === "string" && !!record.content && typeof record.replied_at === "string" && !!record.replied_at ? record : null; }
  #requestRecord(file, context, generation) { const record = readRecord(file); return record && record.projectId === context.manifest.projectId && record.projectRoot === context.projectRoot && record.workspaceId === context.workspace.id && record.authorityGeneration === generation ? record : null; }
  #targetFile(role) { return this.#checked(path.join(this.#root(), "opencode-targets", `${role}.json`)); }
  #targetKeyFile(target) { return this.#checked(path.join(this.#root(), "opencode-targets", `${targetKey(target)}.json`)); }
  #recipientTarget(env, role) {
    const record = readRecord(this.#targetFile(role));
    return validTarget(record, { context: env.context, role, generation: env.generation }) && record.updatedAtMs <= this.now() && this.now() - record.updatedAtMs <= 5000 ? record : null;
  }
  async send(request, { self, herdr_target, to, content, context_files = [], wait_reply = false, timeout_sec = 3600, poll_interval_sec = 5, escalation, idempotency_key } = {}) {
    if (self !== undefined || herdr_target !== undefined) fail("SPOOFED_IDENTITY", "Sender role and delivery target are host-owned.");
    validRole(to); if (typeof content !== "string" || !content || !Array.isArray(context_files) || context_files.some((item) => typeof item !== "string" || !item.trim())) fail("INVALID_MESSAGE", "Recipient, content, and context_files are required in canonical form.");
    const waitInput = validateWaitInput({ wait_reply, timeout_sec, poll_interval_sec }); if (waitInput.error) fail("INVALID_WAIT", waitInput.error);
    const escalationError = validateEscalation(escalation); if (escalationError) fail("INVALID_ESCALATION", escalationError);
    const key = String(idempotency_key || request?.operationId || ""); if (!ID.test(key)) fail("IDEMPOTENCY_KEY_REQUIRED", "A host operation ID or idempotency_key is required.");
    const result = await this.#env(request, async (env) => {
      const from = this.#role(env.context, env.live);
      const requestFile = this.#checked(path.join(this.#root(), "requests", from, `${key}.json`)), fingerprint = JSON.stringify({ from, to, content, context_files, wait_reply, timeout_sec: waitInput.timeout_sec, poll_interval_sec: waitInput.poll_interval_sec, escalation: escalation || null });
      const rawReplay = readRecord(requestFile), replay = this.#requestRecord(requestFile, env.context, env.generation); if (rawReplay && !replay) fail("STALE_AUTHORITY_GENERATION", "An idempotency record belongs to a different authority generation or binding."); if (replay) { if (replay.fingerprint !== fingerprint || !replay.result?.message_id) fail("IDEMPOTENCY_CONFLICT", "The idempotency key was used for a different send."); return replay.result; }
      const id = crypto.createHash("sha256").update(`${env.context.manifest.projectId}\0${key}`).digest("hex").slice(0, 32), message = { id, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, task_id: null, from, to, content, context_files, wait_reply, timeout_sec: waitInput.timeout_sec, poll_interval_sec: waitInput.poll_interval_sec, sent_at: this.clock(), ...(escalation ? { escalation } : {}) }, messageFile = this.#message(to, id);
      const prior = readRecord(messageFile); if (prior && JSON.stringify({ ...prior, sent_at: undefined }) !== JSON.stringify({ ...message, sent_at: undefined })) fail("IDEMPOTENCY_CONFLICT", "The message ID already has different immutable content.");
      if (!prior) this.write(messageFile, message);
      const created = { message_id: id }; this.write(requestFile, { projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, fingerprint, result: created, messageId: id, createdAt: this.clock() });
      if (wait_reply) this.write(this.#waitFile(id), { id, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, deadlineMs: this.now() + waitInput.timeout_sec * 1000, status: "pending", createdAt: this.clock() });
      const target = this.#recipientTarget(env, to); if (target) await this.#deliver(env, target, id, content, from);
      return created;
    });
    return wait_reply ? this.#waitForReply(request, result.message_id, to, waitInput, escalation, context_files) : result;
  }
  async #deliver(env, target, id, content, self) {
    const claim = this.#checked(path.join(this.#root(), "deliveries", `${id}.json`)); if (readRecord(claim)) return;
    this.write(claim, { id, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, status: "claimed", claimedAt: this.clock() });
    const native = await this.nativeDeliver({ context: env.context, generation: env.generation, target, id, content, self });
    if (native === "unavailable") { await this.terminalDeliver({ context: env.context, generation: env.generation, target, id, content, self }); this.write(claim, { id, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, status: "fallback" }); }
    else this.write(claim, { id, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, status: native === "accepted" ? "accepted" : "ambiguous" });
  }
  async #waitForReply(request, id, to, waitInput, escalation, contextFiles) {
    let state = this.#env(request, (env) => this.#waitRecord(this.#waitFile(id), env.context, id, env.generation));
    if (!state) fail("MESSAGE_NOT_FOUND", "No exact durable wait exists in this workspace.");
    const deadline = state.deadlineMs;
    while (state.status === "pending" && this.now() < deadline) {
      const response = this.#env(request, (env) => {
        const reply = this.#replyRecord(this.#reply(this.#role(env.context, env.live), id), env.context, id, env.generation, to);
        if (!reply) return null; const file = this.#waitFile(id), wait = this.#waitRecord(file, env.context, id, env.generation); if (wait?.status === "pending") this.write(file, { ...wait, status: "completed", completedAt: this.clock() });
        return { reply: reply.content, from: reply.from, replied_at: reply.replied_at };
      });
      if (response) return response;
      await this.wait(Math.min(waitInput.poll_interval_sec * 1000, Math.max(0, deadline - this.now())));
      state = this.#env(request, (env) => this.#waitRecord(this.#waitFile(id), env.context, id, env.generation));
    }
    if (state?.status === "completed") {
      const completed = this.#env(request, (env) => this.#replyRecord(this.#reply(this.#role(env.context, env.live), id), env.context, id, env.generation, to));
      if (completed) return { reply: completed.content, from: completed.from, replied_at: completed.replied_at };
      fail("MALFORMED_REPLY", "A completed durable wait has no valid exact reply.");
    }
    this.#env(request, (env) => { const file = this.#waitFile(id), wait = this.#waitRecord(file, env.context, id, env.generation); if (wait?.status === "pending") this.write(file, { ...wait, status: "timed_out", timedOutAt: this.clock() }); });
    const declared = escalation || { type: "EVIDENCE_GAP", blocked_decision: `A reply from '${to}' is required to continue.`, required_authority: [], affected_outputs: [] };
    throw Object.assign(new RuntimeContextError("REPLY_TIMEOUT", "No reply was received before the timeout."), { detail: { status: "BLOCKED", type: declared.type, blocked_decision: declared.blocked_decision, known_facts: [`Message ${id} was written to the recipient inbox.`], unknowns: ["No reply was received before the timeout."], conflicts: [], stale_signals: [], current_authority: [], required_authority: declared.required_authority, affected_outputs: declared.affected_outputs, source_refs: contextFiles, timeout: true, message_id: id, to, timeout_sec: waitInput.timeout_sec, authority_enforced: false } });
  }
  reply(request, { self, in_reply_to, content } = {}) {
    if (self !== undefined) fail("SPOOFED_IDENTITY", "Sender role is host-owned."); validId(in_reply_to); if (typeof content !== "string" || !content) fail("INVALID_REPLY", "Reply content is required.");
    return this.#env(request, (env) => { const role = this.#role(env.context, env.live), message = readRecord(this.#message(role, in_reply_to)); if (!this.#scoped(message, env.context, role, in_reply_to) || message.authorityGeneration !== env.generation) fail("MESSAGE_NOT_FOUND", "No exact message exists in this workspace."); const record = { in_reply_to, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, from: role, content, replied_at: this.clock() }, file = this.#reply(message.from, in_reply_to), prior = readRecord(file); if (prior) { if (prior.content !== content || prior.from !== role) fail("REPLY_IMMUTABLE", "A conflicting reply already exists."); return prior; } this.write(file, record); return record; });
  }
  readInbox(request, { self, unread_only = true } = {}) {
    if (self !== undefined || typeof unread_only !== "boolean") fail("INVALID_READ", "Sender role is host-owned and unread_only must be boolean.");
      return this.#env(request, (env) => { const role = this.#role(env.context, env.live), directory = this.#roleDir(role); this.#checked(directory); let names; try { names = fs.readdirSync(directory); } catch { return []; } const result = []; for (const name of names.filter((item) => item.endsWith(".json") && !item.endsWith(".reply.json")).sort()) { const id = name.slice(0, -5); if (!ID.test(id)) continue; const message = readRecord(this.#message(role, id)); if (!this.#scoped(message, env.context, role, id)) continue; const mutable = message.authorityGeneration === env.generation, markerFile = this.#read(role, id), marker = readRecord(markerFile), read = !!(mutable && marker && marker.id === id && marker.projectId === env.context.manifest.projectId && marker.projectRoot === env.context.projectRoot && marker.workspaceId === env.context.workspace.id && marker.authorityGeneration === env.generation && typeof marker.read_at === "string"); if (unread_only && read) continue; result.push({ id: message.id, from: message.from, content: message.content, context_files: message.context_files || [], sent_at: message.sent_at, read }); if (mutable && !read) { this.#checked(markerFile); this.write(markerFile, { id, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, read_at: this.clock() }); } } return result.sort((a, b) => a.sent_at.localeCompare(b.sent_at)); });
  }
  target(request, operation) {
    if (operation === "revoke") this.#env(request, (env) => { const role = this.#role(env.context, env.live), old = readRecord(this.#targetFile(role)); if (old) this.#targetKeyFile(old); });
    return this.#targetUnchecked(request, operation);
  }
  #targetUnchecked(request, operation) {
    return this.#env(request, (env) => { const role = this.#role(env.context, env.live), verified = this.verifyTarget({ context: env.context, live: env.live, role, operation }); if (!verified || !["sessionID", "serverUrl", "directory"].every((key) => typeof verified[key] === "string" && verified[key])) fail("INVALID_TARGET", "Host target verification failed."); let directory; try { directory = fs.realpathSync(verified.directory); } catch { fail("INVALID_TARGET", "Target directory is unavailable."); } if (directory !== fs.realpathSync(env.live.cwd) || !validUrl(verified.serverUrl) || !SESSION.test(verified.sessionID)) fail("CROSS_PROJECT_TARGET", "Target is not the live canonical project target."); const file = this.#targetFile(role), old = readRecord(file); if (operation === "revoke") { if (!validTarget(old, { context: env.context, role, generation: env.generation }) || !same(old, { ...env.live, sessionID: verified.sessionID, serverUrl: verified.serverUrl, directory }, ["socket", "workspaceId", "tabId", "paneId", "terminalId", "sessionID", "serverUrl", "directory"])) fail("STALE_TARGET", "Only the exact target can revoke."); removeDirect(file); removeDirect(path.join(this.#root(), "opencode-targets", `${targetKey(old)}.json`)); return { revoked: true }; } if (!["register", "heartbeat"].includes(operation)) fail("INVALID_TARGET_OPERATION", "Unknown target operation."); const candidate = { version: 1, role, projectId: env.context.manifest.projectId, projectRoot: env.context.projectRoot, workspaceId: env.context.workspace.id, authorityGeneration: env.generation, socket: env.live.socket, tabId: env.live.tabId, paneId: env.live.paneId, terminalId: env.live.terminalId, cwd: directory, directory, sessionID: verified.sessionID, serverUrl: verified.serverUrl }; if (operation === "heartbeat" && (!validTarget(old, { context: env.context, role, generation: env.generation }) || !same(old, candidate, targetFields().filter((field) => field !== "token")))) fail("STALE_TARGET", "Only the exact target can heartbeat."); if (old && old.token && !same(old, candidate, targetFields().filter((field) => field !== "token"))) removeDirect(path.join(this.#root(), "opencode-targets", `${targetKey(old)}.json`)); const record = { ...candidate, token: operation === "heartbeat" ? old.token : crypto.randomBytes(32).toString("hex"), updatedAtMs: this.now() }; this.write(file, record); this.write(path.join(this.#root(), "opencode-targets", `${targetKey(record)}.json`), record); return record; });
  }
}
export { validateWaitInput, validateEscalation };
