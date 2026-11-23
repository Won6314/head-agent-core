import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readLoose } from './storage.mjs';
import { pidAlive } from './liveness.mjs';
import { envelope } from './protocol.mjs';

export const STALE_MS = 10 * 60 * 1000;
// The waiting messages, oldest first, taken out of the inbox for one prompt.
// A message is taken by moving its file into this taker's own folder (.taking-<pid>-<id>),
// so two takers at once never both get it; the folder is removed by done(), after the
// messages were given. A taker that died before that leaves its folder behind, and the next
// taker puts those messages back first (its process is gone, or it is older than STALE_MS).
// So a message is given once, or once more: if a taker dies between giving and done(), or if
// a living taker is held past STALE_MS and another taker puts its messages back.
// A message file that cannot be read is not given and not removed: it is moved to the
// inbox's .broken folder, and its path is returned (broken) for the conversation to be told.
// The caller does the first folder listing by its own rules.
export function takeFrom(dir, names, { now = Date.now() } = {}) {
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
// A waiting message as the conversation is given it (core/protocol.mjs envelope).
export const asMessage = (m) => envelope({ from: m.from, fromName: m.from_name, text: m.text });
