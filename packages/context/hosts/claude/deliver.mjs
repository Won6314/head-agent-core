import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { registry, registryDir } from './process.mjs';
import { pidAlive } from '../../core/liveness.mjs';

// Hands a message to a running Claude Code conversation the way another Claude
// conversation's SendMessage does: on its inbox socket (messagingSocketPath in
// ~/.claude/sessions/<pid>.json), an auth line with the conversation's peer token, then one
// JSON line. The conversation reads it as a <cross-session-message> and wakes if it is idle.
// The auth line is required on Windows (a connection whose first line is not a valid one is
// closed and its message dropped) and optional elsewhere; it is sent whenever the token is
// found. Nothing comes back on the connection, so a send that closes cleanly is "sent", not
// a receipt. Receipts Claude Code has (held, refused, dropped) go to a sender's own inbox.
// target: claude:<conversation id> (the address a Codex conversation is shown), or the
// uds:<socket> a Claude conversation is shown to another Claude conversation.
// Whether a Claude conversation can take a message now (it runs and has its inbox socket).
export const claudeReachable = id => Boolean(claudeSocket(`claude:${id}`));
export const claudeSocket = target => inboxOf(target)?.socket || null;
function inboxOf(target) {
  if (target.startsWith('uds:')) return { socket: target.slice(4) };
  const id = target.startsWith('claude:') ? target.slice(7) : null;
  if (!id) return null;
  const row = registry().find(r => r.sessionId === id && r.messagingSocketPath && pidAlive(r.pid));
  return row ? { socket: row.messagingSocketPath, pid: row.pid } : null;
}

// The inbox path in the form Claude Code hashes to name its key file: a Windows pipe as
// \\.\pipe\<name> with ASCII capitals lowered (LOCAL\ kept as local\), any other path
// resolved. A path with a .. segment has no key.
export function canonicalInbox(socket) {
  const pipe = /^[\\/]{2}[.?][\\/]pipe[\\/](?:(LOCAL)[\\/])?([^\\/]+)$/i.exec(socket);
  if (pipe) {
    if (pipe[2] === '.' || pipe[2] === '..' || /[. ]$/.test(pipe[2]) || (socket.startsWith('\\\\?\\') && socket.includes('/'))) return null;
    const name = pipe[1] === undefined ? pipe[2] : `${pipe[1]}\\${pipe[2]}`;
    return `\\\\.\\pipe\\${name.replace(/[A-Z]/g, c => c.toLowerCase())}`;
  }
  if (/(^|[\\/])\.\.([\\/]|$)/.test(socket)) return null;
  return path.resolve(socket);
}
// The peer token a running conversation published for its inbox:
// <sessions>/<pid>.<sha256 of the canonical inbox path>.key, {"peerToken": 32 hex, ...}.
// With several, the given owner's comes first, then a live owner's.
export function inboxToken(socket, pid) {
  const canonical = canonicalInbox(socket);
  if (!canonical) return null;
  const tail = `.${createHash('sha256').update(canonical).digest('hex')}.key`;
  let names;
  try { names = fs.readdirSync(registryDir()); } catch { return null; }
  const rank = owner => (owner === pid ? 0 : pidAlive(owner) ? 1 : 2);
  const keys = names.filter(n => n.endsWith(tail) && /^\d+\.[0-9a-f]{64}\.key$/.test(n))
    .map(n => ({ n, owner: Number(n.split('.')[0]) })).sort((a, b) => rank(a.owner) - rank(b.owner));
  for (const { n } of keys) {
    try {
      const file = path.join(registryDir(), n);
      if (fs.statSync(file).size > 4096) continue;
      const token = JSON.parse(fs.readFileSync(file, 'utf8')).peerToken;
      if (typeof token === 'string' && /^[0-9a-f]{32}$/.test(token)) return token;
    } catch { /* the next */ }
  }
  return null;
}

const attr = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function packet(text, { from, fromName }) {
  const head = `<cross-session-message from="${attr(from)}"${fromName ? ` from-name="${attr(fromName)}"` : ''}>`;
  return { msgV: 1, msg_id: randomUUID(), type: 'user', message: { role: 'user', content: `${head}\n${text}\n</cross-session-message>` }, priority: 'next', from };
}
// Not there: no running conversation at that address (closed, or a desktop conversation whose
// process the app stopped), or its socket refuses. Told apart from other failures (NotThere).
export class NotThere extends Error { }
export function deliverToClaude(target, text, { from, fromName, timeoutMs = 10000, requireAuth = process.platform === 'win32' } = {}) {
  const inbox = inboxOf(target);
  if (!inbox) return Promise.reject(new NotThere(`No running Claude conversation at ${target}`));
  const token = inboxToken(inbox.socket, inbox.pid);
  if (!token && requireAuth) return Promise.reject(new Error(`받는 Claude 대화의 인증 키를 찾지 못해 보내지 않았습니다: ${target}`));
  const auth = token ? `${JSON.stringify({ type: 'auth', token })}\n` : '';
  return new Promise((resolve, reject) => {
    const sock = net.connect({ path: inbox.socket });
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`Claude conversation at ${target} did not answer`)); }, timeoutMs);
    let reply = '';
    sock.on('connect', () => { sock.write(`${auth}${JSON.stringify(packet(text, { from, fromName }))}\n`); sock.end(); });
    sock.on('data', d => { reply += d; });
    sock.on('error', error => { clearTimeout(timer); const E = ['ENOENT', 'ECONNREFUSED'].includes(error.code) ? NotThere : Error; reject(new E(`Could not reach the Claude conversation at ${target}: ${error.message}`)); });
    sock.on('close', () => { clearTimeout(timer); resolve({ socket: inbox.socket, reply, authenticated: Boolean(token) }); });
  });
}
