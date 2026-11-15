import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { locked } from '../core/lock.mjs';

const fixture = () =>
  path.join(fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT || process.env.HOME, 'lock-')), 'record.md');

test('lock release retries transient errors before success, 50ms apart, preserving the return value', () => {
  for (const code of ['EBUSY', 'EPERM', 'ENOTEMPTY']) {
    const file = fixture(),
      rm = fs.rmSync;
    let attempts = 0;
    fs.rmSync = (p, ...args) => {
      if (p === file + '.lock' && ++attempts < 3) throw Object.assign(new Error(code), { code });
      return rm(p, ...args);
    };
    const start = performance.now();
    try {
      assert.equal(
        locked(file, () => 42),
        42,
      );
    } finally {
      fs.rmSync = rm;
    }
    assert.equal(attempts, 3);
    assert.ok(performance.now() - start >= 95);
    assert.ok(!fs.existsSync(file + '.lock'));
  }
});

test('lock release bounded retries rename the live owner aside without deleting the stale name', () => {
  const file = fixture(),
    lock = file + '.lock',
    rm = fs.rmSync,
    wait = Atomics.wait;
  const waits = [],
    removals = [];
  let attempts = 0;
  fs.rmSync = (p, ...args) => {
    removals.push(p);
    if (p === lock) {
      attempts++;
      throw Object.assign(new Error('busy'), { code: 'EBUSY' });
    }
    return rm(p, ...args);
  };
  Atomics.wait = (...args) => {
    waits.push(args[3]);
    return 'timed-out';
  };
  const original = new Error('callback failure');
  try {
    assert.throws(
      () =>
        locked(file, () => {
          throw original;
        }),
      (e) => e === original,
    );
  } finally {
    fs.rmSync = rm;
    Atomics.wait = wait;
  }
  assert.equal(attempts, 11);
  assert.deepEqual(waits, Array(10).fill(50));
  assert.deepEqual(removals, Array(11).fill(lock));
  assert.ok(!fs.existsSync(lock));
  const aside = fs.readdirSync(path.dirname(file)).find((f) => f.startsWith(`record.md.lock.stale-${process.pid}-`));
  assert.ok(aside);
  assert.equal(fs.readFileSync(path.join(path.dirname(file), aside, 'owner'), 'utf8'), String(process.pid));
  assert.equal(
    locked(file, () => 'next'),
    'next',
  );
});

test('lock release non-transient failure renames immediately; rename failure emits one sanitized line and cannot mask fn', () => {
  for (const stderrFails of [false, true]) {
    const file = fixture(),
      lock = file + '.lock';
    const rm = fs.rmSync,
      rename = fs.renameSync,
      write = process.stderr.write,
      wait = Atomics.wait;
    let attempts = 0,
      renamed = 0;
    const lines = [];
    fs.rmSync = (p, ...args) => {
      if (p === lock) {
        attempts++;
        throw Object.assign(new Error('no'), { code: 'EACCES' });
      }
      return rm(p, ...args);
    };
    fs.renameSync = (p, ...args) => {
      if (p === lock) {
        renamed++;
        throw new Error('last\r\nmessage');
      }
      return rename(p, ...args);
    };
    process.stderr.write = (line) => {
      lines.push(line);
      if (stderrFails) throw new Error('stderr');
      return true;
    };
    Atomics.wait = () => assert.fail('non-transient release must not wait');
    const original = new Error('original');
    try {
      if (stderrFails)
        assert.throws(
          () =>
            locked(file, () => {
              throw original;
            }),
          (e) => e === original,
        );
      else
        assert.equal(
          locked(file, () => 'saved'),
          'saved',
        );
    } finally {
      fs.rmSync = rm;
      fs.renameSync = rename;
      process.stderr.write = write;
      Atomics.wait = wait;
    }
    assert.equal(attempts, 1);
    assert.equal(renamed, 1);
    assert.deepEqual(lines, [`head-context: 잠금 해제 실패: ${lock} (last  message)\n`]);
  }
});

test('lock release retry exhaustion plus rename failure uses last error code exactly once', () => {
  const file = fixture(),
    lock = file + '.lock';
  const rm = fs.rmSync,
    rename = fs.renameSync,
    write = process.stderr.write,
    wait = Atomics.wait;
  let attempts = 0;
  const waits = [],
    lines = [];
  fs.rmSync = (p, ...args) => {
    if (p === lock) {
      attempts++;
      throw Object.assign(new Error('busy'), { code: 'EPERM' });
    }
    return rm(p, ...args);
  };
  fs.renameSync = () => {
    throw Object.assign(new Error('rename'), { code: 'EACCES' });
  };
  Atomics.wait = (...args) => {
    waits.push(args[3]);
  };
  process.stderr.write = (line) => {
    lines.push(line);
    return true;
  };
  try {
    assert.equal(
      locked(file, () => 3),
      3,
    );
  } finally {
    fs.rmSync = rm;
    fs.renameSync = rename;
    process.stderr.write = write;
    Atomics.wait = wait;
  }
  assert.equal(attempts, 11);
  assert.deepEqual(waits, Array(10).fill(50));
  assert.deepEqual(lines, [`head-context: 잠금 해제 실패: ${lock} (EACCES)\n`]);
});

test('lock acquisition preserves live/dead owner, ownerless 30s policy, 20ms polling and 10s limit', () => {
  for (const mode of ['live-old', 'dead', 'ownerless-new', 'ownerless-old']) {
    const file = fixture(),
      lock = file + '.lock';
    fs.mkdirSync(lock);
    if (mode.startsWith('live')) fs.writeFileSync(path.join(lock, 'owner'), String(process.pid));
    if (mode === 'dead') fs.writeFileSync(path.join(lock, 'owner'), '2147483647');
    const start = Date.now();
    const mtime = mode.endsWith('old') || mode === 'dead' ? start - 60000 : start;
    fs.utimesSync(lock, mtime / 1000, mtime / 1000);
    const now = Date.now,
      wait = Atomics.wait;
    let elapsed = 0,
      called = false;
    Date.now = () => start + elapsed;
    Atomics.wait = (...args) => {
      assert.equal(args[3], 20);
      elapsed += 20;
    };
    try {
      if (mode === 'live-old' || mode === 'ownerless-new') {
        assert.throws(
          () =>
            locked(file, () => {
              called = true;
            }),
          /잠금을 얻지 못했습니다/,
        );
        assert.equal(called, false);
        assert.equal(elapsed, 10020);
        assert.ok(fs.existsSync(lock));
      } else
        assert.equal(
          locked(file, () => 'acquired'),
          'acquired',
        );
    } finally {
      Date.now = now;
      Atomics.wait = wait;
    }
  }
});
