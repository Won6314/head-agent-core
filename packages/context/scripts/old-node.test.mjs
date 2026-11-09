import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { sessions } from '../core/sessions.mjs';
import { callTool } from '../core/mcp.mjs';
// A Node without node:sqlite (older than 22.13) still starts the tool servers and the hooks:
// the host keeps the server (it does not remember a failed start for every conversation), every
// tool call answers with the reason, and the start hooks put that reason in once.
const here = path.dirname(new URL(import.meta.url).pathname);
const noSqlite = path.join(here, 'fixtures/no-sqlite.cjs');
const run = (script, args, input, dir = process.env.HOME) =>
  spawnSync(process.execPath, ['--require', noSqlite, path.join(here, script), ...args], {
    input,
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8',
  });
const rpc = (...messages) => messages.map((m) => JSON.stringify({ jsonrpc: '2.0', ...m })).join('\n') + '\n';
const REASON = /^head-context는 node:sqlite를 쓸 수 있는 Node\(22\.13 이상\)가 필요합니다\. 지금 node\(v[\d.]+, .+\)는/;

for (const server of ['mcp.mjs', 'codex-mcp.mjs'])
  test(`old Node: ${server} answers initialize and tools/list, and every call with the reason`, () => {
    const r = run(
      server,
      [],
      rpc(
        { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        { id: 2, method: 'tools/list' },
        { id: 3, method: 'tools/call', params: { name: 'list', arguments: {} } },
      ),
    );
    assert.equal(r.status, 0, r.stderr);
    const [init, list, call] = r.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(init.result.serverInfo.name, 'head-context');
    assert.ok(list.result.tools.some((t) => t.name === 'save'));
    assert.equal(call.result.isError, true);
    assert.match(call.result.content[0].text, REASON);
  });

// A project set up, with a work session and a save, by a Node that has node:sqlite; and one
// conversation's record file with three exchanges.
const project = () => {
  const dir = fs.mkdtempSync(path.join(process.env.HOME, 'old-'));
  callTool(sessions(dir), 'setup', { action: 'setup' }, undefined, dir);
  const s = sessions(dir);
  s.create({ name: 'demo', context: '# demo\n\n방향', conversation_id: 'c1' });
  s.save({ summary: '한 일', history: '본문', conversation_id: 'c1' });
  const transcript = path.join(dir, 'c1.jsonl');
  const lines = [];
  for (let i = 1; i <= 3; i++)
    lines.push(
      {
        type: 'user',
        sessionId: 'c1',
        timestamp: `2026-11-09T0${i}:00:00.000Z`,
        message: { role: 'user', content: `ASK-${i}` },
      },
      {
        type: 'assistant',
        sessionId: 'c1',
        message: { role: 'assistant', content: [{ type: 'text', text: `ANSWER-${i}` }] },
      },
    );
  fs.writeFileSync(transcript, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const index = path.join(dir, '.head/index.sqlite');
  const sum = () => crypto.createHash('md5').update(fs.readFileSync(index)).digest('hex');
  return { dir, transcript, sum };
};
const context = (r) => {
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
};

test('old Node: on a set-up project the start hooks give the reason once, and the core and the Codex guide go in', () => {
  const { dir, sum } = project();
  const before = sum();
  const start = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'c1', cwd: dir, source: 'startup' });
  const said = {};
  for (const [script, part] of [
    ['hook.mjs', ['session']],
    ['hook.mjs', ['context']],
    ['hook.mjs', ['recent']],
    ['hook.mjs', ['core', '1', '2']],
    ['hook.mjs', ['core', '2', '2']],
    ['codex-hook.mjs', ['session']],
    ['codex-hook.mjs', ['context']],
    ['codex-hook.mjs', ['core']],
    ['codex-hook.mjs', ['instructions']],
  ]) {
    const text = context(run(script, part, start, dir));
    if (text) said[`${script} ${part.join(' ')}`] = text;
  }
  assert.deepEqual(Object.keys(said), [
    'hook.mjs session',
    'hook.mjs core 1 2',
    'hook.mjs core 2 2',
    'codex-hook.mjs session',
    'codex-hook.mjs core',
    'codex-hook.mjs instructions',
  ]);
  assert.match(said['hook.mjs session'], REASON);
  assert.match(said['codex-hook.mjs session'], REASON);
  assert.match(said['hook.mjs core 1 2'], /^# HEAD Core/);
  assert.match(said['codex-hook.mjs core'], /^# HEAD Core/);
  assert.match(said['codex-hook.mjs instructions'], /작업 세션/);
  const pre = run(
    'hook.mjs',
    [],
    JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: 'c1',
      cwd: dir,
      tool_name: 'mcp__plugin_head-context_session__list',
      tool_input: {},
    }),
    dir,
  );
  assert.equal(JSON.parse(pre.stdout).hookSpecificOutput.updatedInput.conversation_id, 'c1');
  assert.equal(sum(), before); // the index is not touched
});

test('old Node: a compact keeps the host summary and puts the recent exchanges back', () => {
  const { dir, transcript } = project();
  // PreCompact gives no one-line-summary order: the work context it leans on cannot come back.
  const compact = run(
    'hook.mjs',
    [],
    JSON.stringify({ hook_event_name: 'PreCompact', session_id: 'c1', cwd: dir, transcript_path: transcript }),
    dir,
  );
  assert.equal(compact.status, 0, compact.stderr);
  assert.equal(compact.stdout, '');
  const after = JSON.stringify({
    hook_event_name: 'SessionStart',
    session_id: 'c1',
    cwd: dir,
    source: 'compact',
    transcript_path: transcript,
  });
  const recent = context(run('hook.mjs', ['recent'], after, dir));
  assert.match(recent, /# 최근 대화[\s\S]*ASK-1[\s\S]*ANSWER-3/);
  assert.match(context(run('hook.mjs', ['session'], after, dir)), REASON);
  assert.equal(context(run('hook.mjs', ['context'], after, dir)), '');
  // With node:sqlite the order is there as before.
  const usual = spawnSync(process.execPath, [path.join(here, 'hook.mjs')], {
    input: JSON.stringify({ hook_event_name: 'PreCompact', session_id: 'c1', cwd: dir }),
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8',
  });
  assert.match(usual.stdout, /OVERRIDE FOR THIS SUMMARY/);
});
