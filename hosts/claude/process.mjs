import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pidAlive, readJSON } from '../../core/liveness.mjs';

// Claude Code keeps one small file per running conversation in ~/.claude/sessions:
// <pid>.json with {pid, sessionId, cwd, startedAt, ...}. It is removed when the
// session ends and leftovers from a crash are cleared on the next run. That file is
// the whole witness here: no /proc, no ancestor walk, so Mac, Windows and Linux agree.
// Documented at https://code.claude.com/docs/en/claude-directory (the fields are not).
export const registryDir = () => process.env.HEAD_CONTEXT_CLAUDE_SESSIONS || path.join(os.homedir(), '.claude', 'sessions');
export const registryOf = pid => (Number.isInteger(Number(pid)) ? readJSON(path.join(registryDir(), `${Number(pid)}.json`)) : null);
// The conversation a given process is running, and the process running a conversation.
export const conversationOfPid = pid => registryOf(pid)?.sessionId || null;
export function ownerOf(conversation) {
  if (!conversation) return null;
  let entries;
  try { entries = fs.readdirSync(registryDir()); } catch { return null; }
  for (const name of entries) {
    const pid = /^(\d+)\.json$/.exec(name)?.[1];
    if (!pid) continue;
    const registry = readJSON(path.join(registryDir(), name));
    if (registry?.sessionId === conversation) return { ...registry, pid: Number(pid), file: path.join(registryDir(), name) };
  }
  return null;
}
// The conversation this MCP server was started for: its parent is the Claude process.
export const currentConversation = () => conversationOfPid(process.ppid);
// Liveness evidence a later reader can check without knowing this host.
export function sessionEvidence(conversation) {
  const owner = ownerOf(conversation);
  return owner ? { type: 'host-session', pid: owner.pid, session_id: conversation, registry: owner.file, machine: os.hostname() } : null;
}
export const aliveConversation = conversation => { const owner = ownerOf(conversation); return Boolean(owner) && pidAlive(owner.pid); };
// Claude Code Desktop keeps its own record of each conversation it hosts, named by the
// registry's hostSessionId: <root>/<account>/<org>/local_<id>.json. A fork made in the
// app (/subtask, a side session) carries no fork mark in the engine's records, but its
// app record names the parent's app id (forkedFromSessionId), and the parent's app record
// names the parent's engine conversation (cliSessionId).
const desktopRoots = () => [process.env.HEAD_CONTEXT_DESKTOP_SESSIONS,
  path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions'),
  process.env.APPDATA && path.join(process.env.APPDATA, 'Claude', 'claude-code-sessions')].filter(Boolean);
const dirs = dir => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(dir, e.name)); } catch { return []; } };
function desktopRecord(hostId) {
  if (!/^local_[0-9a-fA-F-]+$/.test(hostId || '')) return null;
  for (const root of desktopRoots()) for (const account of dirs(root)) for (const org of dirs(account)) {
    const record = readJSON(path.join(org, `${hostId}.json`));
    if (record) return record;
  }
  return null;
}
export function desktopForkParent(conversation) {
  const host = ownerOf(conversation)?.hostSessionId;
  const parent = host && desktopRecord(host)?.forkedFromSessionId;
  return (parent && desktopRecord(parent)?.cliSessionId) || null;
}
