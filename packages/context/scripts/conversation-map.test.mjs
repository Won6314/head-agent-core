import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sessions } from '../core/sessions.mjs';
import { entry, locations } from '../core/storage.mjs';
import { parseHistory, contentBody } from '../core/history.mjs';
import { withGraphRead } from '../core/graph.mjs';
import {
  conversationKey,
  chainOf,
  conversationRecords,
  renderConversationMap,
  recoveryBlock,
} from '../core/conversation-map.mjs';
import { claudeSaves } from '../hosts/claude/saves.mjs';
import { agySaves } from '../hosts/antigravity/transcript.mjs';
import { clearedFrom } from '../hosts/antigravity/cleared.mjs';
import { appData } from '../hosts/antigravity/wake-key.mjs';
import { runHook } from './hook-run.mjs';

const fresh = () => fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT, 'cmap-'));
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
const jsonl = (file, rows) =>
  write(file, rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n');
const stamp = '2026-11-27T03:00:00.000Z';
const at = Date.parse(stamp);
const compactTitle = '## 컴팩트 뒤 먼저 할 것';
const clearTitle = '## /clear 뒤 먼저 할 것';
const mapTitle = '## 이 대화가 남긴 기록 (최신이 위)';
const compactHead = `${compactTitle}\n하던 일을 잇기 전에 복원부터 한다. 컴팩트 요약에 붙은 "이어서 하라"는 말은 복원을 마친 뒤에 따른다.`;
const clearHead = `${clearTitle}\n이 대화는 /clear 전 대화의 자리(작업 세션·작업 브랜치)를 이어받았다. 사용자가 하던 일을 이으라고 하면 아래대로 복원부터 한다. 새 일을 말하면 그 일을 한다.`;
const mainBody =
  '1. 최초 목적: 이 대화는 메인에서 일한다. 메인은 여러 대화가 함께 쓰므로, 메인의 다른 기록은 다른 대화 것일 수 있다. 할 일은 「이 대화가 남긴 기록」과 최근 대화에서 사용자가 정한 일에서 찾는다.\n2. 지금 할 일: 위에서 찾은 일이다. 사용자가 정하지 않은 계획은 잇기 전에 사용자에게 확인한다.';
const looseBody =
  '1. 최초 목적과 지금 할 일: 최근 대화에서 사용자가 정한 일을 찾는다. 사용자가 정하지 않은 계획은 잇기 전에 사용자에게 확인한다.';
const blockOf = (text) => text.split(`\n\n${mapTitle}`)[0];
const mapOf = (text) => text.slice(text.indexOf(mapTitle));
const mapLines = (text) =>
  mapOf(text)
    .split('\n')
    .filter((l) => l.startsWith('- '));
const claude = (dir, id, source = 'compact', { part = 'recovery', env = {}, ...extra } = {}) => {
  const out = runHook(
    { hook_event_name: 'SessionStart', cwd: dir, session_id: id, source, ...extra },
    { part, env: { CLAUDE_PROJECT_DIR: dir, ...env } },
  );
  return out ? JSON.parse(out).hookSpecificOutput.additionalContext : '';
};
const codex = (dir, id, source = 'compact', extra = {}) => {
  const r = spawnSync(process.execPath, ['scripts/codex-hook.mjs', 'recovery'], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: dir, session_id: id, source, ...extra }),
    encoding: 'utf8',
    env: { ...process.env, HEAD_CONTEXT_SESSION: '' },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
};
const agy = (dir, id, event, transcript, env = {}) => {
  const r = spawnSync(process.execPath, ['scripts/antigravity-hook.mjs'], {
    input: JSON.stringify({
      conversationId: id,
      cwd: dir,
      hookEventName: event,
      transcriptPath: transcript,
      lastUserInput: '새 일',
    }),
    encoding: 'utf8',
    env: { ...process.env, HEAD_CONTEXT_SESSION: '', PLUGIN_DATA: path.join(dir, 'plugin-data'), ...env },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  return r.stdout ? JSON.parse(r.stdout).injectSteps.map((s) => s.systemMessage.systemMessage) : [];
};
const fixture = (host = 'claude') => {
  const dir = fresh();
  let time = at;
  const s = sessions(dir, { host, now: () => time++ });
  s.create({ name: 'demo', context: 'DIRECTION', conversation_id: 'A' });
  return { dir, s, main: path.join(locations(dir).topics, 'demo/history.md') };
};
const save = (s, id, summary, extra = {}) => s.save({ conversation_id: id, summary, history: '본문', ...extra });
const tool = (id, summary, time, extra = {}) => ({
  sessionId: id,
  timestamp: new Date(time).toISOString(),
  ...extra,
  message: { content: [{ type: 'tool_use', name: 'mcp__plugin_head-context_session__save', input: { summary } }] },
});
const agyCall = (summary, args = {}) => ({
  name: 'call_mcp_tool',
  args: { ServerName: 'head-context_session', ToolName: 'save', Arguments: { summary }, ...args },
});

test('record format: header position, unchanged legacy bytes, key validation and body-only 대화 lines', () => {
  const legacy = entry({ summary: ' S ', history: ' B ', timestamp: stamp });
  assert.equal(legacy, `\n\n## ${stamp}\n\n요약: S\n\nB\n\n`);
  const text = entry({
    summary: 'S',
    history: '대화: claude:zzz',
    conversation: 'claude:abc',
    files: ['a.md'],
    status: '끝남',
    branch: 'job',
    timestamp: stamp,
  });
  assert.ok(text.includes('상태: 끝남\n브랜치: job\n대화: claude:abc\n참조파일: `a.md`\n\n대화: claude:zzz'));
  const [e] = parseHistory(text);
  assert.equal(e.conversation, 'claude:abc');
  assert.equal(contentBody(e), '참조파일: `a.md`\n\n대화: claude:zzz');
  assert.equal(
    parseHistory(entry({ summary: 'S', history: '대화: claude:zzz', timestamp: stamp }))[0].conversation,
    '',
  );
  for (const conversation of ['claude abc', 'Claude:x', 'claude:a/b'])
    assert.throws(() => entry({ summary: 'S', conversation }), /대화 ID가 유효하지 않습니다/);
  assert.equal(conversationKey('claude', 'a-b_1'), 'claude:a-b_1');
  for (const [host, id] of [
    ['Claude', 'x'],
    ['claude', 'a/b'],
    ['claude', ''],
    ['', 'x'],
  ])
    assert.throws(() => conversationKey(host, id), /대화 ID가 유효하지 않습니다/);
});

for (const host of ['claude', 'codex', 'antigravity'])
  test(`${host}: save identifies main and branch records, never index/merge/abandon`, () => {
    const { dir, s, main } = fixture(host);
    save(s, 'A', 'main', { history: '대화: claude:zzz' });
    assert.equal(parseHistory(fs.readFileSync(main, 'utf8'))[0].conversation, `${host}:A`);
    s.branch({ action: 'create', branch: 'job', conversation_id: 'A' });
    save(s, 'A', 'job', { next: 'continue' });
    save(s, 'A', 'closed', { recap: 'all work' });
    const rows = parseHistory(fs.readFileSync(main, 'utf8'));
    assert.ok(rows.filter((r) => r.source || r.record).every((r) => !r.conversation));
    const branch = path.join(locations(dir).topics, 'demo/work/job/history.md');
    assert.ok(parseHistory(fs.readFileSync(branch, 'utf8')).every((r) => r.conversation === `${host}:A`));
    s.branch({ action: 'create', branch: 'drop', conversation_id: 'A' });
    save(s, 'A', 'drop', { next: 'later' });
    s.branch({ action: 'abandon', reason: 'stop', conversation_id: 'A' });
    assert.equal(parseHistory(fs.readFileSync(main, 'utf8')).at(-1).conversation, '');
  });

test('alternating conversations: A owns four records, B two, newest first with the read map IDs', () => {
  const { dir, s } = fixture();
  s.load({ name: 'demo', conversation_id: 'B' });
  for (const [id, summary] of [
    ['A', 'A1'],
    ['B', 'B1'],
    ['A', 'A2'],
    ['B', 'B2'],
    ['A', 'A3'],
  ])
    save(s, id, summary);
  s.branch({ action: 'create', branch: 'job', conversation_id: 'A' });
  save(s, 'A', 'A4', { next: 'continue' });
  const a = mapLines(claude(dir, 'A')),
    b = mapLines(claude(dir, 'B'));
  assert.deepEqual(
    a.map((l) => l.split(' · ').at(-1)),
    ['A4', 'A3', 'A2', 'A1'],
  );
  assert.deepEqual(
    b.map((l) => l.split(' · ').at(-1)),
    ['B2', 'B1'],
  );
  const map = s.inspect({ action: 'map', conversation_id: 'A' });
  for (const line of [...a, ...b]) assert.ok(map.includes(line.split(' ')[1]));
});

test('Claude old records: summary/time matching excludes forks, other sessions, window misses and other conversations; retries deduplicate', () => {
  const { dir, s, main } = fixture();
  const old = (summary, time, conversation) =>
    entry({
      summary,
      history: 'old',
      timestamp: new Date(time).toISOString(),
      ...(conversation ? { conversation } : {}),
    });
  fs.appendFileSync(
    main,
    old('A0', at) + old('B0', at + 1000) + old('C0', at + 2000) + old('other', at + 3000, 'claude:B'),
  );
  const file = jsonl(path.join(dir, 'A.jsonl'), [
    tool('A', 'A0', at - 2000),
    { type: 'tool_result', is_error: true, content: 'error' },
    tool('A', 'A0', at - 1000),
    tool('A', 'C0', at + 2000 - 660000),
    tool('A', 'B0', at, { forkedFrom: 'B' }),
    tool('B', 'B0', at),
    tool('A', 'other', at),
    '{broken __save',
  ]);
  assert.equal(claudeSaves(null, 'A').length, 0);
  assert.equal(claudeSaves(path.join(dir, 'missing'), 'A').length, 0);
  const lines = mapLines(claude(dir, 'A', 'compact', { transcript_path: file }));
  assert.equal(lines.length, 1);
  assert.ok(lines[0].endsWith(' · A0'));
  const huge = path.join(dir, 'huge.jsonl');
  write(huge, '');
  fs.truncateSync(huge, 64 * 1024 * 1024 + 1);
  assert.deepEqual(claudeSaves(huge, 'A'), []);
  // A save past 64MB, split across a chunk edge inside a multi-byte summary, is still read.
  fs.appendFileSync(
    huge,
    '\n' + 'x'.repeat(1024 * 1024 - 200) + '\n' + JSON.stringify(tool('A', '한글 요약 '.repeat(20), at)) + '\n',
  );
  assert.deepEqual(
    claudeSaves(huge, 'A').map((c) => c.summary),
    ['한글 요약 '.repeat(20)],
  );
  assert.equal(s.connection('A').previous, undefined);
});

test('old record matching: call order, earliest candidate, detail once per candidate and timezone-aware date bounds', () => {
  const { dir, main } = fixture();
  fs.appendFileSync(
    main,
    entry({ summary: 'same', history: 'one', timestamp: '2026-11-27T12:00:01+09:00' }) +
      entry({ summary: 'same', history: 'two', timestamp: '2026-11-27T03:00:02Z' }) +
      entry({ summary: 'outside', history: 'late', timestamp: '2026-11-27T03:11:00Z' }),
  );
  withGraphRead(dir, (g) => {
    const original = g.detail.bind(g),
      counts = new Map();
    g.detail = (r) => {
      counts.set(r.id, (counts.get(r.id) || 0) + 1);
      return original(r);
    };
    const records = conversationRecords(g, {
      host: 'claude',
      chain: [],
      calls: [
        { conversation: 'A', summary: 'same', at: at + 1000 },
        { conversation: 'A', summary: ' same ', at },
        { conversation: 'A', summary: 'outside', at: NaN },
      ],
    });
    assert.deepEqual(
      records.map((r) => contentBody(r)),
      ['one', 'two'],
    );
    assert.ok([...counts.values()].every((n) => n === 1));
    assert.equal(g.stampedBetween(at, at + 2000).length, 2);
  });
});

test('Antigravity old calls: object/string Arguments, quoted names, tool/server filtering and created_at', () => {
  const rows = [
    {
      type: 'PLANNER_RESPONSE',
      created_at: stamp,
      tool_calls: [
        agyCall('object'),
        agyCall('string', { Arguments: JSON.stringify({ summary: 'string' }) }),
        agyCall('quoted', { ServerName: '"head-context_session"', ToolName: '"save"' }),
        agyCall('no', { ServerName: 'other' }),
        agyCall('no', { ToolName: 'load' }),
        agyCall('no', { Arguments: '{broken' }),
      ],
    },
    { type: 'GENERIC', created_at: stamp, tool_calls: [agyCall('no')] },
  ];
  assert.deepEqual(
    agySaves(rows),
    ['object', 'string', 'quoted'].map((summary) => ({ summary, at })),
  );
});

test('Claude clear registry: previous persists through two clears and compact; parent/copy links are not previous', () => {
  const { dir, s } = fixture();
  save(s, 'A', 'before-clear');
  const registry = path.join(dir, 'registry');
  const env = { HEAD_CONTEXT_CLAUDE_SESSIONS: registry };
  const running = (id) =>
    write(
      path.join(registry, `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: id, cwd: dir, entrypoint: 'cli' }),
    );
  running('A');
  claude(dir, 'A', 'startup', { part: 'session', env });
  for (const [previous, current] of [
    ['A', 'N'],
    ['N', 'NN'],
  ]) {
    running(current);
    // Recovery must also work before the session part has written previous.
    assert.ok(mapOf(claude(dir, current, 'clear', { env })).includes('before-clear'));
    claude(dir, current, 'clear', { part: 'session', env });
    assert.deepEqual(s.connection(current).previous, [previous]);
  }
  assert.ok(mapOf(claude(dir, 'NN', 'compact', { env })).includes('before-clear'));
  s.load({ name: 'demo', conversation_id: 'NN' });
  assert.deepEqual(s.connection('NN').previous, ['N']);
  claude(dir, 'parent-child', 'startup', { part: 'session', env: { ...env, HEAD_CONTEXT_PARENT: 'A' } });
  assert.equal(s.connection('parent-child').previous, undefined);
  const copied = jsonl(path.join(dir, 'copy.jsonl'), [tool('A', 'copied', at), { type: 'user', sessionId: 'copy' }]);
  claude(dir, 'copy', 'startup', { part: 'session', transcript_path: copied, env });
  assert.equal(s.connection('copy').previous, undefined);
});

test('chain breadth-first traversal: cycles, 32 cap, transcript precedence, and invalid previous IDs', () => {
  const links = {
    A: { previous: ['B', 'bad/id'], transcript_path: 'a.jsonl' },
    B: { previous: ['A'], transcript_path: 'b.jsonl' },
  };
  assert.deepEqual(
    chainOf((id) => links[id], [{ id: 'A' }, { id: 'B', transcript: 'given' }, { id: 'A', transcript: 'late' }]),
    [
      { id: 'A', transcript: 'a.jsonl' },
      { id: 'B', transcript: 'given' },
    ],
  );
  assert.equal(chainOf((id) => ({ previous: [String(Number(id) + 1)] }), [{ id: '0' }]).length, 32);
  const { s } = fixture();
  assert.equal(s.start({ conversation_id: 'loose', origins: [{ conversation_id: 'missing', kind: 'clear' }] }), null);
  assert.equal(s.connection('loose'), null);
});

test('map rendering: latest 15, summary/line caps, cross-session labels, closed and abandoned branches, empty maps', () => {
  const { dir, s } = fixture();
  for (let i = 0; i < 14; i++) save(s, 'A', `record-${i}`);
  s.branch({ action: 'create', branch: 'closed', conversation_id: 'A' });
  save(s, 'A', 'closed-save', { recap: 'done' });
  s.branch({ action: 'create', branch: 'dropped', conversation_id: 'A' });
  save(s, 'A', 'dropped-save', { next: 'more' });
  s.branch({ action: 'abandon', reason: 'stop', conversation_id: 'A' });
  s.create({ name: 'other', context: 'other', conversation_id: 'A' });
  save(s, 'A', '😀'.repeat(130));
  const text = claude(dir, 'A');
  const lines = mapLines(text);
  assert.equal(lines.length, 15);
  assert.ok(text.endsWith('(그 앞 2개 — 흐름 지도에 있다)'));
  assert.ok(lines[0].endsWith('😀'.repeat(120) + '…'));
  assert.ok(lines.some((l) => l.includes('[demo] closed (끝남)')));
  assert.ok(lines.some((l) => l.includes('[demo] dropped (중단)')));
  withGraphRead(dir, (g) => {
    const records = conversationRecords(g, { host: 'claude', chain: [{ id: 'A' }], calls: [] });
    const loose = renderConversationMap(g, records, {});
    assert.ok(loose.slice(2, -1).every((l) => /\[(demo|other)\]/.test(l)));
    const huge = { ...records[0], stem: 'x'.repeat(400) };
    assert.equal(Array.from(renderConversationMap(g, [huge], {})[2]).length, 301);
    const tied = [{ ...records[0], id: records[1].id }, { ...records[0] }];
    assert.equal(
      renderConversationMap(g, tied, {})[2].split(' ')[1],
      g.shortIds(tied[0].session).get(
        tied
          .map((r) => r.id)
          .sort()
          .at(-1),
      ),
    );
  });
  s.load({ name: 'demo', conversation_id: 'empty' });
  assert.ok(claude(dir, 'empty').endsWith('(이 대화가 저장한 기록은 아직 없다)'));
  assert.ok(!claude(dir, 'unconnected').includes(mapTitle));
});

test('recovery blocks: literal compact/clear main, branch and loose; host gating and no session titles', () => {
  const { dir, s } = fixture();
  for (const source of ['compact', 'clear'])
    assert.equal(blockOf(claude(dir, 'A', source)), `${source === 'clear' ? clearHead : compactHead}\n${mainBody}`);
  assert.equal(claude(dir, 'loose'), `${compactHead}\n${looseBody}`);
  assert.equal(claude(dir, 'loose', 'clear'), '');
  s.branch({ action: 'create', branch: 'job', conversation_id: 'A' });
  save(s, 'A', 'purpose', { next: 'do this' });
  const short = /([0-9a-f]{5,})[^\n]*purpose/.exec(s.inspect({ action: 'map', conversation_id: 'A' }))[1];
  const branchBody = `1. 최초 목적: \`read entry ${short}\`로 이 작업 브랜치를 시작한 목적(문제·목표·조건)을 읽는다. 첫 기록 요약: purpose\n2. 지금 할 일: 마지막 기록의 다음 — do this. 이 다음은 기록을 남긴 대화가 적은 계획이다. 사용자가 정한 일인지 최근 대화에서 확인한 뒤 잇는다.`;
  for (const source of ['compact', 'clear'])
    assert.equal(blockOf(claude(dir, 'A', source)), `${source === 'clear' ? clearHead : compactHead}\n${branchBody}`);
  for (const source of ['compact', 'clear']) {
    const session = claude(dir, 'A', source, { part: 'session' });
    assert.ok(!session.includes(compactTitle) && !session.includes(clearTitle));
  }
  assert.equal(claude(dir, 'A', 'compact', { env: { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' } }), '');
  assert.ok(
    claude(dir, 'A', 'compact', { env: { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli', HEAD_CONTEXT_PERSON: '1' } }).startsWith(
      compactHead,
    ),
  );
  assert.equal(claude(dir, 'A', 'compact', { agent_id: 'child' }), '');
  const cx = sessions(dir, { host: 'codex' });
  cx.load({ name: 'demo', conversation_id: 'X' });
  assert.equal(blockOf(codex(dir, 'X')), `${compactHead}\n${mainBody}`);
  for (const source of ['clear', 'resume', 'startup']) assert.equal(codex(dir, 'X', source), '');
  assert.equal(codex(dir, 'X', 'compact', { agent_id: 'a' }), '');
  withGraphRead(dir, (g) => assert.equal(recoveryBlock(g, null, 'clear'), ''));
});

test('Antigravity restore: context then compact map with old calls then recent; unconnected restore also recovers', () => {
  const { dir, s, main } = fixture('antigravity');
  save(s, 'A', 'new-agy');
  fs.appendFileSync(main, entry({ summary: 'old-agy', history: 'old', timestamp: new Date(at + 1000).toISOString() }));
  const file = jsonl(path.join(dir, 'A.jsonl'), [
    {
      type: 'USER_INPUT',
      source: 'USER_EXPLICIT',
      content: '<USER_REQUEST>\nASK-OLD\n</USER_REQUEST>',
      created_at: stamp,
    },
    { type: 'PLANNER_RESPONSE', content: 'ANSWER-OLD', created_at: stamp, tool_calls: [agyCall('old-agy')] },
    { type: 'CHECKPOINT', status: 'DONE', step_index: 3, created_at: stamp },
  ]);
  const parts = agy(dir, 'A', 'PreInvocation', file);
  const context = parts.findIndex((p) => p.includes('## 흐름'));
  const recovery = parts.findIndex((p) => p.startsWith(compactTitle));
  const recent = parts.findIndex((p) => p.startsWith('# 최근 대화'));
  assert.ok(context >= 0 && context < recovery && recovery < recent);
  assert.equal(blockOf(parts[recovery]), `${compactHead}\n${mainBody}`);
  assert.deepEqual(
    mapLines(parts[recovery]).map((l) => l.split(' · ').at(-1)),
    ['old-agy', 'new-agy'],
  );
  assert.ok(parts[recent].includes('ASK-OLD'));
  const looseFile = jsonl(path.join(dir, 'loose.jsonl'), [
    { type: 'CHECKPOINT', status: 'DONE', step_index: 0, created_at: stamp },
  ]);
  const loose = agy(dir, 'loose', 'PreInvocation', looseFile);
  assert.ok(loose.some((p) => p.includes('연결되지 않았')));
  assert.ok(loose.includes(`${compactHead}\n${looseBody}`));
});

test('Antigravity clear: history predecessor joins place, map and previous exchanges; negatives and start-file priority', () => {
  const { dir, s } = fixture('antigravity');
  save(s, 'A', 'before-agy-clear');
  const previous = jsonl(path.join(dir, 'A.jsonl'), [
    {
      type: 'USER_INPUT',
      source: 'USER_EXPLICIT',
      created_at: stamp,
      content: '<USER_REQUEST>\nBEFORE-CLEAR\n</USER_REQUEST>',
    },
    { type: 'PLANNER_RESPONSE', content: 'ANSWER', created_at: stamp },
  ]);
  s.start({ conversation_id: 'A', info: { transcript_path: previous } });
  const history = path.join(appData(), 'history.jsonl');
  const command = { display: ' /clear ', type: 'slash_command', workspace: dir, conversationId: 'A' };
  const current = (id) => ({ display: '새 일', workspace: dir, conversationId: id });
  jsonl(history, ['{partial', command, current('N')]);
  assert.equal(clearedFrom('N'), 'A');
  const parts = agy(dir, 'N', 'SessionStart', path.join(dir, 'N.jsonl'));
  assert.deepEqual(s.connection('N').previous, ['A']);
  assert.equal(s.connection('N').session, 'demo');
  const recovery = parts.find((p) => p.startsWith(clearTitle));
  assert.equal(blockOf(recovery), `${clearHead}\n${mainBody}`);
  assert.ok(mapOf(recovery).includes('before-agy-clear'));
  assert.ok(parts.find((p) => p.startsWith('# 최근 대화')).includes('BEFORE-CLEAR'));
  for (const [id, rows] of [
    ['intervening', [command, { workspace: dir, conversationId: 'else', display: 'other' }, current('intervening')]],
    ['missing', [command]],
    ['workspace', [{ ...command, workspace: 'other' }, current('workspace')]],
  ]) {
    jsonl(history, rows);
    assert.equal(clearedFrom(id), null);
    assert.ok(agy(dir, id, 'SessionStart', path.join(dir, `${id}.jsonl`)).some((p) => p.includes('연결되지 않았')));
    assert.equal(s.connection(id), null);
  }
  jsonl(history, [command, { ...command, workspace: 'unrelated' }, current('skips-other')]);
  assert.equal(clearedFrom('skips-other'), 'A');
  s.create({ name: 'chosen', context: 'chosen', conversation_id: 'chosen-seed' });
  jsonl(history, [command, current('requested')]);
  write(path.join(locations(dir).state, 'start/antigravity-requested.json'), JSON.stringify({ session: 'chosen' }));
  const requested = agy(dir, 'requested', 'SessionStart', path.join(dir, 'requested.jsonl'));
  assert.equal(s.connection('requested').session, 'chosen');
  assert.equal(s.connection('requested').previous, undefined);
  assert.ok(!requested.some((p) => p.startsWith(clearTitle)));
});
