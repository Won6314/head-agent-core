import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJSON } from '../../core/storage.mjs';

// Codex starts the plugin's tool server in the plugin folder, with neither the project nor
// the plugin's data folder in its environment; each tool call names its conversation
// (_meta.threadId). The start hook does get the conversation's folder (cwd), so it writes
// one small file per conversation, and the server reads the project from it.
// Codex keeps a plugin at <home>/plugins/cache/<market>/<plugin>/<version> and its data
// at <home>/plugins/data/<plugin>-<market> (the hook's PLUGIN_DATA). Both sides work the
// data folder out from the plugin folder, so they agree without any setting.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export function dataDir({ env = process.env, root = ROOT } = {}) {
  if (env.HEAD_CONTEXT_CODEX_DATA) return env.HEAD_CONTEXT_CODEX_DATA;
  const plugin = path.dirname(root), market = path.dirname(plugin), cache = path.dirname(market);
  if (path.basename(cache) === 'cache') return path.join(path.dirname(cache), 'data', `${path.basename(plugin)}-${path.basename(market)}`);
  return env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA || null;
}
const ID = /^[A-Za-z0-9_-]+$/;
const fileOf = (id, options) => { const dir = dataDir(options); return dir && ID.test(String(id || '')) ? path.join(dir, 'threads', `${id}.json`) : null; };
const KEEP_DAYS = 30;
export function register({ thread_id, cwd, transcript_path }, options) {
  const file = fileOf(thread_id, options);
  if (!file || !cwd || !path.isAbsolute(cwd)) return false;
  atomicJSON(file, { thread_id, cwd, ...(transcript_path ? { transcript_path } : {}), at: new Date().toISOString() });
  const dir = path.dirname(file);
  for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); try { if (Date.now() - fs.statSync(p).mtimeMs > KEEP_DAYS * 86400000) fs.rmSync(p); } catch { } }
  return true;
}
export function registered(thread_id, options) {
  const file = fileOf(thread_id, options);
  if (!file) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
// The conversation a tool call belongs to, as Codex names it on every call.
export function threadOf(request) {
  const meta = request?.params?._meta || {};
  return meta.threadId || meta.sessionId || meta['x-codex-turn-metadata']?.thread_id || null;
}
// Who calls: Codex names the calling thread (threadId) and the root of its tree (sessionId,
// which is the root thread's own id). A thread its conversation spawned (spawn_agent, a fork
// or a fresh agent) has a different root: it is a task inside that conversation — the
// conversation is the root, the task its own thread (agent), and records are read, not written.
export function callerOf(request) {
  const meta = request?.params?._meta || {};
  const thread = threadOf(request), root = meta.sessionId;
  if (thread && root && root !== thread && ID.test(String(root))) return { conversation: root, agent: thread };
  return { conversation: thread, agent: null };
}
