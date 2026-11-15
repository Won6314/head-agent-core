import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withGraph, checkpointId } from '../core/graph.mjs';
import { branchText } from '../core/branch-format.mjs';
import { entry } from '../core/storage.mjs';

const rec = (n, extra = {}) =>
  entry({
    timestamp: `2026-01-${String(n).padStart(2, '0')}`,
    summary: `record ${n}`,
    history: '본문🙂',
    next: '계속',
    ...extra,
  });
const capture = (g) => ({
  nodes: g.db.prepare('SELECT * FROM nodes ORDER BY id').all(),
  edges: g.db.prepare('SELECT * FROM edges ORDER BY src,dst,kind').all(),
});

test('v5 edges: each incremental edit equals a fresh index, including full raw nodes', async (t) => {
  const project = fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT || process.env.HOME, 'edges-'));
  const base = path.join(project, '.head/sessions/A');
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, 'context.md'), '방향');
  const main = path.join(base, 'history.md');
  const b = path.join(base, 'work/B/history.md');
  const c = path.join(base, 'work/C/history.md');
  const header = (name, parent = 'main', anchor = '2026-01-02', id = checkpointId('A', parent, anchor)) =>
    branchText({ name, label: name, session: 'A', parent, anchor, anchorId: id, started: '2026-01-01T00:00:00.000Z' });
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const records = [rec(1), rec(2), rec(3)];
  const saveMain = () => write(main, records.join(''));
  saveMain();
  const oldFiles = ['index.sqlite', 'index-v4.sqlite'].map((name) => path.join(project, '.head', name));
  for (const file of oldFiles) fs.writeFileSync(file, 'older index sentinel');
  withGraph(project, () => {});
  const check = async (name, edit) =>
    t.test(name, () => {
      edit();
      const incremental = withGraph(
        project,
        capture,
        [main, b, c].filter((f) => fs.existsSync(f)),
      );
      fs.unlinkSync(path.join(project, '.head/index-v5.sqlite'));
      const fresh = withGraph(project, capture);
      assert.deepEqual(incremental, fresh);
      for (const file of oldFiles) assert.equal(fs.readFileSync(file, 'utf8'), 'older index sentinel');
      console.log(JSON.stringify({ edit: name, nodes: fresh.nodes.length, edges: fresh.edges.length, equal: true }));
    });
  await check('append', () => {
    records.push(rec(4));
    saveMain();
  });
  await check('prepend', () => {
    records.unshift(rec(5));
    saveMain();
  });
  await check('middle insert', () => {
    records.splice(2, 0, rec(6));
    saveMain();
  });
  await check('middle delete', () => {
    records.splice(2, 1);
    saveMain();
  });
  await check('last delete', () => {
    records.pop();
    saveMain();
  });
  await check('swap records', () => {
    [records[0], records[1]] = [records[1], records[0]];
    saveMain();
  });
  await check('same timestamp append', () => {
    records.push(rec(2, { summary: 'duplicate' }));
    saveMain();
  });
  await check('empty branch', () => write(b, header('B')));
  await check('empty branch first save', () => fs.appendFileSync(b, rec(7)));
  await check('branch second record', () => fs.appendFileSync(b, rec(8)));
  await check('branch first record delete', () => write(b, header('B') + rec(8)));
  await check('nested grandchild', () => {
    write(b, header('B') + rec(7) + rec(8));
    write(c, header('C', 'B', '2026-01-07') + rec(9));
  });
  const anchored = [...records];
  await check('parent anchor delete', () => {
    records.splice(0, records.length, ...records.filter((r) => !r.includes('## 2026-01-02')));
    saveMain();
  });
  await check('parent anchor restore', () => {
    records.splice(0, records.length, ...anchored);
    saveMain();
  });
  await check('legacy header without anchor_id', () =>
    write(b, header('B', 'main', '2026-01-02', '').replace(/^갈래-ID:.*\n/m, '') + rec(7) + rec(8)),
  );
  const merge = (status) => rec(10, { branch: 'B', record: 'work/B/history.md', status, history: '합침 본문' });
  await check('merge add', () => {
    records.push(merge('끝남'));
    saveMain();
  });
  await check('merge status edit', () => {
    records[records.length - 1] = merge('열림');
    saveMain();
  });
  await check('merge status ended', () => {
    records[records.length - 1] = merge('중단');
    saveMain();
  });
  let saved;
  await check('branch file delete', () => {
    saved = fs.readFileSync(b, 'utf8');
    fs.unlinkSync(b);
  });
  await check('branch file restore', () => write(b, saved));
  await check('merge delete', () => {
    records.pop();
    saveMain();
  });
  await check('header parent change', () => write(c, header('C', 'main', '2026-01-02') + rec(9)));
  await check('cyclic parents', () => {
    write(b, header('B', 'C', '2026-01-09') + rec(7));
    write(c, header('C', 'B', '2026-01-07') + rec(9));
  });
});

test('v5 append: one node and one next pair, no reread of the main line', () => {
  const project = fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT || process.env.HOME, 'append-'));
  const base = path.join(project, '.head/sessions/A');
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, 'context.md'), 'direction');
  const file = path.join(base, 'history.md');
  fs.writeFileSync(file, rec(1) + rec(2));
  withGraph(project, (g) => {
    const prepare = g.db.prepare.bind(g.db),
      queries = [],
      writes = [];
    g.db.prepare = (sql) => {
      queries.push(sql);
      const statement = prepare(sql);
      if (/^(INSERT|UPDATE|DELETE)/.test(sql)) {
        const run = statement.run.bind(statement);
        statement.run = (...args) => {
          const result = run(...args);
          if (Number(result.changes) && /\b(nodes|edges)\b/.test(sql)) writes.push({ sql, args });
          return result;
        };
      }
      return statement;
    };
    try {
      fs.appendFileSync(file, rec(3));
      g.sync(new Set([file]));
    } finally {
      g.db.prepare = prepare;
    }
    assert.equal(writes.length, 2);
    assert.match(writes[0].sql, /^INSERT INTO nodes/);
    assert.equal(writes[1].args[2], 'next');
    assert.equal(queries.filter((sql) => sql === "SELECT * FROM nodes WHERE file=? AND kind<>'file'").length, 1);
    assert.ok(!queries.some((sql) => /SELECT.*FROM nodes WHERE.*stem=/.test(sql)));
    assert.equal(g.db.prepare('PRAGMA user_version').get().user_version, 5);
    assert.ok(
      g.db
        .prepare('PRAGMA index_list(nodes)')
        .all()
        .some((r) => r.name === 'nodes_branch'),
    );
  });
});
