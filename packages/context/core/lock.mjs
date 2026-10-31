import fs from 'node:fs';
import path from 'node:path';
import { noSymlink } from './storage.mjs';
import { pidAlive } from './liveness.mjs';

// The lock is a directory holding its owner's pid. A lock whose owner has died
// (a killed hook, a restarted server mid-read) is moved aside and removed, so it
// can never hold every later writer and reader off for good.
function lockOwner(lock) {
  try {
    return Number(fs.readFileSync(path.join(lock, 'owner'), 'utf8')) || null;
  } catch {
    return null;
  }
}
function clearStale(lock) {
  let age;
  try {
    age = Date.now() - fs.statSync(lock).mtimeMs;
  } catch {
    return true;
  }
  const owner = lockOwner(lock);
  // Without an owner file the holder may be between mkdir and writing it.
  if (owner ? pidAlive(owner) : age < 30000) return false;
  const aside = `${lock}.stale-${process.pid}-${Date.now()}`;
  try {
    fs.renameSync(lock, aside);
  } catch {
    return true;
  }
  // Another process may have replaced the dead lock in between; give it back.
  if (lockOwner(aside) !== owner) {
    try {
      fs.renameSync(aside, lock);
    } catch {
      /* a newer lock already stands there: nothing to give back */
    }
    return false;
  }
  fs.rmSync(aside, { recursive: true, force: true });
  return true;
}
export function locked(file, fn) {
  noSymlink(file);
  const lock = file + '.lock',
    until = Date.now() + 10000;
  while (true) {
    try {
      fs.mkdirSync(lock);
      try {
        fs.writeFileSync(path.join(lock, 'owner'), String(process.pid));
      } catch {
        /* the lock holds without its owner file; clearStale then goes by its age */
      }
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (clearStale(lock)) continue;
      if (Date.now() > until) throw new Error(`잠금을 얻지 못했습니다: ${file}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}
