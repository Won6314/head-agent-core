import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { antigravityAlive } from './process.mjs';
import { isLinux, isMac } from '../../core/platform.mjs';

const appData = () => path.join(os.homedir(), '.gemini', 'antigravity-cli');
export const keyDir = () => path.join(appData(), 'plugin_data', 'head-context', 'wake');
export const keyFile = ({ pid, start }) =>
  path.join(keyDir(), `${pid}-${crypto.createHash('sha256').update(String(start)).digest('hex').slice(0, 16)}.json`);
export const lockFile = (id) => path.join(appData(), 'presence', `${id}.lock`);

export function pruneKeys() {
  let names;
  try { names = fs.readdirSync(keyDir()); } catch { return; }
  for (const name of names) {
    const file = path.join(keyDir(), name);
    try {
      if (name.endsWith('.json')) {
        let value;
        try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {
          fs.rmSync(file, { force: true });
          continue;
        }
        if (!Number.isInteger(value?.pid) || !antigravityAlive({ pid: value.pid, start: value.start }))
          fs.rmSync(file, { force: true });
      } else if (name.endsWith('.tmp') && fs.statSync(file).mtimeMs < Date.now() - 3600000)
        fs.rmSync(file, { force: true });
    } catch {}
  }
}

export function claimAsk(owner) {
  if (!Number.isInteger(owner.pid) || !owner.start) return false;
  pruneKeys();
  fs.mkdirSync(keyDir(), { recursive: true, mode: 0o700 });
  let fd;
  try { fd = fs.openSync(keyFile(owner), 'wx', 0o600); } catch (error) {
    if (error.code !== 'EEXIST')
      console.error(`head-context: 깨우기 등록 요청을 남기지 못했습니다(${error.code || error.name}).`);
    return false;
  }
  fs.writeSync(fd, JSON.stringify({ pid: owner.pid, start: owner.start, asked_at: new Date().toISOString() }, null, 2) + '\n');
  fs.closeSync(fd);
  return true;
}

export function writeKey(owner, { address, token }) {
  let previous;
  try { previous = JSON.parse(fs.readFileSync(keyFile(owner), 'utf8')); } catch { previous = {}; }
  const { pid, start } = owner;
  const asked_at = previous.asked_at;
  const value = { pid, start, ...(asked_at ? { asked_at } : {}), address, token, registered_at: new Date().toISOString() };
  fs.mkdirSync(keyDir(), { recursive: true, mode: 0o700 });
  const temp = `${keyFile(owner)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temp, keyFile(owner)); } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

export function readKey(owner) {
  try {
    const value = JSON.parse(fs.readFileSync(keyFile(owner), 'utf8'));
    if (value.pid !== owner.pid || String(value.start) !== String(owner.start)) return null;
    return value;
  } catch { return null; }
}

export function portOf(address) {
  const match = /^(localhost|127\.0\.0\.1):(\d{1,5})$/.exec(address);
  const port = match ? Number(match[2]) : 0;
  return port >= 1 && port <= 65535 ? port : null;
}

export function holdsLock(pid, id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return false;
  try {
    const real = fs.realpathSync(lockFile(id));
    if (isLinux) {
      for (const name of fs.readdirSync(`/proc/${pid}/fd`)) {
        try { if (fs.readlinkSync(`/proc/${pid}/fd/${name}`) === real) return true; } catch {}
      }
    } else if (isMac) {
      const out = execFileSync('lsof', ['-a', '-p', String(pid), '-Fn', '--', real], {
        encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      return out.split('\n').includes(`n${real}`);
    }
  } catch {}
  return false;
}
