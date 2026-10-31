import net from 'node:net';
import { spawn } from 'node:child_process';
import { Duplex } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { VERSION } from '../../core/mcp.mjs';
import { isWindows } from '../../core/platform.mjs';

// The Codex shared engine (`codex app-server --listen unix://`, what `codex app-server daemon
// start` runs) takes JSON-RPC over a WebSocket on its control socket. Terminal Codex windows
// attach to it on their own. This is a small client for that socket: one connection per job,
// closed when the job ends, so the engine never routes a window's approvals to us.
export const codexHome = (env = process.env) => env.CODEX_HOME || path.join(os.homedir(), '.codex');
export const controlSocket = home => path.join(home, 'app-server-control', 'app-server-control.sock');

// A server error, with the engine's own message and code (raw keeps the error as sent).
class EngineError extends Error {
  constructor(method, error) { super(`Codex 엔진 요청 실패(${method}): ${error?.message ?? '알 수 없는 오류'} (code ${error?.code ?? 0})`); this.code = error?.code; this.raw = error; }
}

// Node on Windows takes a path as a named pipe and cannot reach the engine's AF_UNIX socket;
// there the bytes go through Codex's own `codex app-server proxy --sock <socket>` (stdio to
// the control socket), started from the engine's binary when it is known.
function proxied(socket, bin) {
  const child = spawn(bin || 'codex', ['app-server', 'proxy', '--sock', socket], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const sock = Duplex.from({ readable: child.stdout, writable: child.stdin });
  child.once('spawn', () => sock.emit('connect'));
  child.once('error', error => sock.emit('error', error));
  child.once('exit', () => sock.destroy());
  sock.once('close', () => { try { child.kill(); } catch { /* already gone */ } });
  return sock;
}
// at: where the engine is — its control socket and, when known, its binary ({ socket, bin }:
// a presence's engine, threads.mjs engineFrom).
async function connect({ socket, bin = null }, { timeoutMs = 10000, name = 'head_context' } = {}) {
  const sock = isWindows ? proxied(socket, bin) : net.connect({ path: socket });
  sock.setNoDelay?.(true);
  let buffer = Buffer.alloc(0), upgraded = false, seq = 0, closed = false;
  const pending = new Map(), listeners = new Set();
  const fail = error => { closed = true; for (const p of pending.values()) p.reject(error); pending.clear(); };
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(`Codex 엔진이 응답하지 않습니다: ${socket}`)); sock.destroy(); }, timeoutMs);
    sock.once('error', error => { clearTimeout(timer); reject(error); });
    sock.once('connect', () => sock.write(`GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    sock.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n'); if (end < 0) return;
        const head = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 4);
        if (!/^HTTP\/1\.1 101/.test(head)) { clearTimeout(timer); reject(new Error(`Codex 엔진이 연결을 거절했습니다: ${head.split('\r\n')[0]}`)); sock.destroy(); return; }
        upgraded = true; clearTimeout(timer); resolve();
      }
      frames();
    });
  });
  sock.on('error', error => fail(error));
  sock.on('close', () => fail(new Error('Codex 엔진이 연결을 닫았습니다')));
  let fragments = [];
  const frames = () => {
    while (buffer.length >= 2) {
      const fin = buffer[0] & 0x80, op = buffer[0] & 0x0f, masked = buffer[1] & 0x80;
      let n = buffer[1] & 0x7f, off = 2;
      if (n === 126) { if (buffer.length < 4) return; n = buffer.readUInt16BE(2); off = 4; }
      else if (n === 127) { if (buffer.length < 10) return; n = Number(buffer.readBigUInt64BE(2)); off = 10; }
      const maskAt = off; if (masked) off += 4;
      if (buffer.length < off + n) return;
      let data = buffer.subarray(off, off + n);
      if (masked) { const m = buffer.subarray(maskAt, maskAt + 4); data = Buffer.from(data.map((b, i) => b ^ m[i % 4])); }
      buffer = buffer.subarray(off + n);
      if (op === 0x9) { write(data, 0xA); continue; }
      if (op === 0x8) { sock.end(); continue; }
      if (op === 0xA) continue;
      fragments.push(data);
      if (!fin) continue;
      const text = Buffer.concat(fragments).toString('utf8'); fragments = [];
      let message; try { message = JSON.parse(text); } catch { continue; }
      if (message.id !== undefined && message.method === undefined) {
        const p = pending.get(message.id); if (!p) continue; pending.delete(message.id);
        if (message.error) p.reject(new EngineError(p.method, message.error)); else p.resolve(message.result);
      } else if (message.method && message.id !== undefined) {
        // A request from the engine (an approval, a question): this connection answers none.
        write(Buffer.from(JSON.stringify({ id: message.id, error: { code: -32601, message: 'not handled by this client' } })), 0x1);
      } else if (message.method) for (const l of listeners) l(message);
    }
  };
  const write = (data, op = 0x1) => {
    const mask = crypto.randomBytes(4), n = data.length;
    const head = n < 126 ? Buffer.from([0x80 | op, 0x80 | n]) : n < 65536 ? Buffer.from([0x80 | op, 0x80 | 126, n >> 8, n & 0xff]) : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
    const body = Buffer.from(data.map((b, i) => b ^ mask[i % 4]));
    sock.write(Buffer.concat([head, mask, body]));
  };
  const request = (method, params = {}, { timeout = 30000 } = {}) => new Promise((resolve, reject) => {
    if (closed) { reject(new Error('Codex 엔진 연결이 이미 닫혔습니다')); return; }
    const id = `head-context-${++seq}`;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex 엔진 요청 시간 초과: ${method}`)); }, timeout);
    pending.set(id, { method, resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    write(Buffer.from(JSON.stringify({ id, method, params })));
  });
  await ready;
  const engine = {
    request,
    notify: (method, params) => write(Buffer.from(JSON.stringify(params === undefined ? { method } : { method, params }))),
    on: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    close: () => { closed = true; try { sock.end(); sock.destroy(); } catch { /* already closed */ } },
    info: null,
  };
  try {
    engine.info = await request('initialize', { clientInfo: { name, title: 'head-context', version: VERSION }, capabilities: { experimentalApi: true, requestAttestation: false } });
    engine.notify('initialized');
  } catch (error) { engine.close(); throw error; }
  return engine;
}

export async function withEngine(at, job, options) {
  const engine = await connect(at, options);
  try { return await job(engine); } finally { engine.close(); }
}
