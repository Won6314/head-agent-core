import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJSON, locations, recordFile, readLoose, records, noSymlink } from '../../core/storage.mjs';
import { pidAlive } from '../../core/liveness.mjs';
import { envelope } from '../../core/protocol.mjs';
import { instructionLine } from '../../core/instruction.mjs';
import { RECENT_DAYS } from '../../core/recovery.mjs';

const presenceFile = (project, id) => recordFile(locations(project).state, 'presence', id, 'antigravity');
export const readPresence = (project, id) => readLoose(presenceFile(project, id));
export function writePresence(project, { conversation_id, transcript_path, said }) {
  const value = {
    ...readPresence(project, conversation_id),
    host: 'antigravity',
    conversation_id,
    cwd: project,
    ...(transcript_path ? { transcript_path } : {}),
    ...(said && !said.trim().startsWith('/') ? { said: instructionLine(said) } : {}),
    at: new Date().toISOString(),
  };
  atomicJSON(presenceFile(project, conversation_id), value);
  return value;
}
// There is no external wake or loaded-session query in this host. Like Codex's
// app presence, show conversations active within RECENT_DAYS; refreshed each turn.
export function antigravityLive(project, known = new Map(), { now = Date.now(), days = RECENT_DAYS } = {}) {
  return records(path.join(locations(project).state, 'presence'), { loose: true })
    .filter((p) => p.host === 'antigravity' && Date.parse(p.at) >= now - days * 86400000)
    .map((p) => ({
      conversation_id: p.conversation_id,
      host: 'antigravity',
      title: p.title || known.get(p.conversation_id)?.title,
      address: `antigravity:${p.conversation_id}`,
      last_at: Date.parse(p.at),
      entrypoint: 'antigravity-acp',
      said: p.said || null,
    }))
    .sort((a, b) => b.last_at - a.last_at);
}
const inboxDir = (project, id) => {
  recordFile(locations(project).state, 'inbox', id, 'antigravity');
  return noSymlink(path.join(locations(project).state, 'inbox', `antigravity-${id}`));
};
export function queue(project, id, { from, from_name, text }) {
  const at = new Date().toISOString();
  atomicJSON(path.join(inboxDir(project, id), `${at.replace(/[:.]/g, '-')}-${randomUUID()}.json`), {
    from,
    ...(from_name ? { from_name } : {}),
    text,
    at,
  });
}
// Same claim/ack boundary as Codex inbox: give, then done(). An interrupted
// claimant's messages return on the next turn; corrupt messages remain in .broken.
export function take(project, id, { now = Date.now() } = {}) {
  const dir = inboxDir(project, id);
  if (!fs.existsSync(dir)) return { messages: [], broken: [], done() {} };
  for (const name of fs.readdirSync(dir)) {
    const match = /^\.taking-(\d+)-/.exec(name);
    if (!match) continue;
    const claim = path.join(dir, name);
    try {
      if (pidAlive(Number(match[1])) && now - fs.statSync(claim).mtimeMs <= 10 * 60 * 1000) continue;
      for (const f of fs.readdirSync(claim))
        if (f.endsWith('.json')) fs.renameSync(path.join(claim, f), path.join(dir, f));
      fs.rmSync(claim, { recursive: true, force: true });
    } catch {
      /* another taker recovered it */
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
    }
    const m = readLoose(path.join(claim, f));
    if (m) messages.push(m);
    else {
      const aside = path.join(dir, '.broken');
      fs.mkdirSync(aside, { recursive: true });
      fs.renameSync(path.join(claim, f), path.join(aside, f));
      broken.push(path.join(aside, f));
    }
  }
  return { messages, broken, done: () => fs.rmSync(claim, { recursive: true, force: true }) };
}
export const asMessage = (m) => envelope({ from: m.from, fromName: m.from_name, text: m.text });
