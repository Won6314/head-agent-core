import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJSON, locations, recordFile, readLoose, records, noSymlink } from '../../core/storage.mjs';
import { takeFrom } from '../../core/inbox.mjs';
import { instructionLine } from '../../core/instruction.mjs';
import { agyOwner, antigravityAlive } from './process.mjs';

const presenceFile = (project, id) => recordFile(locations(project).state, 'presence', id, 'antigravity');
export const readPresence = (project, id) => readLoose(presenceFile(project, id));
export function writePresence(project, { conversation_id, transcript_path, said }) {
  const value = {
    ...readPresence(project, conversation_id),
    host: 'antigravity',
    conversation_id,
    cwd: project,
    // Replace owner identity on resume too; do not retain a previous process's start.
    pid: undefined,
    start: undefined,
    ...agyOwner(),
    ...(transcript_path ? { transcript_path } : {}),
    ...(said && !said.trim().startsWith('/') ? { said: instructionLine(said) } : {}),
    at: new Date().toISOString(),
  };
  atomicJSON(presenceFile(project, conversation_id), value);
  return value;
}
// A subagent is an in-conversation task: it is not listed, so its presence is removed.
export const dropPresence = (project, id) => fs.rmSync(presenceFile(project, id), { force: true });
export function antigravityLive(project, known = new Map()) {
  return records(path.join(locations(project).state, 'presence'), { loose: true })
    .filter((p) => p.host === 'antigravity' && antigravityAlive(p))
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
// Take via core/inbox.mjs as Codex does; only a missing inbox is empty, other first-listing failures become a hook error line.
export function take(project, id) {
  const dir = inboxDir(project, id);
  if (!fs.existsSync(dir)) return { messages: [], broken: [], done() {} };
  return takeFrom(dir, fs.readdirSync(dir));
}
