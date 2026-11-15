import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { sessions } from '../core/sessions.mjs';
import { withGraph, withGraphRead, checkpointId, stemId } from '../core/graph.mjs';
import { branchText, branchHeader } from '../core/branch-format.mjs';
import { entry } from '../core/storage.mjs';
import { sqlite } from '../core/platform.mjs';

const root = process.env.HEAD_CONTEXT_TEST_ROOT || process.env.HOME;
const stamp = '2026-01-01T00:00:00.000Z';
const rec = (summary, timestamp = stamp, history = '한글🙂 body') => entry({ summary, timestamp, history, next: '계속' });
const fixture = () => {
  const project = fs.mkdtempSync(path.join(root, 'v4-'));
  const s = sessions(project, { now: () => Date.parse(stamp) });
  s.create({ name: 'A', context: '  방향🙂\r\n', conversation_id: 'a' });
  s.create({ name: 'B', context: '다른 세션', conversation_id: 'b' });
  const base = path.join(project, '.head/sessions/A');
  const file = path.join(base, 'history.md');
  return { project, s, base, file };
};
const capture = (g, name) => ({
  nodes: g.db.prepare('SELECT * FROM nodes WHERE session=? ORDER BY id').all(name),
  edges: g.db.prepare('SELECT e.* FROM edges e JOIN nodes n ON n.id=e.src WHERE n.session=? ORDER BY src,dst,kind').all(name),
});
const trace = (g, fn) => {
  const db = g.db, prepare = db.prepare.bind(db), writes = [];
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (/^(INSERT|UPDATE|DELETE)/.test(sql)) {
      const run = statement.run.bind(statement);
      statement.run = (...args) => {
        const result = run(...args);
        writes.push({ sql, args, changes: Number(result.changes) });
        return result;
      };
    }
    return statement;
  };
  try { fn(); } finally { db.prepare = prepare; }
  return writes;
};

test('v4 diff: duplicate occurrence shifts, seq changes, exact body/hash and unchanged session writes', () => {
  const { project, file } = fixture();
  fs.writeFileSync(path.join(project, '.head/sessions/B/history.md'), rec('B-one') + rec('B-two', '2026-01-02'));
  withGraph(project, () => {});
  fs.writeFileSync(file, rec('one') + rec('two') + rec('three'));
  withGraph(project, (g) => {
    const b = capture(g, 'B');
    const bIds = new Set(b.nodes.map((r) => r.id));
    const unchanged = trace(g, () => {
      const read = fs.readFileSync;
      fs.readFileSync = (f, ...args) => { assert.ok(!String(f).endsWith('.md')); return read(f, ...args); };
      try { g.sync(); } finally { fs.readFileSync = read; }
    });
    assert.deepEqual(g.reindexed, [file]); // only the initial sync, not the unchanged one
    assert.equal(unchanged.length, 0);
    const id = checkpointId('A', 'main', stamp);
    const second = checkpointId('A', 'main', stamp, 2);
    assert.equal(g.item(second).summary, 'two');
    const short = g.shortIds('A').get(second);
    assert.equal(g.entry(short, 'A').id, second);
    fs.writeFileSync(file, rec('zero') + rec('one') + rec('two') + rec('three'));
    const inserted = trace(g, () => g.sync());
    assert.equal(g.item(id).summary, 'zero');
    assert.equal(g.item(second).summary, 'one');
    assert.equal(inserted.filter((w) => w.sql.startsWith('INSERT INTO nodes')).length, 1);
    assert.equal(inserted.filter((w) => w.sql.startsWith('UPDATE nodes')).length, 3);
    assert.ok(!inserted.some((w) => w.args.some((a) => bIds.has(a))));
    assert.deepEqual(capture(g, 'B'), b);
    fs.writeFileSync(file, rec('one') + rec('two') + rec('three'));
    const removed = trace(g, () => g.sync());
    assert.equal(removed.filter((w) => w.sql.startsWith('DELETE FROM nodes')).length, 1);
    const distinct = ['2026-01-02', '2026-01-03'].map((t) => rec(t, t));
    fs.writeFileSync(file, distinct.join('')); g.sync();
    fs.writeFileSync(file, distinct.reverse().join(''));
    const reordered = trace(g, () => g.sync(new Set([file])));
    assert.equal(reordered.filter((w) => w.sql.startsWith('UPDATE nodes')).length, 2);
    console.log(JSON.stringify({ checkpointDiff: {
      unchangedWrites: unchanged.length,
      inserted: inserted.filter((w) => w.sql.startsWith('INSERT INTO nodes')).length,
      updated: inserted.filter((w) => w.sql.startsWith('UPDATE nodes')).length,
      deleted: removed.filter((w) => w.sql.startsWith('DELETE FROM nodes')).length,
      seqOnlyUpdates: reordered.filter((w) => w.sql.startsWith('UPDATE nodes')).length,
      unchangedSessionWrites: inserted.filter((w) => w.args.some((a) => bIds.has(a))).length,
    } }));
    assert.deepEqual(g.own('A', 'main').map((r) => r.seq), [0, 1]);
    fs.writeFileSync(file, rec('CRLF').replaceAll('\n', '\r\n') + '이어쓰기🙂'); g.sync();
    const row = g.own('A', 'main')[0];
    assert.ok(row.body.includes('\r\n'));
    assert.ok(row.body.endsWith('이어쓰기🙂'));
    assert.equal(row.hash, createHash('sha256').update(row.body).digest('hex'));
    assert.deepEqual(capture(g, 'B'), b);
  });
  assert.deepEqual(withGraphRead(project, (g) => g.reindexed), []);
});

test('v4 raw reads need no md access after sync; header recap, context and detail retain their contracts', () => {
  const { project, s, base } = fixture();
  s.save({ summary: 'parent', history: '원문🙂', conversation_id: 'a' });
  s.branch({ action: 'create', branch: 'branch', conversation_id: 'a' });
  s.save({ summary: 'child', history: '본문', recap: '정리🙂', conversation_id: 'a' });
  withGraph(project, (g) => {
    const row = g.db.prepare('SELECT * FROM nodes WHERE id=?').get(stemId('A', 'branch'));
    const text = fs.readFileSync(path.join(base, 'work/branch/history.md'), 'utf8');
    assert.equal(row.body, text.slice(0, branchHeader(text).end));
    assert.equal(row.hash, createHash('sha256').update(row.body).digest('hex'));
    const before = { session: g.session('A'), header: g.header('A', 'branch'), find: g.find({ query: '본문' }) };
    const read = fs.readFileSync, open = fs.openSync;
    fs.readFileSync = fs.openSync = () => { throw new Error('md access forbidden'); };
    try {
      assert.equal(g.read(null), null);
      assert.deepEqual(g.session('A'), before.session);
      assert.deepEqual(g.header('A', 'branch'), before.header);
      assert.deepEqual(g.find({ query: '본문' }), before.find);
      assert.equal(g.item(before.find[0].id).start, 0);
    } finally { fs.readFileSync = read; fs.openSync = open; }
  });
});

test('v4 relationships: empty first/removed checkpoint, nested forks, anchor_id priority and partial errors', () => {
  const { project, file, base } = fixture();
  fs.writeFileSync(file, rec('one') + rec('two'));
  const branch = path.join(base, 'work/branch/history.md');
  fs.mkdirSync(path.dirname(branch), { recursive: true });
  fs.writeFileSync(branch, branchText({ name: 'branch', label: 'branch', session: 'A', parent: 'main', anchor: stamp, anchorId: checkpointId('A', 'main', stamp) }));
  const edge = (g, kind) => g.db.prepare('SELECT * FROM edges WHERE kind=? ORDER BY src,dst').all(kind);
  withGraph(project, (g) => {
    assert.ok(edge(g, 'fork').some((e) => e.src === checkpointId('A', 'main', stamp)));
    fs.appendFileSync(branch, rec('child', '2026-01-04')); g.sync();
    assert.ok(edge(g, 'next').some((e) => e.src === checkpointId('A', 'main', stamp) && e.dst.includes('branch@')));
    const child = path.join(base, 'work/child/history.md');
    fs.mkdirSync(path.dirname(child), { recursive: true });
    fs.writeFileSync(child, branchText({ name: 'child', label: 'child', session: 'A', parent: 'branch', anchor: '2026-01-04' }) + rec('nested', '2026-01-05'));
    g.sync(); assert.equal(g.lineage('A', 'child').length, 3);
    fs.writeFileSync(branch, fs.readFileSync(branch, 'utf8').split('\n\n## ')[0]); g.sync();
    assert.ok(!edge(g, 'next').some((e) => e.dst.includes('branch@')));
    assert.ok(g.errors.some((e) => /갈래 체크포인트 없음/.test(e.error)));
    fs.writeFileSync(file, rec('later', '2026-01-06')); g.sync();
    assert.ok(g.errors.some((e) => /branch ← main/.test(e.error)));
    fs.writeFileSync(branch, fs.readFileSync(branch, 'utf8').replace(/^갈래-ID:.*\n/m, ''));
    fs.writeFileSync(file, rec('one') + rec('two')); g.sync();
    assert.ok(edge(g, 'fork').some((e) => e.src === checkpointId('A', 'main', stamp, 2)));
  });
});

test('v4 external edits: marker/context deletion and restoration, moves, artifacts and points re-resolution', () => {
  const { project, file, base } = fixture();
  fs.writeFileSync(file, rec('refs', stamp, '[new](new.md) `back.md`'));
  withGraph(project, (g) => {
    assert.equal(g.db.prepare("SELECT count(*) n FROM edges WHERE kind='points'").get().n, 0);
    fs.writeFileSync(path.join(base, 'new.md'), 'new');
    fs.writeFileSync(path.join(base, 'back.md'), 'back');
    g.sync(); assert.deepEqual(g.files('A', { id: checkpointId('A', 'main', stamp), depth: 1 }).split('\n').slice(1), ['(가리킨 파일 없음)']);
    fs.appendFileSync(file, rec('more', '2026-01-02')); g.sync();
    assert.match(g.files('A', { id: checkpointId('A', 'main', stamp) }), /- new.md\n- back.md/);
    fs.unlinkSync(path.join(base, 'new.md'));
    fs.appendFileSync(file, '\n'); g.sync();
    assert.doesNotMatch(g.files('A', { id: checkpointId('A', 'main', stamp) }), /- new.md/);
    assert.ok(g.db.prepare("SELECT * FROM nodes WHERE id=?").get('file:' + path.join(base, 'new.md'))); // no orphan cleanup
    const branch = path.join(base, 'work/temp/history.md');
    fs.mkdirSync(path.dirname(branch), { recursive: true });
    const branchBody = branchText({ name: 'temp', label: 'temp', session: 'A', parent: 'main' }) + rec('branch');
    fs.writeFileSync(branch, branchBody); g.sync(); assert.ok(g.header('A', 'temp'));
    fs.writeFileSync(branch, branchBody.replace('<!-- head-context branch:1 -->\n', '')); g.sync();
    assert.equal(g.header('A', 'temp'), null); assert.equal(g.own('A', 'temp').length, 0);
    assert.ok(g.db.prepare('SELECT * FROM files WHERE path=?').get(branch));
    fs.renameSync(file, file + '.moved'); g.sync(); assert.equal(g.own('A', 'main').length, 0);
    fs.renameSync(file + '.moved', file); g.sync(); assert.equal(g.own('A', 'main').length, 2);
    const context = path.join(base, 'context.md');
    fs.unlinkSync(context); g.sync(); assert.deepEqual(g.names(), ['B']);
    assert.ok(!g.db.prepare('SELECT * FROM edges WHERE src=? OR dst=?').get(stemId('A', 'main'), stemId('A', 'main')));
    fs.writeFileSync(context, '수정한 방향'); g.sync(); assert.equal(g.session('A').context, '수정한 방향');
    for (const name of ['_archive', 'context-less']) {
      const dir = path.join(g.topics, name); fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'history.md'), rec('excluded'));
      if (name === '_archive') fs.writeFileSync(path.join(dir, 'context.md'), 'ignored');
    }
    g.sync(); assert.deepEqual(g.names(), ['A', 'B']);
  });
});

test('v4 D2: failed foreign file is rolled back, forced own file throws original, next call recovers', () => {
  const { project, file, base } = fixture();
  fs.writeFileSync(file, rec('old'));
  const branch = path.join(base, 'work/bad/history.md');
  fs.mkdirSync(path.dirname(branch), { recursive: true });
  const good = branchText({ name: 'bad', label: 'bad', session: 'A', parent: 'main' });
  fs.writeFileSync(branch, good);
  withGraph(project, () => {});
  const before = withGraph(project, (g) => capture(g, 'A'));
  fs.writeFileSync(branch, good.replace('갈래: A/메인@없음', '갈래: invalid'));
  withGraphRead(project, (g) => {
    assert.ok(g.errors.some((e) => /브랜치 갈래 형식/.test(e.error)));
    assert.deepEqual(capture(g, 'A'), before);
    assert.equal(g.session('B').context, '다른 세션');
  });
  assert.throws(() => withGraph(project, () => assert.fail('callback must not run'), [branch]), /브랜치 갈래 형식/);
  fs.writeFileSync(branch, good);
  const original = fs.readFileSync, error = Object.assign(new Error('original read failure'), { code: 'EIO' });
  fs.appendFileSync(file, rec('new', '2026-01-02'));
  fs.readFileSync = (f, ...args) => { if (f === file) throw error; return original(f, ...args); };
  try {
    assert.throws(() => withGraph(project, () => {}, [file]), (e) => e === error);
    withGraphRead(project, (g) => { assert.equal(g.own('A', 'main').length, 1); assert.match(g.errors[0].error, /original read failure/); });
  } finally { fs.readFileSync = original; }
  assert.equal(withGraphRead(project, (g) => g.own('A', 'main').length), 2);
});

test('v4 stability exhaustion is four reads; commit failure rolls back without replaying callback', () => {
  const { project, file } = fixture();
  fs.writeFileSync(file, rec('old')); withGraph(project, () => {});
  fs.appendFileSync(file, rec('new', '2026-01-02'));
  const stat = fs.statSync, read = fs.readFileSync; let tick = 0, reads = 0;
  fs.statSync = (f, ...args) => {
    const s = stat(f, ...args);
    return f === file ? Object.assign(Object.create(Object.getPrototypeOf(s)), s, { mtimeMs: s.mtimeMs + ++tick }) : s;
  };
  fs.readFileSync = (f, ...args) => { if (f === file) reads++; return read(f, ...args); };
  try {
    assert.throws(() => withGraph(project, () => {}, [file]), /기록이 계속 바뀌어 안정된 색인 위치를 얻지 못했습니다/);
    assert.equal(reads, 4);
  } finally { fs.statSync = stat; fs.readFileSync = read; }
  const proto = sqlite().DatabaseSync.prototype, exec = proto.exec;
  const failure = new Error('commit failure'); let callbacks = 0;
  proto.exec = function (sql) { if (sql === 'COMMIT') throw failure; return exec.call(this, sql); };
  try { assert.throws(() => withGraph(project, () => { callbacks++; }, [file]), (e) => e === failure); }
  finally { proto.exec = exec; }
  assert.equal(callbacks, 1);
  const db = new (sqlite().DatabaseSync)(path.join(project, '.head/index-v4.sqlite'));
  assert.equal(db.prepare("SELECT count(*) n FROM nodes WHERE kind='checkpoint'").get().n, 1); db.close();
  assert.equal(withGraphRead(project, (g) => g.own('A', 'main').length), 2);
});

test('v4 D2: source enumeration failure for an own changed session propagates the original error', () => {
  const { project, file, base } = fixture();
  fs.writeFileSync(file, rec('old'));
  fs.mkdirSync(path.join(base, 'work'));
  const before = withGraph(project, (g) => capture(g, 'A'));
  fs.appendFileSync(file, rec('new', '2026-01-02'));
  const readdir = fs.readdirSync, failure = Object.assign(new Error('work scan failed'), { code: 'EACCES' });
  fs.readdirSync = (dir, ...args) => {
    if (dir === path.join(base, 'work')) throw failure;
    return readdir(dir, ...args);
  };
  try { assert.throws(() => withGraph(project, () => assert.fail('callback must not run'), [file]), (e) => e === failure); }
  finally { fs.readdirSync = readdir; }
  const db = new (sqlite().DatabaseSync)(path.join(project, '.head/index-v4.sqlite'));
  assert.equal(db.prepare("SELECT body FROM nodes WHERE session='A' AND kind='checkpoint'").get().body, before.nodes.find((r) => r.kind === 'checkpoint').body);
  db.close();
  assert.equal(withGraphRead(project, (g) => g.own('A', 'main').length), 2);
});

test('v4 D2 file savepoint restores partial SQL changes and files stat; own failure rolls back earlier files too', () => {
  const { project, base, file } = fixture();
  const other = path.join(project, '.head/sessions/B/history.md');
  fs.writeFileSync(file, rec('old-A')); fs.writeFileSync(other, rec('old-B'));
  const before = withGraph(project, (g) => {
    g.db.exec("CREATE TRIGGER reject_update BEFORE UPDATE ON nodes WHEN NEW.body LIKE '%reject-token%' BEGIN SELECT RAISE(ABORT,'reject-body'); END;");
    return { a: capture(g, 'A'), b: capture(g, 'B'), files: g.db.prepare('SELECT * FROM files ORDER BY path').all() };
  });
  fs.writeFileSync(file, rec('reject-token')); fs.appendFileSync(other, rec('new-B', '2026-01-02'));
  withGraphRead(project, (g) => {
    assert.deepEqual(capture(g, 'A'), before.a);
    assert.equal(g.own('B', 'main').length, 2);
    assert.deepEqual(g.db.prepare('SELECT * FROM files WHERE path=?').get(file), before.files.find((r) => r.path === file));
    assert.match(g.errors[0].error, /reject-body/);
  });
  fs.writeFileSync(file, rec('good-A'));
  fs.writeFileSync(other, rec('reject-token'));
  assert.throws(() => withGraph(project, () => {}, [file, other]), /reject-body/);
  const db = new (sqlite().DatabaseSync)(path.join(project, '.head/index-v4.sqlite'));
  assert.equal(db.prepare("SELECT body FROM nodes WHERE session='A' AND kind='checkpoint'").get().body, before.a.nodes.find((r) => r.kind === 'checkpoint').body);
  db.close();
  fs.writeFileSync(other, rec('recovered-B'));
  withGraphRead(project, (g) => { assert.equal(g.recent('A')[0].summary, 'good-A'); assert.equal(g.recent('B')[0].summary, 'recovered-B'); });
  assert.ok(fs.existsSync(path.join(base, 'context.md')));
});

test('v4 D4 same-stamp find groups preserve old content and limit-boundary membership', async () => {
  const { project, file } = fixture();
  fs.writeFileSync(file, rec('one', stamp, '한글 "literal": a-b') + rec('two', stamp, '한글 "literal": a-b') + rec('three', stamp, '한글 "literal": a-b'));
  if (!process.env.HC_INDEX_OLD_CORE) return;
  const { withGraph: oldGraph } = await import(process.env.HC_INDEX_OLD_CORE + '/graph.mjs');
  for (const query of ['한', '한글', '글', 'LITERAL', '"', ':', '-']) {
    const old = oldGraph(project, (g) => g.find({ query, limit: 0 }));
    withGraphRead(project, (g) => {
      assert.deepEqual(g.find({ query, limit: 0 }).map((e) => e.id).sort(), old.map((e) => e.id).sort());
      for (const limit of [1, 2, 30]) {
        const rows = g.find({ query, limit });
        assert.equal(rows.length, Math.min(limit, old.length));
        for (const e of rows) assert.ok(old.some((o) => o.id === e.id && o.body === e.body));
      }
    });
  }
});

test('v4 forced stat bypass and D4 deterministic find tie order/limits', () => {
  const { project, file } = fixture();
  fs.writeFileSync(file, rec('one') + rec('two') + rec('tri')); withGraph(project, () => {});
  const st = fs.statSync(file), stat = fs.statSync;
  fs.writeFileSync(file, rec('ONE') + rec('two') + rec('tri'));
  fs.statSync = (f, ...args) => f === file ? st : stat(f, ...args);
  try {
    assert.equal(withGraphRead(project, (g) => g.item(checkpointId('A', 'main', stamp)).summary), 'one');
    assert.equal(withGraph(project, (g) => g.item(checkpointId('A', 'main', stamp)).summary, [file]), 'ONE');
  } finally { fs.statSync = stat; }
  withGraph(project, (g) => {
    assert.deepEqual(g.find({ query: 'body', limit: 0 }).map((r) => r.summary), ['tri', 'two', 'ONE']);
    assert.deepEqual(g.find({ query: 'body', limit: 1 }).map((r) => r.summary), ['tri']);
  });
});

test('v4 D1: schema rebuilds and corruption restore md; v3 sentinel is untouched, old/new processes coexist', () => {
  const { project, s } = fixture();
  s.save({ summary: 'record', history: '본문', conversation_id: 'a' });
  const sentinel = path.join(project, '.head/index.sqlite');
  fs.writeFileSync(sentinel, 'v3 sentinel'); const stat = fs.statSync(sentinel);
  const expected = s.inspect({ name: 'A', action: 'map' });
  const file = path.join(project, '.head/index-v4.sqlite');
  fs.unlinkSync(file); assert.equal(s.inspect({ name: 'A', action: 'map' }), expected);
  for (const sql of ['PRAGMA user_version=99', 'ALTER TABLE nodes ADD COLUMN wrong TEXT']) {
    withGraph(project, (g) => g.db.exec(sql));
    assert.equal(s.inspect({ name: 'A', action: 'map' }), expected);
  }
  fs.writeFileSync(file, 'not a database'); assert.equal(s.inspect({ name: 'A', action: 'map' }), expected);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'v3 sentinel'); assert.equal(fs.statSync(sentinel).mtimeMs, stat.mtimeMs);
  if (process.env.HC_INDEX_OLD_CORE) {
    // The old process owns its v3 DB; it may rebuild the sentinel, never the v4 file.
    const bytes = fs.readFileSync(file), st = fs.statSync(file);
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import {sessions} from ${JSON.stringify(process.env.HC_INDEX_OLD_CORE + '/sessions.mjs')}; console.log(sessions(${JSON.stringify(project)}).inspect({name:'A',action:'map'}));`], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trimEnd(), expected);
    assert.deepEqual(fs.readFileSync(file), bytes); assert.equal(fs.statSync(file).mtimeMs, st.mtimeMs);
    assert.equal(s.inspect({ name: 'A', action: 'map' }), expected);
  }
});
