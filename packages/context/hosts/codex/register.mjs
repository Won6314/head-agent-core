import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJSON, readLoose } from '../../core/storage.mjs';

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
  for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); try { if (Date.now() - fs.statSync(p).mtimeMs > KEEP_DAYS * 86400000) fs.rmSync(p); } catch { /* another start removed it first */ } }
  return true;
}
// The call came from a conversation the start hook never registered. Almost always Codex has
// not been told to trust this plugin's hooks yet (it skips untrusted hooks without asking): the
// answer says where the person trusts them, for the model to pass on.
export const UNREGISTERED = '이 대화의 프로젝트를 알 수 없습니다. head-context의 시작 훅이 이 대화에서 돌지 않았습니다. 대개 Codex가 이 플러그인의 훅을 아직 신뢰하지 않아서이며, 그동안에는 작업 맥락·지침이 들어가지 않습니다. 사용자에게 이렇게 알려 주세요: 터미널 Codex는 시작할 때 뜨는 Hooks need review에서 Trust all and continue, Codex 앱은 설정 → 코딩 → Hook → 플러그인에서 제공 → Head Context → 모두 신뢰. 신뢰한 뒤 새 대화를 열면 됩니다. 이미 신뢰했다면 새 대화를 열거나 다시 열어 주세요.';
export function registered(thread_id, options) {
  const file = fileOf(thread_id, options);
  return file ? readLoose(file) : null;
}
// The conversation a tool call belongs to, as Codex names it on every call.
function threadOf(request) {
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
