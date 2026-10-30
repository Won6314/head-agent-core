import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { registry } from './process.mjs';
import { pidAlive } from '../../core/liveness.mjs';

// Hands a message to a running Claude Code conversation the way another Claude
// conversation's SendMessage does: one JSON line on its inbox socket
// (messagingSocketPath in ~/.claude/sessions/<pid>.json). The conversation reads it as a
// <cross-session-message> and wakes if it is idle.
// target: claude:<conversation id> (the address a Codex conversation is shown), or the
// uds:<socket> a Claude conversation is shown to another Claude conversation.
// Whether a Claude conversation can take a message now (it runs and has its inbox socket).
export const claudeReachable = id => Boolean(claudeSocket(`claude:${id}`));
export function claudeSocket(target) {
  if (target.startsWith('uds:')) return target.slice(4);
  const id = target.startsWith('claude:') ? target.slice(7) : null;
  if (!id) return null;
  const row = registry().find(r => r.sessionId === id && r.messagingSocketPath && pidAlive(r.pid));
  return row?.messagingSocketPath || null;
}
const attr = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function packet(text, { from, fromName }) {
  const head = `<cross-session-message from="${attr(from)}"${fromName ? ` from-name="${attr(fromName)}"` : ''}>`;
  return { msgV: 1, msg_id: randomUUID(), type: 'user', message: { role: 'user', content: `${head}\n${text}\n</cross-session-message>` }, priority: 'next', from };
}
// Not there: no running conversation at that address (closed, or a desktop conversation whose
// process the app stopped), or its socket refuses. Told apart from other failures (NotThere).
export class NotThere extends Error { }
export function deliverToClaude(target, text, { from, fromName, timeoutMs = 10000 } = {}) {
  const socket = claudeSocket(target);
  if (!socket) return Promise.reject(new NotThere(`No running Claude conversation at ${target}`));
  return new Promise((resolve, reject) => {
    const sock = net.connect({ path: socket });
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`Claude conversation at ${target} did not answer`)); }, timeoutMs);
    let reply = '';
    sock.on('connect', () => { sock.write(`${JSON.stringify(packet(text, { from, fromName }))}\n`); sock.end(); });
    sock.on('data', d => { reply += d; });
    sock.on('error', error => { clearTimeout(timer); const E = ['ENOENT', 'ECONNREFUSED'].includes(error.code) ? NotThere : Error; reject(new E(`Could not reach the Claude conversation at ${target}: ${error.message}`)); });
    sock.on('close', () => { clearTimeout(timer); resolve({ socket, reply }); });
  });
}
