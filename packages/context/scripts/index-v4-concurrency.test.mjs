import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sessions } from '../core/sessions.mjs';
import { withGraphRead } from '../core/graph.mjs';

const worker = new URL('./fixtures/index-v4-worker.mjs', import.meta.url);
const root = process.env.HEAD_CONTEXT_TEST_ROOT || process.env.HOME;
const events = [];
function child(project, role, id, branch = '', barrier = '') {
  const proc = spawn(process.execPath, [worker.pathname, project, role, String(id), branch, barrier], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const messages = [],
    waiting = [];
  let stderr = '';
  proc.stderr.on('data', (d) => {
    stderr += d;
  });
  proc.on('message', (m) => {
    events.push(m);
    messages.push(m);
    for (const w of [...waiting])
      if (w.predicate(m)) {
        waiting.splice(waiting.indexOf(w), 1);
        w.resolve(m);
      }
  });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('exit', (code, signal) =>
      code === 0 || signal === 'SIGKILL' ? resolve() : reject(new Error(stderr || `worker exit ${code}`)),
    );
  });
  const next = (predicate) => {
    const found = messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`worker message timeout: ${stderr}`)), 30000);
      waiting.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  };
  return { proc, messages, done, next };
}
const fixture = () => {
  const project = fs.mkdtempSync(path.join(root, 'parallel-'));
  const api = sessions(project);
  api.create({ name: 'A', context: 'concurrency', conversation_id: 'parent' });
  return { project, api };
};

for (const branch of ['', 'shared'])
  test(
    `v4 processes: 4x8 ${branch ? 'branch+main' : 'main'} writers, four IPC readers, fixed timestamps and cross-host visibility`,
    { timeout: 60000 },
    async (t) => {
      const { project, api } = fixture();
      if (branch) api.branch({ action: 'create', branch, conversation_id: 'parent' });
      const readers = Array.from({ length: 4 }, (_, i) => child(project, 'reader', 10 + i, branch));
      const writers = [];
      t.after(() => {
        for (const c of [...readers, ...writers]) if (c.proc.exitCode === null) c.proc.kill('SIGKILL');
      });
      await Promise.all(readers.map((r) => r.next((m) => m.event === 'ready')));
      let request = 0;
      const verified = [];
      for (let i = 0; i < 4; i++) {
        const c = child(project, 'writer', i, branch);
        writers.push(c);
        c.proc.on('message', (m) => {
          if (m.event !== 'saved') return;
          const reader = readers[request % 4],
            n = request++;
          // This instruction is sent only after the writer's success-return signal.
          const check = reader
            .next((r) => r.request === n && ['verified', 'error'].includes(r.event))
            .then((r) => assert.equal(r.event, 'verified', r.error));
          verified.push(check);
          reader.proc.send({ token: m.token, returned: m.returned, request: n });
        });
      }
      await Promise.all(writers.map((w) => w.done));
      await Promise.all(verified);
      assert.equal(request, 32);
      for (const r of readers) r.proc.send({ stop: true });
      await Promise.all(readers.map((r) => r.done));
      withGraphRead(project, (g) => {
        const rows = g.own('A', branch || 'main');
        assert.equal(rows.length, 32);
        assert.equal(new Set(rows.map((r) => r.id)).size, 32);
        if (branch) assert.equal(g.own('A', 'main').length, 32);
      });
    },
  );

test(
  'v4 process barriers: late refresh cannot delete a later commit; killed md-only writer is recovered on read',
  { timeout: 30000 },
  async (t) => {
    for (const kill of [false, true]) {
      const { project } = fixture(),
        barrier = path.join(project, 'resume');
      const a = child(project, 'single', 20, '', barrier);
      t.after(() => {
        if (a.proc.exitCode === null) a.proc.kill('SIGKILL');
      });
      await a.next((m) => m.event === 'paused');
      if (kill) {
        a.proc.kill('SIGKILL');
        await a.done;
      } else {
        const b = child(project, 'single', 21);
        await b.done;
        fs.writeFileSync(barrier, 'resume');
        await a.done;
      }
      withGraphRead(project, (g) => {
        const summaries = g.recent('A', 'main', 0).map((e) => e.summary);
        assert.ok(summaries.includes('token-20-0'));
        if (!kill) assert.ok(summaries.includes('token-21-0'));
      });
    }
  },
);

test('v4 branch create and save run without index/history nesting or deadlock', { timeout: 30000 }, async () => {
  const { project } = fixture();
  await Promise.all([child(project, 'create', 31).done, child(project, 'writer', 30).done]);
  assert.equal(
    withGraphRead(project, (g) => g.branches('A').length),
    8,
  );
});

test('v4 concurrency evidence: latency differs from actual mkdir wait/hold; all graph reads acquire lock', () => {
  const stats = (values) => {
    const a = values.sort((a, b) => a - b);
    return {
      count: a.length,
      min: a[0],
      median: a[Math.floor(a.length / 2)],
      p95: a[Math.min(a.length - 1, Math.floor(a.length * 0.95))],
      max: a.at(-1),
    };
  };
  const summary = {
    node: process.version,
    latencyMs: stats(events.filter((e) => ['saved', 'verified'].includes(e.event)).map((e) => e.ms)),
    lockWaitMs: stats(events.filter((e) => e.event === 'acquire').map((e) => e.wait)),
    lockHoldMs: stats(events.filter((e) => e.event === 'release').map((e) => e.hold)),
    timeouts: events.filter((e) => /잠금을 얻지/.test(e.error || '')).length,
  };
  assert.ok(events.some((e) => e.event === 'acquire' && e.file.endsWith('index-v5.sqlite.lock')));
  for (const pid of new Set(events.map((e) => e.pid))) {
    let count = null;
    for (const e of events.filter((e) => e.pid === pid)) {
      if (e.event === 'start' && e.method === 'verify') count = 0;
      if (count !== null && e.event === 'acquire' && e.file.endsWith('index-v5.sqlite.lock')) count++;
      if (e.event === 'verified') {
        assert.ok(count >= 4, 'every inspect read must acquire the index lock');
        count = null;
      }
    }
  }
  assert.ok(!events.some((e) => e.event === 'error'));
  fs.writeFileSync(path.join(root, 'v4-concurrency-events.json'), JSON.stringify({ summary, events }, null, 2));
  console.log(JSON.stringify(summary));
});
