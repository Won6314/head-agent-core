import fs from 'node:fs';
import path from 'node:path';
import { records, locations } from '../../core/storage.mjs';
import { ownerOf } from './process.mjs';

// Where a new conversation came from, read from Claude Code's own records. Only asked
// for a conversation the core does not know yet; nearest first:
//   continued — an older record ends with {"type":"continued-in","continuedInSessionId":
//     <this one>}: it handed its place over. Followed as far up as the chain goes.
//   clear     — /clear keeps the process (and the desktop's app id) and gives it a new
//     conversation id: the place belongs to the conversation that had them before.
//   copy      — a fork made by the host (a desktop side session, --fork-session) starts
//     with the records of the conversation it was copied from, under that conversation's
//     own sessionId. The last foreign sessionId before its own records is its parent.
//     A copy made through the SDK (agent-task context_run) rewrites sessionId and marks
//     each copied record with forkedFrom.sessionId instead.
//   parent    — whoever started the conversation named its parent in HEAD_CONTEXT_PARENT.
const TAIL = 4096, DEPTH = 32, LIMIT = 64 * 1024 * 1024;
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
    try { const row = JSON.parse(line); if (row.type === 'continued-in' && row.continuedInSessionId) return row.continuedInSessionId; } catch { /* a cut or broken line of the host's records */ }
  }
  return null;
}
// successor id -> the conversation it continues. One tail read per record file.
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
export function copiedFrom(transcript, self) {
  let text;
  try { if (fs.statSync(transcript).size > LIMIT) return null; text = fs.readFileSync(transcript, 'utf8'); } catch { return null; }
  // A copy made through the SDK marks every copied record with forkedFrom.sessionId.
  const marked = /"forkedFrom":\{"sessionId":"([^"]+)"/.exec(text.slice(0, 64 * 1024))?.[1];
  if (marked && marked !== self) return marked;
  let parent = null;
  for (const line of text.split('\n')) {
    const id = /"sessionId":"([^"]+)"/.exec(line)?.[1];
    if (!id) continue;
    if (id === self) break;
    parent = id;
  }
  return parent;
}
// The conversation this process (or desktop app id) ran before /clear gave it a new id.
function previousOfClear(project, self) {
  const owner = ownerOf(self);
  if (!owner) return null;
  let known;
  try { known = records(path.join(locations(project).state, 'conversations')).filter(c => c.host === 'claude' && c.conversation_id !== self); } catch { return null; }
  const same = c => (owner.hostSessionId && c.host_session_id === owner.hostSessionId) || (!owner.hostSessionId && c.pid === owner.pid);
  return known.filter(same).sort((a, b) => String(b.bound_at || '').localeCompare(String(a.bound_at || '')))[0]?.conversation_id || null;
}
export function ancestry(project, input, { directory = input.transcript_path ? path.dirname(input.transcript_path) : null } = {}) {
  const self = input.session_id;
  if (!self) return [];
  const links = [], seen = new Set([self]);
  const add = (conversation_id, kind) => { if (conversation_id && !seen.has(conversation_id)) { links.push({ conversation_id, kind }); seen.add(conversation_id); return true; } return false; };
  const named = process.env.HEAD_CONTEXT_PARENT;
  if (named) add(named, 'parent');
  const chain = directory ? continuations(directory) : new Map();
  for (let current = self, depth = 0; depth < DEPTH; depth++) { if (!add(chain.get(current), 'continued')) break; current = chain.get(current); }
  if (input.source === 'clear') add(previousOfClear(project, self), 'clear');
  if (input.transcript_path) add(copiedFrom(input.transcript_path, self), 'copy');
  return links;
}
