import fs from 'node:fs';
import path from 'node:path';
import { records, locations } from '../../core/storage.mjs';
import { ownerOf, desktopForkParent } from './process.mjs';

// Where a conversation came from, read back from Claude Code's own records on every
// start — not once. `.head/state` is only a cache of the answer; when the two disagree
// these records win. Three relations, nearest first:
//   continued — an older record ends with {"type":"continued-in","continuedInSessionId":
//     <this one>}: it handed its place over and is finished, even if its process is
//     still registered. Followed as far up as the chain goes.
//   clear     — /clear keeps the process and gives it a new conversation id, so the place
//     belongs to the conversation that process was running before it.
//   fork      — a copy that runs beside its parent: the parent named in the launch
//     arguments (--resume <parent>.jsonl --fork-session) or by the host. A fork of a fork
//     of a fork works because each one only ever asks for the parent directly above it.
// The copied first record's forkedFrom names the oldest ancestor, not the parent, so it
// is kept as a last resort for when no nearer ancestor is known at all.
const TAIL = 4096, DEPTH = 32;
function tail(file, bytes = TAIL) {
  try {
    const size = fs.statSync(file).size, length = Math.min(size, bytes), data = Buffer.alloc(length);
    const fd = fs.openSync(file, 'r');
    try { fs.readSync(fd, data, 0, length, size - length); } finally { fs.closeSync(fd); }
    return data.toString('utf8');
  } catch { return ''; }
}
export function continuedInto(transcript) {
  const text = tail(transcript);
  if (!text.includes('continued-in')) return null;
  for (const line of text.split('\n').reverse()) {
    if (!line.includes('"continued-in"')) continue;
    try { const row = JSON.parse(line); if (row.type === 'continued-in' && row.continuedInSessionId) return row.continuedInSessionId; } catch { }
  }
  return null;
}
// successor id -> the conversation it continues. One tail read per record file in this
// project's directory (417 files measured at 12 ms), so the whole chain is free after it.
export function continuations(directory) {
  const map = new Map();
  let files;
  try { files = fs.readdirSync(directory).filter(f => f.endsWith('.jsonl')); } catch { return map; }
  for (const name of files) {
    const next = continuedInto(path.join(directory, name));
    if (next) map.set(next, path.basename(name, '.jsonl'));
  }
  return map;
}
const forkArgument = pid => {
  if (process.platform !== 'linux' || !pid) return null; // Auxiliary: only the CLI on Linux exposes its arguments.
  try {
    const argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
    if (!argv.includes('--fork-session')) return null;
    const resume = path.basename(argv[argv.indexOf('--resume') + 1] || '', '.jsonl');
    return /^[0-9a-fA-F-]{8,}$/.test(resume) ? resume : null;
  } catch { return null; }
};
const forkInput = input => { const value = input.forked_from || input.forkedFrom; return (typeof value === 'string' ? value : value?.sessionId) || null; };
// A copy keeps every record's uuid, only the session id is rewritten. So the ancestors of
// a copy are the conversations whose own records end somewhere inside it, nearest last.
// Only conversations that hold a place are worth reading, and the cache names those.
const LIMIT = 24 * 1024 * 1024;
function uuidsOf(file) {
  const out = [];
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }
  if (text.length > LIMIT) return out;
  for (const line of text.split('\n')) {
    if (!line.includes('"uuid"')) continue;
    try { const row = JSON.parse(line); if (row.uuid) out.push(row.uuid); } catch { }
  }
  return out;
}
export function copyAncestors(directory, self, candidates) {
  if (!directory) return [];
  const order = new Map();
  uuidsOf(path.join(directory, `${self}.jsonl`)).forEach((uuid, index) => { if (!order.has(uuid)) order.set(uuid, index); });
  if (!order.size) return [];
  const scored = [];
  for (const id of candidates) {
    let best = -1;
    for (const uuid of uuidsOf(path.join(directory, `${id}.jsonl`))) { const at = order.get(uuid); if (at !== undefined && at > best) best = at; }
    if (best >= 0) scored.push({ id, best });
  }
  return scored.sort((a, b) => b.best - a.best).map(row => row.id);
}
// The oldest ancestor the copied records point at, used only after everything nearer failed.
function forkedFromRecord(transcript) {
  if (!transcript) return null;
  try {
    const fd = fs.openSync(transcript, 'r'), data = Buffer.alloc(256 * 1024);
    let length; try { length = fs.readSync(fd, data, 0, data.length, 0); } finally { fs.closeSync(fd); }
    for (const line of data.subarray(0, length).toString().split('\n')) {
      let row; try { row = JSON.parse(line); } catch { continue; }
      if (row.forkedFrom?.sessionId) return row.forkedFrom.sessionId;
    }
  } catch { }
  return null;
}
const connected = project => { try { return records(path.join(locations(project).state, 'conversations')).filter(c => c.host === 'claude' && c.session).map(c => c.conversation_id); } catch { return []; } };
// The ancestors of this conversation, nearest first. The core walks the list and takes
// the place of the first one it knows, so depth is never a limit.
export function ancestry(project, input, { directory = input.transcript_path ? path.dirname(input.transcript_path) : null } = {}) {
  const self = input.session_id;
  if (!self) return [];
  const chain = directory ? continuations(directory) : new Map();
  const links = [], seen = new Set([self]);
  const add = (conversation_id, kind) => { if (conversation_id && !seen.has(conversation_id)) { links.push({ conversation_id, kind }); seen.add(conversation_id); } };
  let current = self;
  for (let depth = 0; depth < DEPTH; depth++) {
    const continued = chain.get(current);
    const forked = depth === 0 ? forkInput(input) || forkArgument(ownerOf(self)?.pid) || desktopForkParent(self) : null;
    const cleared = depth === 0 && input.source === 'clear' ? previousOfProcess(project, self) : null;
    const next = continued ? { conversation_id: continued, kind: 'continued' }
      : cleared ? { conversation_id: cleared, kind: 'clear' }
        : forked ? { conversation_id: forked, kind: 'fork' } : null;
    if (!next || seen.has(next.conversation_id)) break;
    add(next.conversation_id, next.kind); current = next.conversation_id;
  }
  // No parent was named. A host that says this start is a fork (or a conversation we have
  // never placed) may still be a copy, and a copy's ancestors are readable from the shared
  // record uuids. Only conversations that hold a place are worth reading.
  if (!links.length && (input.source === 'fork' || !connected(project).includes(self)))
    for (const id of copyAncestors(directory, self, connected(project).filter(id => !seen.has(id)))) add(id, 'fork');
  add(forkedFromRecord(input.transcript_path), 'fork'); // the oldest ancestor, as a last resort
  return links;
}
// The conversation this process was running before /clear gave it a new id. The registry
// says which process is mine; the cache says which conversation it last reported on.
function previousOfProcess(project, self) {
  const owner = ownerOf(self);
  if (!owner) return null;
  let seen;
  try { seen = records(path.join(locations(project).state, 'activity')).filter(a => a.host === 'claude'); } catch { return null; }
  return seen.filter(a => a.conversation_id !== self && a.liveness?.pid === owner.pid)
    .sort((a, b) => String(b.updated_at || b.recovery_seen_at || '').localeCompare(String(a.updated_at || a.recovery_seen_at || '')))[0]?.conversation_id || null;
}
