import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { locations, recordFile, records, atomicJSON, noSymlink, readLoose } from '../../core/storage.mjs';
import { pidAlive } from '../../core/liveness.mjs';
import { instructionLine } from '../../core/instruction.mjs';
import { processOf } from '../../core/platform.mjs';
import { envelope } from '../../core/protocol.mjs';
import { RECENT_DAYS } from '../../core/recovery.mjs';

// The Codex conversations of a project, as the project itself records them: the start hook
// writes one file per conversation (.head/state/presence/codex-<id>.json) naming the engine
// that runs it. A Claude conversation's list and its messages to Codex read these.
//   shared   — alive while the shared engine has it loaded; a message starts its turn there.
//   embedded — alive while its window's process runs; a message waits in its inbox.
//   app      — (desktop app, editor) shown while its records changed within 7 days, as a
//              desktop Claude conversation is; a message waits in its inbox.
// Messages that wait are given at the conversation's next prompt (UserPromptSubmit hook).
const QUERY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'query.mjs');
const presenceFile = (project, id) => recordFile(locations(project).state, 'presence', id, 'codex');
export function writePresence(project, { thread_id, cwd, engine, transcript_path, title }) {
  const file = presenceFile(project, thread_id),
    previous = readPresence(project, thread_id) || {};
  const value = {
    ...previous,
    host: 'codex',
    conversation_id: thread_id,
    cwd,
    mode: engine.mode,
    ...(engine.socket ? { socket: engine.socket } : {}),
    ...(engine.bin ? { bin: engine.bin } : {}),
    ...(engine.pid ? { pid: engine.pid } : {}),
    codex_home: engine.home,
    ...(transcript_path ? { transcript_path } : {}),
    ...(title ? { title } : {}),
    at: new Date().toISOString(),
  };
  if (engine.mode !== 'shared') delete value.socket;
  if (engine.mode === 'embedded') delete value.bin;
  atomicJSON(file, value);
  return value;
}
export const readPresence = (project, id) => readLoose(presenceFile(project, id));
// The engine a presence names, in the form engineOf gives it: where to reach it (socket, its
// binary) and what it is. Code that talks to the engine takes this one value.
export const engineFrom = (presence) => ({
  mode: presence.mode,
  socket: presence.socket,
  bin: presence.bin,
  pid: presence.pid,
  home: presence.codex_home,
});
// A broken presence file is skipped alone (it is written again at that conversation's next prompt).
function presences(project) {
  try {
    return records(path.join(locations(project).state, 'presence'), { loose: true }).filter((r) => r.host === 'codex');
  } catch {
    return [];
  }
} // unreadable presence folder: no Codex conversations

const inboxDir = (project, id) => {
  recordFile(locations(project).state, 'inbox', id, 'codex');
  return noSymlink(path.join(locations(project).state, 'inbox', `codex-${id}`));
};
// File names sort oldest first: time, then a count kept by this process for one millisecond.
let last = '',
  count = 0;
export function queue(project, id, { from, from_name, text }) {
  const dir = inboxDir(project, id),
    at = new Date().toISOString();
  count = at === last ? count + 1 : 0;
  last = at;
  atomicJSON(path.join(dir, `${at.replace(/[:.]/g, '-')}-${String(count).padStart(6, '0')}-${randomUUID()}.json`), {
    from,
    ...(from_name ? { from_name } : {}),
    text,
    at,
  });
}
// The waiting messages, oldest first, taken out of the inbox for one prompt.
// A message is taken by moving its file into this taker's own folder (.taking-<pid>-<id>),
// so two takers at once never both get it; the folder is removed by done(), after the
// messages were given. A taker that died before that leaves its folder behind, and the next
// taker puts those messages back first (its process is gone, or it is older than STALE_MS).
// So a message is given once, or once more: if a taker dies between giving and done(), or if
// a living taker is held past STALE_MS and another taker puts its messages back.
// A message file that cannot be read is not given and not removed: it is moved to the
// inbox's .broken folder, and its path is returned (broken) for the conversation to be told.
export const STALE_MS = 10 * 60 * 1000;
export function take(project, id, { now = Date.now() } = {}) {
  const dir = inboxDir(project, id);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return { messages: [], broken: [], done() {} };
  } // no inbox yet: nothing waits
  for (const name of names) {
    const m = /^\.taking-(\d+)-/.exec(name);
    if (!m) continue;
    const claim = path.join(dir, name);
    let old = false;
    try {
      old = now - fs.statSync(claim).mtimeMs > STALE_MS;
    } catch {
      continue;
    }
    if (pidAlive(Number(m[1])) && !old) continue;
    try {
      for (const f of fs.readdirSync(claim))
        if (f.endsWith('.json')) fs.renameSync(path.join(claim, f), path.join(dir, f));
      fs.rmSync(claim, { recursive: true, force: true });
    } catch {
      /* another taker is putting them back */
    }
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (!files.length) return { messages: [], broken: [], done() {} };
  const claim = path.join(dir, `.taking-${process.pid}-${randomUUID()}`);
  fs.mkdirSync(claim);
  const messages = [],
    broken = [];
  for (const f of files) {
    try {
      fs.renameSync(path.join(dir, f), path.join(claim, f));
    } catch {
      continue;
    } // another taker has it
    const message = readLoose(path.join(claim, f));
    if (message) {
      messages.push(message);
      continue;
    }
    const aside = path.join(dir, '.broken');
    fs.mkdirSync(aside, { recursive: true });
    fs.renameSync(path.join(claim, f), path.join(aside, f));
    broken.push(path.join(aside, f));
  }
  const done = () => fs.rmSync(claim, { recursive: true, force: true });
  if (!messages.length) done();
  return { messages, broken, done };
}
export function drain(project, id) {
  const t = take(project, id);
  t.done();
  return t.messages;
}
// A waiting message as the conversation is given it (core/protocol.mjs envelope).
export const asMessage = (m) => envelope({ from: m.from, fromName: m.from_name, text: m.text });

// The threads a shared engine has loaded, with their names; null when it does not answer.
function loaded({ socket, bin }) {
  const r = spawnSync(process.execPath, [QUERY, 'loaded', socket, ...(bin ? [bin] : [])], {
    encoding: 'utf8',
    timeout: 8000,
    windowsHide: true,
  });
  try {
    return r.status === 0 ? JSON.parse(r.stdout) : null;
  } catch {
    return null;
  } // a garbled answer is no answer
}
// From the end of a Codex conversation's records: the last thing a person typed.
function lastSaid(file) {
  let text = '';
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size,
        n = Math.min(size, 4 * 1024 * 1024),
        b = Buffer.alloc(n);
      fs.readSync(fd, b, 0, n, size - n);
      text = b.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  } // no records yet
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"role":"user"')) continue;
    let row;
    try {
      row = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const p = row?.payload;
    if (row?.type !== 'response_item' || p?.type !== 'message' || p.role !== 'user') continue;
    const body = (p.content || []).find((c) => c.type === 'input_text')?.text;
    if (!body || /^\s*</.test(body)) continue;
    const said = instructionLine(body);
    if (said) return said;
  }
  return null;
}
const mtime = (file) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}; // not there
const isCodexProcess = (pid) => {
  const p = processOf(pid);
  return Boolean(p && p.argv.some((a) => /codex/.test(a)));
};
export function codexLive(project, known = new Map(), { now = Date.now(), days = RECENT_DAYS } = {}) {
  const rows = [],
    bySocket = new Map();
  for (const p of presences(project))
    if (p.mode === 'shared' && p.socket) {
      if (!bySocket.has(p.socket)) bySocket.set(p.socket, loaded(engineFrom(p)));
    }
  for (const p of presences(project)) {
    const id = p.conversation_id,
      k = known.get(id) || {};
    let alive = false,
      title = p.title || k.title;
    if (p.mode === 'shared') {
      const l = bySocket.get(p.socket);
      const hit = l?.threads?.find((t) => t.id === id);
      alive = Boolean(hit);
      if (hit?.name) title = hit.name;
    } else if (p.mode === 'embedded') alive = pidAlive(Number(p.pid)) && isCodexProcess(p.pid);
    else alive = (mtime(p.transcript_path) || 0) >= now - days * 86400000;
    if (!alive) continue;
    rows.push({
      conversation_id: id,
      host: 'codex',
      title,
      address: `codex:${id}`,
      last_at: mtime(p.transcript_path) || Date.parse(p.at) || null,
      entrypoint: `codex-${p.mode}`,
      mode: p.mode,
      said: p.transcript_path ? lastSaid(p.transcript_path) : null,
    });
  }
  return rows.sort((a, b) => (b.last_at || 0) - (a.last_at || 0));
}
