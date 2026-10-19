import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pidAlive, readJSON } from '../../core/liveness.mjs';

// Claude Code keeps one small file per running conversation in ~/.claude/sessions:
// <pid>.json with {pid, sessionId, cwd, entrypoint, name, hostSessionId (desktop), ...}.
// It is removed when the process ends and leftovers from a crash are cleared on the next
// run. That file is the witness of a running conversation: no /proc, no process tree.
export const registryDir = () => process.env.HEAD_CONTEXT_CLAUDE_SESSIONS || path.join(os.homedir(), '.claude', 'sessions');
export const registryOf = pid => (Number.isInteger(Number(pid)) ? readJSON(path.join(registryDir(), `${Number(pid)}.json`)) : null);
export const conversationOfPid = pid => registryOf(pid)?.sessionId || null;
export function registry() {
  let entries;
  try { entries = fs.readdirSync(registryDir()); } catch { return []; }
  const out = [];
  for (const name of entries) {
    const pid = /^(\d+)\.json$/.exec(name)?.[1];
    if (!pid) continue;
    const row = readJSON(path.join(registryDir(), name));
    if (row?.sessionId) out.push({ ...row, pid: Number(pid), file: path.join(registryDir(), name) });
  }
  return out;
}
export function ownerOf(conversation) {
  if (!conversation) return null;
  return registry().find(row => row.sessionId === conversation) || null;
}
// The conversation this MCP server was started for: its parent is the Claude process.
export const currentConversation = () => conversationOfPid(process.ppid);
export const aliveConversation = conversation => { const owner = ownerOf(conversation); return Boolean(owner) && pidAlive(owner.pid); };
// What the host says about one conversation now, kept on its connection so it can still
// be named and addressed when its process is gone.
export function hostInfo(conversation) {
  const owner = ownerOf(conversation);
  if (!owner) return {};
  return { pid: owner.pid, host_session_id: owner.hostSessionId, title: owner.name, entrypoint: owner.entrypoint };
}
export const DESKTOP = 'claude-desktop';
export const RECENT_DAYS = 7;
// Claude Code writes each conversation's records under ~/.claude/projects/<folder>, the
// folder being the project path with every other character than a letter or digit
// turned into '-'.
export const projectsDir = () => process.env.HEAD_CONTEXT_CLAUDE_PROJECTS || path.join(os.homedir(), '.claude', 'projects');
export const transcriptsOf = project => path.join(projectsDir(), path.resolve(project).replace(/[^A-Za-z0-9]/g, '-'));
// The desktop app keeps its own record of each conversation it hosts:
// <root>/<account>/<org>/local_<id>.json, naming the engine conversation (cliSessionId).
const desktopRoots = () => [process.env.HEAD_CONTEXT_DESKTOP_SESSIONS,
  path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions'),
  process.env.APPDATA && path.join(process.env.APPDATA, 'Claude', 'claude-code-sessions'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude', 'claude-code-sessions')].filter(Boolean);
const dirs = dir => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(dir, e.name)); } catch { return []; } };
export function desktopIndex() {
  const out = new Map();
  for (const root of desktopRoots()) for (const account of dirs(root)) for (const org of dirs(account)) {
    let files; try { files = fs.readdirSync(org).filter(f => /^local_.*\.json$/.test(f)); } catch { continue; }
    for (const f of files) {
      const r = readJSON(path.join(org, f));
      if (r?.cliSessionId) out.set(r.cliSessionId, { host_session_id: path.basename(f, '.json'), title: r.title || r.name, archived: Boolean(r.isArchived || r.archived) });
    }
  }
  return out;
}
// Which app wrote a conversation: the entrypoint field its records carry.
function entrypointOf(file) {
  try {
    const fd = fs.openSync(file, 'r'), data = Buffer.alloc(64 * 1024);
    let length; try { length = fs.readSync(fd, data, 0, data.length, 0); } finally { fs.closeSync(fd); }
    return /"entrypoint":"([^"]+)"/.exec(data.subarray(0, length).toString())?.[1] || null;
  } catch { return null; }
}
// The conversations of this project that are alive now.
//   A running process (a registry file whose pid answers) is alive on any host.
//   The desktop app stops idle processes on its own and starts them again when a message
//   arrives, so a desktop conversation has no "ended": there, one whose records changed
//   within RECENT_DAYS counts as alive. That window is what is shown, not a liveness test.
export function liveConversations(project, known = new Map(), { now = Date.now(), days = RECENT_DAYS } = {}) {
  const out = new Map(), root = path.resolve(project), recent = now - days * 86400000;
  const dir = transcriptsOf(project), stamp = id => { try { return fs.statSync(path.join(dir, `${id}.jsonl`)).mtimeMs; } catch { return null; } };
  let desktop = null; const app = () => (desktop ??= desktopIndex());
  for (const r of registry()) {
    if (!r.cwd || path.resolve(r.cwd) !== root || !pidAlive(r.pid)) continue;
    const k = known.get(r.sessionId) || {};
    out.set(r.sessionId, { conversation_id: r.sessionId, title: r.name || k.title, address: r.hostSessionId || r.name || k.host_session_id,
      last_at: stamp(r.sessionId) || r.updatedAt || null, entrypoint: r.entrypoint });
  }
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { }
  for (const f of files) {
    const id = path.basename(f, '.jsonl');
    if (out.has(id)) continue;
    const at = stamp(id);
    if (!at || at < recent) continue;
    const k = known.get(id) || {}, d = app().get(id);
    const entrypoint = k.entrypoint || (d ? DESKTOP : entrypointOf(path.join(dir, f)));
    if (entrypoint !== DESKTOP || d?.archived) continue;
    out.set(id, { conversation_id: id, title: k.title || d?.title, address: k.host_session_id || d?.host_session_id, last_at: at, entrypoint });
  }
  return [...out.values()].sort((a, b) => (b.last_at || 0) - (a.last_at || 0));
}
