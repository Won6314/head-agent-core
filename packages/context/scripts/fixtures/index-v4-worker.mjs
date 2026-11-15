import fs from 'node:fs';
import { sessions } from '../../core/sessions.mjs';
import { withGraphRead } from '../../core/graph.mjs';

const [project, role, id, branch, barrier] = process.argv.slice(2);
const api = sessions(project, {
  host: Number(id) % 2 ? 'codex' : 'claude',
  now: () => Date.parse('2026-02-01T00:00:00.000Z'),
});
const emit = (x) => process.send({ ...x, pid: process.pid, at: Date.now() });

function installLockInstrumentation() {
  const held = new Map(),
    waiting = new Map();
  const mkdir = fs.mkdirSync,
    rm = fs.rmSync,
    append = fs.appendFileSync;
  let appended = false;
  fs.appendFileSync = function (...args) {
    const v = append(...args);
    appended = true;
    return v;
  };
  fs.mkdirSync = function (p, ...args) {
    if (!String(p).endsWith('.lock')) return mkdir(p, ...args);
    const index = String(p).endsWith('index-v5.sqlite.lock');
    if (index && [...held.keys()].some((f) => !f.endsWith('index-v5.sqlite.lock')))
      throw new Error('history -> index nesting');
    if (!index && [...held.keys()].some((f) => f.endsWith('index-v5.sqlite.lock')))
      throw new Error('index -> history nesting');
    const start = waiting.get(p) ?? performance.now();
    waiting.set(p, start);
    try {
      const v = mkdir(p, ...args);
      const at = performance.now();
      held.set(p, at);
      waiting.delete(p);
      emit({ event: 'acquire', file: p, wait: at - start });
      return v;
    } catch (e) {
      let owner = null;
      try {
        owner = fs.readFileSync(p + '/owner', 'utf8');
      } catch {}
      emit({ event: 'wait', file: p, code: e.code, owner, exists: fs.existsSync(p) });
      throw e;
    }
  };
  fs.rmSync = function (p, ...args) {
    const v = rm(p, ...args);
    if (held.has(p)) {
      emit({ event: 'release', file: p, hold: performance.now() - held.get(p) });
      held.delete(p);
      if (barrier && appended && !held.size && !String(p).endsWith('index-v5.sqlite.lock')) {
        appended = false;
        emit({ event: 'paused' });
        while (!fs.existsSync(barrier)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
    return v;
  };
}

function installGraphInstrumentation() {
  const proto = withGraphRead(project, (g) => Object.getPrototypeOf(g));
  for (const method of ['sync', 'forks', 'merges', 'recent', 'map', 'find', 'item']) {
    const original = proto[method];
    proto[method] = function (...args) {
      const t = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        emit({
          event: ['sync', 'forks', 'merges'].includes(method) ? method : 'callback',
          method,
          ms: performance.now() - t,
          changed: this.reindexed.length,
          records: this.db.prepare("SELECT count(*) n FROM nodes WHERE kind='checkpoint'").get().n,
        });
      }
    };
  }
}

function verify({ token, request, returned }) {
  const start = performance.now();
  emit({ event: 'start', method: 'verify', token, returned });
  try {
    const recent = api.inspect({ action: 'recent', name: 'A', branch: branch || 'main', count: 0 });
    const map = api.inspect({ action: 'map', name: 'A', branch: branch || undefined, limit: 0 });
    const find = api.inspect({ action: 'find', name: 'A', query: token, limit: 0 });
    if (!recent.includes(token) || !map.includes(token) || !find.includes(token))
      throw new Error('completed token invisible ' + token);
    const id = find.split(' · ')[0];
    if (!api.inspect({ action: 'entry', name: 'A', id }).includes(token)) throw new Error('entry missing');
    if (branch)
      withGraphRead(project, (g) => {
        for (const stem of ['main', branch])
          if (!g.own('A', stem).some((r) => g.detail(r).summary === token))
            throw new Error('branch/main snapshot mismatch');
      });
    emit({ event: 'verified', request, token, ms: performance.now() - start });
  } catch (e) {
    emit({ event: 'error', request, error: e.stack });
  }
}

function runCreate() {
  for (let i = 0; i < 8; i++) {
    api.branch({ action: 'create', branch: 'b' + i, parent: 'main', conversation_id: 'w' + id });
    api.load({ branch: 'main', conversation_id: 'w' + id });
  }
  process.disconnect();
}

function runReader() {
  process.on('message', (m) => {
    if (m.stop) process.exit(0);
    verify(m);
  });
  emit({ event: 'ready' });
}

function runWriter() {
  const n = role === 'single' ? 1 : 8;
  for (let i = 0; i < n; i++) {
    const token = 'token-' + id + '-' + i;
    const t = performance.now();
    emit({ event: 'start', method: 'save', token });
    api.save({ summary: token, history: 'body ' + token, next: 'next', conversation_id: 'w' + id });
    emit({ event: 'saved', token, returned: Date.now(), ms: performance.now() - t });
  }
  process.disconnect();
}

installLockInstrumentation();
installGraphInstrumentation();
api.load({ name: 'A', branch: branch || 'main', conversation_id: 'w' + id });
if (role === 'create') runCreate();
else if (role === 'reader') runReader();
else runWriter();
