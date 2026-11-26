import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sessions } from '../core/sessions.mjs';
import { entry } from '../core/storage.mjs';
import { parseHistory, contentBody } from '../core/history.mjs';
import { callTool } from '../core/mcp.mjs';
import { withGraphRead } from '../core/graph.mjs';
import { contextPart, FIT_STEPS, fittedContext, identity, overview, branchProblems } from '../core/recovery.mjs';
import {
  normTitle,
  emptyTree,
  judge,
  applyRecord,
  rebuild,
  pathOf,
  spotOf,
  drawTree,
  treeSection,
} from '../core/problem-tree.mjs';

const root = process.env.HEAD_CONTEXT_TEST_ROOT;
const fixture = (branch = 'tree-demo') => {
  const dir = fs.mkdtempSync(path.join(root, 'pt-')),
    s = sessions(dir);
  s.create({ name: 'demo', context: '문제 트리 시험', conversation_id: 'A' });
  s.branch({ action: 'create', branch, conversation_id: 'A' });
  const file = path.join(dir, '.head/sessions/demo/work', branch, 'history.md');
  const main = path.join(dir, '.head/sessions/demo/history.md');
  const save = (args = {}) => s.save({ summary: '요약', history: '본문', next: '다음', conversation_id: 'A', ...args });
  const entries = () => parseHistory(fs.readFileSync(file, 'utf8'));
  return { dir, s, file, main, save, entries, state: () => rebuild(entries(), branch) };
};
const step = (state, problem, relation) => {
  const got = judge(state, { problem, relation });
  if (got.problem) applyRecord(state, got.problem, got.relation);
  return got;
};
const messages = [
  '지금 문제가 바로 전 문제와 다릅니다. 같은 문제면 바로 전 문제를 그대로 적고, 바뀌었으면 relation(아래·옆·위)을 함께 적어 다시 저장하세요. 아래: 바로 전 문제를 풀려다 생긴 문제 / 옆: 같은 위 문제의 다른 문제 / 위: 바로 전 문제의 위 문제 중 하나로 돌아감(problem에 그 위 문제의 글자).',
  '이 작업 브랜치에는 지금 문제가 있습니다. 같은 문제면 바로 전 문제를 그대로 problem에 적고, 바뀌었으면 새 문제와 relation(아래·옆·위)을 적어 다시 저장하세요.',
  "'다른 문제'는 바로 전 문제의 위 문제가 아닙니다. 위로 갈 때는 위 경로에 있는 글자를 그대로 적습니다. 위 문제의 다른 문제로 가려면 먼저 '위'로 그 위 문제에 돌아가 저장하고, 다음 저장에서 '옆'이나 '아래'로 가세요.",
  "지금 문제는 한 줄, 120자 이하이고 '›'를 넣을 수 없습니다.",
];

test('problem tree: normalized titles, first and unchanged records discard relation, node reuse', () => {
  const f = fixture(),
    state = emptyTree('tree-demo');
  assert.equal(normTitle('  가\t  나  '.normalize('NFD')), '가 나');
  for (const [problem, relation] of [
    ['  가\t  나  '.normalize('NFD'), '위'],
    ['가 나', '아래'],
    ['자식', '아래'],
    ['형제', '옆'],
    ['자식', '옆'],
    ['가 나', '위'],
    ['자식', '아래'],
  ]) {
    step(state, problem, relation);
    f.save({ problem, relation });
    assert.deepEqual(drawTree(f.state()), drawTree(state));
  }
  assert.equal(state.count, 3);
  assert.deepEqual(
    f
      .entries()
      .slice(0, 2)
      .map((e) => [e.problem, e.relation]),
    [
      ['가 나', ''],
      ['가 나', ''],
    ],
  );
  assert.equal(pathOf(state), 'tree-demo › 가 나 › 자식');
});

test('problem tree: nearest matching ancestor, multiple levels, root and problem-free saves', () => {
  const f = fixture(),
    state = emptyTree('tree-demo');
  const actions = [['하나'], ['둘', '아래'], ['하나', '아래'], ['셋', '아래'], ['하나', '위']];
  for (const [problem, relation] of actions) {
    step(state, problem, relation);
    f.save({ problem, relation });
  }
  assert.equal(pathOf(state), 'tree-demo › 하나 › 둘 › 하나');
  for (const [problem, relation] of [
    ['둘', '위'],
    ['다른 둘', '옆'],
    ['하나', '위'],
    ['tree-demo', '위'],
    [undefined, undefined],
    [undefined, '아래'],
    ['tree-demo', '옆'],
    ['새 문제', '아래'],
  ]) {
    step(state, problem, relation);
    f.save({ problem, relation });
    assert.deepEqual(drawTree(f.state()), drawTree(state));
  }
  assert.equal(pathOf(state), 'tree-demo › 새 문제');
  assert.deepEqual(
    f
      .entries()
      .slice(-5)
      .map((e) => [e.problem, e.relation]),
    [
      ['tree-demo', '위'],
      ['', ''],
      ['', ''],
      ['', ''],
      ['새 문제', ''],
    ],
  );
  const empty = emptyTree('tree-demo');
  assert.deepEqual(step(empty, 'tree-demo', '위'), {});
  assert.deepEqual(step(empty, undefined, '옆'), {});
  assert.equal(empty.count, 0);
});

test('problem tree: long root through save and root containing › through direct rules', () => {
  const title = 'long-' + 'x'.repeat(121),
    f = fixture(title);
  f.save({ problem: '첫 문제' });
  assert.match(f.save({ problem: title, relation: '위' }), new RegExp(`지금 문제: ${title}$`));
  assert.equal(f.state().current, null);
  f.save();
  const state = emptyTree('옛 이름 › 이름표');
  step(state, '문제');
  step(state, '옛 이름 › 이름표', '위');
  assert.equal(state.current, null);
  assert.equal(spotOf(state), '옛 이름 › 이름표');
});

test('problem tree: literal full/path drawing example and spot', () => {
  const f = fixture(),
    state = emptyTree('tree-demo');
  for (const [problem, relation] of [
    ['로그인이 안 된다'],
    ['토큰이 만료된다', '아래'],
    ['세션 쿠키가 없다', '옆'],
    ['로그인이 안 된다', '위'],
    ['결제 화면이 느리다', '옆'],
  ]) {
    step(state, problem, relation);
    f.save({ problem, relation });
  }
  const full =
    '## 문제 트리: tree-demo\ntree-demo\n├─ 로그인이 안 된다\n│  ├─ 토큰이 만료된다\n│  └─ 세션 쿠키가 없다\n└─ 결제 화면이 느리다   ← 지금';
  const folded =
    '## 문제 트리: tree-demo\ntree-demo\n└─ 결제 화면이 느리다   ← 지금\n(외 3개 — read map branch=tree-demo)';
  assert.equal(treeSection(state, { mode: 'full', stem: 'tree-demo' }).join('\n'), full);
  assert.equal(treeSection(f.state(), { mode: 'path', stem: 'tree-demo' }).join('\n'), folded);
  assert.equal(spotOf(state), 'tree-demo › 결제 화면이 느리다');
});

test('problem tree: five refusal texts and no changes to either file', () => {
  const f = fixture();
  const unchanged = (args, expected) => {
    const before = [f.file, f.main].map((p) => (fs.existsSync(p) ? fs.readFileSync(p) : null));
    assert.throws(
      () => callTool(f.s, 'save', { summary: '요약', history: '본문', next: '다음', ...args }, 'A', f.dir),
      { message: expected },
    );
    assert.deepEqual(
      [f.file, f.main].map((p) => (fs.existsSync(p) ? fs.readFileSync(p) : null)),
      before,
    );
  };
  unchanged({ problem: 'x'.repeat(121) }, `바로 전 문제: 없음\n${messages[3]}`);
  f.save({ problem: '첫 문제' });
  const prefix = '바로 전 문제: tree-demo › 첫 문제\n';
  for (const [args, message] of [
    [{ problem: '다른 문제' }, messages[0]],
    [{ problem: '' }, messages[1]],
    [{ relation: '아래' }, messages[1]],
    [{ problem: '다른 문제', relation: '위' }, messages[2]],
    ...['x'.repeat(121), '문제›글', '줄\n바꿈', '줄\r바꿈'].map((problem) => [{ problem }, messages[3]]),
  ])
    unchanged(args, prefix + message);
  unchanged({ problem: '첫 문제', relation: '아무거나' }, '관계(relation)는 아래·옆·위 중 하나입니다.');
  assert.throws(() => callTool(f.s, 'read', { limit: -1 }, 'A', f.dir), { message: '유효하지 않은 인자: limit' });
});

test('problem tree: entry bytes, header placement and body-only lines', () => {
  const args = { timestamp: '2026-01-01T00:00:00.000Z', summary: '요약', history: '본문', next: '다음' };
  assert.equal(entry(args), '\n\n## 2026-01-01T00:00:00.000Z\n\n요약: 요약\n\n본문\n\n다음: 다음\n\n');
  assert.equal(entry({ ...args, relation: '아래' }), entry(args));
  const body = '지금 문제: 본문 문제\n문제: 본문\n문제 관계: 본문 관계';
  const text = entry({
    ...args,
    history: body,
    status: '열림',
    problem: '머리 문제',
    relation: '아래',
    files: ['file.md'],
  });
  assert.match(text, /상태: 열림\n지금 문제: 머리 문제\n문제 관계: 아래\n참조파일: `file.md`\n\n/);
  const e = parseHistory(text)[0];
  assert.equal(e.problem, '머리 문제');
  assert.equal(e.relation, '아래');
  assert.equal(contentBody(e), '참조파일: `file.md`\n\n' + body);
  assert.equal(contentBody(parseHistory(entry({ ...args, history: body }))[0]), body);
  const noHeader = parseHistory('## 2026-01-01\n\n본문\n지금 문제: 가짜\n문제 관계: 아래\n')[0];
  assert.equal(noHeader.problem, '');
  assert.equal(noHeader.relation, '');
  const first = parseHistory(
    '## 2026-01-01\n\n\n요약: 요약\n지금 문제: 첫\n지금 문제: 둘\n문제 관계: 옆\n문제 관계: 아래\n\n본문',
  )[0];
  assert.equal(first.problem, '첫');
  assert.equal(first.relation, '옆');
  const f = fixture();
  f.save({ history: body });
  assert.equal(f.state().count, 0);
  assert.doesNotMatch(f.s.identity({ conversation_id: 'A' }), /## 문제 트리:/);
  assert.ok(f.s.identity({ conversation_id: 'A' }).includes(body));
});

test('problem tree: tolerant rebuilding and handmade header edits', () => {
  const state = rebuild(
    [
      { problem: '첫' },
      {},
      { problem: '자식', relation: '아래' },
      { problem: '형제' },
      { problem: '다른 형제', relation: '알 수 없음' },
      { problem: '새 루트 자식', relation: '위' },
      { problem: '   ' },
    ],
    'root',
  );
  assert.equal(pathOf(state), 'root › 새 루트 자식');
  assert.equal(state.count, 5);
  assert.deepEqual(
    state.root.children[0].children.map((n) => n.title),
    ['자식', '형제', '다른 형제'],
  );
  const f = fixture();
  f.save({ problem: '수정 전' });
  fs.writeFileSync(f.file, fs.readFileSync(f.file, 'utf8').replace('지금 문제: 수정 전', '지금 문제: 수정 뒤'));
  const context = f.s.parts({ session: 'demo', stem: 'tree-demo' }).context;
  assert.match(context, /└─ 수정 뒤   ← 지금/);
  assert.doesNotMatch(context, /수정 전/);
});

test('problem tree: response and context placement, main and overview exclude trees', () => {
  const f = fixture();
  const response = f.save({ problem: '첫 문제', files: ['missing.md'] });
  assert.match(response, /다음: 다음\n지금 문제: tree-demo › 첫 문제\n참조파일 중 찾지 못한 경로/);
  f.s.todo({ action: 'add', text: '할 일', conversation_id: 'A' });
  const context = f.s.identity({ conversation_id: 'A' });
  assert.ok(context.indexOf('## 열린 작업 브랜치') < context.indexOf('## 문제 트리:'));
  assert.ok(context.indexOf('## 문제 트리:') < context.indexOf('## 할 일'));
  assert.match(context, /첫 문제   ← 지금/);
  assert.doesNotMatch(f.s.inspect({ action: 'overview', name: 'demo' }), /## 문제 트리:/);
  f.s.load({ name: 'demo', branch: 'main', conversation_id: 'B' });
  assert.doesNotMatch(f.s.identity({ conversation_id: 'B' }), /## 문제 트리:/);
  assert.doesNotMatch(f.s.inspect({ action: 'map', name: 'demo' }), /## 문제 트리:/);
  assert.doesNotMatch(f.s.inspect({ action: 'map', name: 'demo', branch: 'main' }), /## 문제 트리:/);
});

test('problem tree: no-field main and branch preserve bytes and all fitting outputs', () => {
  const f = fixture();
  withGraphRead(f.dir, (g) => {
    const options = { name: 'demo', stem: 'tree-demo' };
    assert.equal(branchProblems(g, 'demo', 'tree-demo'), null);
    assert.equal(branchProblems(g, 'demo', 'main'), null);
    assert.equal(branchProblems(g, 'demo', 'absent'), null);
    for (const step of FIT_STEPS) assert.doesNotMatch(contextPart(g, { ...options, ...step }), /## 문제 트리:/);
    assert.doesNotMatch(identity(g, options), /## 문제 트리:/);
    assert.doesNotMatch(overview(g, { name: 'demo' }), /## 문제 트리:/);
  });
  f.save();
  assert.equal(
    f.entries()[0].body,
    entry({ timestamp: f.entries()[0].timestamp, summary: '요약', history: '본문', next: '다음' }).trim(),
  );
  f.s.load({ branch: 'main', conversation_id: 'A' });
  const response = f.save({ problem: '무시\n해야 함', relation: '아래' });
  assert.equal(response, "작업 세션 'demo' 메인에 기록했습니다.\n요약: 요약\n다음: 다음");
  const last = parseHistory(fs.readFileSync(f.main, 'utf8')).at(-1);
  assert.equal(last.body, entry({ timestamp: last.timestamp, summary: '요약', history: '본문', next: '다음' }).trim());
});

test('problem tree: fitting folds only off-path nodes, identity keeps full uncut tree', () => {
  const f = fixture();
  for (let i = 0; i < 90; i++)
    f.save({ problem: String(i).padStart(3, '0') + '가'.repeat(107), ...(i ? { relation: '옆' } : {}) });
  const chain = Array.from({ length: 3 }, (_, i) => `${i}단` + '나'.repeat(108));
  for (const problem of chain) f.save({ problem, relation: '아래' });
  withGraphRead(f.dir, (g) => {
    const options = { name: 'demo', stem: 'tree-demo' };
    const full = identity(g, options),
      folded = fittedContext(g, options, 9000);
    assert.ok(full.length > 9000);
    assert.ok(folded.length <= 9000);
    assert.ok(folded.includes('(외 89개 — read map branch=tree-demo)'));
    for (const title of chain) assert.ok(folded.includes(title));
    assert.ok(folded.includes(chain[2] + '   ← 지금'));
    assert.ok(full.includes('000' + '가'.repeat(107)));
    assert.ok(!full.includes('(외 89개'));
    for (const step of FIT_STEPS) {
      const output = contextPart(g, { ...options, ...step });
      assert.equal(output.includes('(외 89개'), step.map === false);
    }
  });
});

test('problem tree: read map contains only the selected branch, including nested branch', () => {
  const f = fixture();
  f.save({ problem: '부모 문제' });
  f.s.branch({ action: 'create', branch: 'child', conversation_id: 'A' });
  f.save({ problem: '자기 문제' });
  const map = f.s.inspect({ action: 'map', name: 'demo', branch: 'child' });
  assert.match(map, /^# 지도: demo \/ child\n## 문제 트리: child\nchild\n└─ 자기 문제   ← 지금\n\n/);
  const section = map.slice(map.indexOf('## 문제 트리:'), map.indexOf('\n\n'));
  assert.doesNotMatch(section, /부모 문제/);
  assert.match(
    f.s.inspect({ action: 'map', name: 'demo', branch: 'tree-demo' }),
    /## 문제 트리: tree-demo\ntree-demo\n└─ 부모 문제   ← 지금/,
  );
});

test('problem tree: two conversations judge against latest branch save', () => {
  const f = fixture();
  f.save({ problem: '첫 문제' });
  f.s.load({ name: 'demo', branch: 'tree-demo', conversation_id: 'B' });
  f.save({ problem: '새 문제', relation: '아래' });
  const before = [f.file, f.main].map((p) => fs.readFileSync(p));
  assert.throws(() => f.save({ problem: '첫 문제', conversation_id: 'B' }), {
    message: '바로 전 문제: tree-demo › 첫 문제 › 새 문제\n' + messages[0],
  });
  assert.deepEqual(
    [f.file, f.main].map((p) => fs.readFileSync(p)),
    before,
  );
});

test('problem tree: two child processes each save unchanged ten times', { timeout: 60000 }, async () => {
  const f = fixture();
  f.save({ problem: '함께 푸는 문제' });
  for (const id of ['B', 'C']) f.s.load({ name: 'demo', branch: 'tree-demo', conversation_id: id });
  const code = `import { sessions } from ${JSON.stringify(new URL('../core/sessions.mjs', import.meta.url).href)};
    const s = sessions(process.argv[1]);
    process.send({ ready: true });
    process.on('message', () => {
      for (let i = 0; i < 10; i++) {
        s.save({ summary: '동시 저장', history: '본문', next: '계속', problem: '함께 푸는 문제', conversation_id: process.argv[2] });
        process.send({ saved: true });
      }
      process.disconnect();
    });`;
  let saved = 0;
  const workers = ['B', 'C'].map((id) => {
    const proc = spawn(process.execPath, ['--input-type=module', '-e', code, f.dir, id], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d;
    });
    const ready = new Promise((resolve) =>
      proc.on('message', (m) => {
        if (m.ready) resolve();
        if (m.saved) saved++;
      }),
    );
    const done = new Promise((resolve, reject) => {
      proc.on('error', reject);
      proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(stderr))));
    });
    return { proc, ready, done };
  });
  try {
    await Promise.all(workers.map((w) => w.ready));
    workers.forEach((w) => w.proc.send({ go: true }));
    await Promise.all(workers.map((w) => w.done));
    assert.equal(saved, 20);
    assert.equal(f.entries().length, 21);
    assert.equal(f.state().count, 1);
  } finally {
    for (const w of workers) if (w.proc.exitCode === null) w.proc.kill('SIGKILL');
  }
});

test('problem tree: closing response, merge excludes metadata, reopening retains last problem', () => {
  const f = fixture();
  f.save({ problem: '첫 문제' });
  const response = f.save({ problem: '마지막 문제', relation: '아래', next: undefined, recap: '전체 정리' });
  assert.match(
    response,
    /요약: 요약\n마지막 문제: tree-demo › 첫 문제 › 마지막 문제\n이 대화는 이제 메인에 기록합니다\./,
  );
  assert.match(f.s.inspect({ action: 'map', name: 'demo', branch: 'tree-demo' }), /마지막 문제   ← 마지막/);
  assert.equal(parseHistory(fs.readFileSync(f.main, 'utf8')).at(-1).problem, '');
  f.s.load({ branch: 'tree-demo', conversation_id: 'A' });
  f.save({ problem: '마지막 문제' });
  assert.match(f.s.identity({ conversation_id: 'A' }), /마지막 문제   ← 지금/);
  assert.equal(f.state().count, 2);
  f.s.branch({ action: 'abandon', branch: 'tree-demo', reason: '시험 종료', conversation_id: 'A' });
  assert.match(f.s.inspect({ action: 'map', name: 'demo', branch: 'tree-demo' }), /마지막 문제   ← 마지막/);
  assert.equal(parseHistory(fs.readFileSync(f.main, 'utf8')).at(-1).problem, '');
});
