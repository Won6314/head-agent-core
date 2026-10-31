import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pidAlive } from '../../core/liveness.mjs';
import { readLoose } from '../../core/storage.mjs';
import { instructionLine } from '../../core/instruction.mjs';
import { RECENT_DAYS } from '../../core/recovery.mjs';

// Claude Code keeps one small file per running conversation in ~/.claude/sessions:
// <pid>.json with {pid, sessionId, cwd, entrypoint, name, hostSessionId (desktop), ...}.
// It is removed when the process ends and leftovers from a crash are cleared on the next
// run. That file is the witness of a running conversation: no /proc, no process tree.
// Claude Code's own folder: CLAUDE_CONFIG_DIR when set, else ~/.claude.
export const claudeDir = (env = process.env) => env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
export const registryDir = (env = process.env) =>
  env.HEAD_CONTEXT_CLAUDE_SESSIONS || path.join(claudeDir(env), 'sessions');
export const registryOf = (pid) =>
  Number.isInteger(Number(pid)) ? readLoose(path.join(registryDir(), `${Number(pid)}.json`)) : null;
export const conversationOfPid = (pid) => registryOf(pid)?.sessionId || null;
export function registry() {
  let entries;
  try {
    entries = fs.readdirSync(registryDir());
  } catch {
    return [];
  }
  const out = [];
  for (const name of entries) {
    const pid = /^(\d+)\.json$/.exec(name)?.[1];
    if (!pid) continue;
    const row = readLoose(path.join(registryDir(), name));
    if (row?.sessionId) out.push({ ...row, pid: Number(pid), file: path.join(registryDir(), name) });
  }
  return out;
}
export function ownerOf(conversation) {
  if (!conversation) return null;
  return registry().find((row) => row.sessionId === conversation) || null;
}
// The conversation this MCP server was started for: its parent is the Claude process.
export const currentConversation = () => conversationOfPid(process.ppid);
export const aliveConversation = (conversation) => {
  const owner = ownerOf(conversation);
  return Boolean(owner) && pidAlive(owner.pid);
};
// What the host says about one conversation now, kept on its connection so it can still
// be named and addressed when its process is gone.
export function hostInfo(conversation) {
  const owner = ownerOf(conversation);
  if (!owner) return {};
  return { pid: owner.pid, host_session_id: owner.hostSessionId, title: owner.name, entrypoint: owner.entrypoint };
}
export const DESKTOP = 'claude-desktop';
// Claude Code writes each conversation's records under ~/.claude/projects/<folder>, the
// folder being the project path with every other character than a letter or digit
// turned into '-'.
export const projectsDir = (env = process.env) =>
  env.HEAD_CONTEXT_CLAUDE_PROJECTS || path.join(claudeDir(env), 'projects');
export const transcriptsOf = (project) => path.join(projectsDir(), path.resolve(project).replace(/[^A-Za-z0-9]/g, '-'));
// The desktop app keeps its own record of each conversation it hosts:
// <root>/<account>/<org>/local_<id>.json, naming the engine conversation (cliSessionId).
const desktopRoots = (env = process.env) =>
  [
    env.HEAD_CONTEXT_DESKTOP_SESSIONS,
    path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions'),
    env.APPDATA && path.join(env.APPDATA, 'Claude', 'claude-code-sessions'),
    env.LOCALAPPDATA &&
      path.join(
        env.LOCALAPPDATA,
        'Packages',
        'Claude_pzs8sxrjxfjjc',
        'LocalCache',
        'Roaming',
        'Claude',
        'claude-code-sessions',
      ),
  ].filter(Boolean);
const dirs = (dir) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
};
export function desktopIndex() {
  const out = new Map();
  for (const root of desktopRoots())
    for (const account of dirs(root))
      for (const org of dirs(account)) {
        let files;
        try {
          files = fs.readdirSync(org).filter((f) => /^local_.*\.json$/.test(f));
        } catch {
          continue;
        }
        for (const f of files) {
          const r = readLoose(path.join(org, f));
          if (r?.cliSessionId)
            out.set(r.cliSessionId, {
              host_session_id: path.basename(f, '.json'),
              title: r.title || r.name,
              archived: Boolean(r.isArchived || r.archived),
            });
        }
      }
  return out;
}
// Which app wrote a conversation: the entrypoint field its records carry.
function entrypointOf(file) {
  try {
    const fd = fs.openSync(file, 'r'),
      data = Buffer.alloc(64 * 1024);
    let length;
    try {
      length = fs.readSync(fd, data, 0, data.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    return /"entrypoint":"([^"]+)"/.exec(data.subarray(0, length).toString())?.[1] || null;
  } catch {
    return null;
  }
}
// From the end of a conversation's records: the last thing a person said to it, and for a
// copy the task it was given (its latest prompt marked [forked]; a copy carries its
// parent's whole history, so the first prompt is the parent's).
const TAIL = 16 * 1024 * 1024;
const bodyOf = (row) => {
  const c = row?.message?.content;
  return typeof c === 'string' ? c : Array.isArray(c) ? c.find((x) => x?.type === 'text')?.text || null : null;
};
export function recentPrompts(file) {
  let text = '';
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size,
        length = Math.min(size, TAIL),
        data = Buffer.alloc(length);
      fs.readSync(fd, data, 0, length, size - length);
      text = data.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return {};
  }
  const lines = text.split('\n');
  let said = null,
    task = null;
  for (let i = lines.length - 1; i >= 0 && !(said && task); i--) {
    if (!lines[i].includes('"type":"user"')) continue;
    let row;
    try {
      row = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (row?.type !== 'user' || row.isMeta || row.isCompactSummary) continue;
    const body = bodyOf(row);
    if (!body) continue;
    if (!task && /^\s*\[forked\]/.test(body))
      task =
        body
          .replace(/^\s*\[forked\]\s*/, '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find(Boolean) || null;
    if (!said) said = instructionLine(body);
  }
  return { said, task };
}
// The conversations of this project that are alive now.
//   A running process (a registry file whose pid answers) is alive on any host. Its
//   address is its inbox socket, which SendMessage takes as `uds:<path>` (the form an
//   incoming message names as its sender); short names like head-2b repeat.
//   The desktop app stops idle processes on its own and starts them again when a message
//   arrives, so a desktop conversation has no "ended": there, one whose records changed
//   within RECENT_DAYS counts as alive. That window is what is shown, not a liveness test.
//   reachable: whether a message from outside Claude (a Codex conversation) can reach it now —
//   only a running process with its inbox socket takes one.
export function liveConversations(project, known = new Map(), { now = Date.now(), days = RECENT_DAYS } = {}) {
  const out = new Map(),
    root = path.resolve(project),
    recent = now - days * 86400000;
  const dir = transcriptsOf(project),
    stamp = (id) => {
      try {
        return fs.statSync(path.join(dir, `${id}.jsonl`)).mtimeMs;
      } catch {
        return null;
      }
    };
  const prompts = (id, entrypoint) => {
    const p = recentPrompts(path.join(dir, `${id}.jsonl`));
    return { said: p.said || null, task: entrypoint === 'cli' || entrypoint === DESKTOP ? null : p.task || null };
  };
  let desktop = null;
  const app = () => (desktop ??= desktopIndex());
  for (const r of registry()) {
    if (!r.cwd || path.resolve(r.cwd) !== root || !pidAlive(r.pid)) continue;
    const k = known.get(r.sessionId) || {};
    out.set(r.sessionId, {
      conversation_id: r.sessionId,
      title: r.name || k.title,
      address: r.messagingSocketPath ? `uds:${r.messagingSocketPath}` : r.hostSessionId || r.name || k.host_session_id,
      last_at: stamp(r.sessionId) || r.updatedAt || null,
      entrypoint: r.entrypoint,
      reachable: Boolean(r.messagingSocketPath),
      ...prompts(r.sessionId, r.entrypoint),
    });
  }
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    /* no records folder for this project yet */
  }
  for (const f of files) {
    const id = path.basename(f, '.jsonl');
    if (out.has(id)) continue;
    const at = stamp(id);
    if (!at || at < recent) continue;
    const k = known.get(id) || {},
      d = app().get(id);
    const entrypoint = k.entrypoint || (d ? DESKTOP : entrypointOf(path.join(dir, f)));
    if (entrypoint !== DESKTOP || d?.archived) continue;
    out.set(id, {
      conversation_id: id,
      title: k.title || d?.title,
      address: k.host_session_id || d?.host_session_id,
      last_at: at,
      entrypoint,
      reachable: false,
      ...prompts(id, entrypoint),
    });
  }
  return [...out.values()].sort((a, b) => (b.last_at || 0) - (a.last_at || 0));
}
