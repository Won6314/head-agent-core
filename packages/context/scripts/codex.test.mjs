import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { runHook } from './hook-run.mjs';
import { sessions } from '../core/sessions.mjs';
import { UNREGISTERED } from '../hosts/codex/register.mjs';
import { callTool, instructionsFor, PROJECT_UNKNOWN, FORK_WRITE_REFUSED, SUBAGENT_NOTICE } from '../core/mcp.mjs';
import { CORE_SOURCE, coreParts, migrateImport, setupTool } from '../core/project.mjs';
import { dataDir } from '../hosts/codex/register.mjs';
import { queue } from '../hosts/codex/threads.mjs';
const root = process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir();
const fresh = () => fs.mkdtempSync(path.join(root, 'codex-'));
const core = fs.readFileSync(CORE_SOURCE, 'utf8').trimEnd();
const setup = (dir) => callTool(sessions(dir), 'setup', { action: 'setup' }, undefined, dir);
const text = (out) => (out ? JSON.parse(out).hookSpecificOutput.additionalContext : '');
// Claude: the core arrives as `core <i> 2`.
const claudeCore = (dir, { id = 'c1', source = 'startup', order = [1, 2] } = {}) => {
  const got = {};
  for (const i of order)
    got[i] = text(
      runHook(
        { hook_event_name: 'SessionStart', session_id: id, source, cwd: dir },
        { env: { CLAUDE_PROJECT_DIR: dir }, part: undefined, args: ['core', String(i), '2'] },
      ),
    );
  return [got[1], got[2]];
};
// Another test file may lay a survey procedure down for a moment; the guide line may follow.
const UNCONNECTED_FIRST = /^이 대화는 아직 작업 세션에 연결되지 않았습니다\.(\n\n# 프로젝트 조사[\s\S]*)?$/;
const codexScript = path.resolve('scripts/codex-hook.mjs');
const codex = (dir, part, { id = 't1', source = 'startup', data, env = {} } = {}) => {
  const r = spawnSync(process.execPath, [codexScript, part], {
    input: JSON.stringify({
      hook_event_name: 'SessionStart',
      session_id: id,
      source,
      cwd: dir,
      transcript_path: `/x/rollout-${id}.jsonl`,
    }),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, HEAD_CONTEXT_CODEX_DATA: data, ...env },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  return text(r.stdout);
};
const codexStart = (dir, opts) =>
  Object.fromEntries(['core', 'instructions', 'session', 'context'].map((p) => [p, codex(dir, p, opts)]));

test('Claude: the core comes from the start hook after setup, in two named parts under the cap; not on resume or fork', () => {
  const dir = fresh();
  assert.deepEqual(claudeCore(dir), ['', '']);
  setup(dir);
  for (const source of ['startup', 'clear', 'compact']) {
    const [a, b] = claudeCore(dir, { source, id: `s-${source}` });
    assert.ok(a.startsWith('# HEAD Core'));
    assert.match(b, /^# HEAD Core \(계속 2\/2\)/);
    assert.ok(a.length <= 9000 && b.length <= 9000);
    const whole =
      a.replace(/\n\n\(HEAD Core 1\/2[^\n]*\)$/, '') + '\n\n' + b.replace(/^# HEAD Core \(계속 2\/2\)\n\n/, '');
    assert.equal(whole, core);
  }
  for (const source of ['resume', 'fork']) assert.deepEqual(claudeCore(dir, { source, id: `q-${source}` }), ['', '']);
  assert.deepEqual(coreParts(dir, 1), [core]);
});
test('Claude: a 0.7 project loses its CLAUDE.md import on the next start, which gives the core once from the hook', () => {
  for (const order of [
    [1, 2],
    [2, 1],
  ]) {
    const dir = fresh();
    setup(dir);
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Mine\n\nkeep this\n\n@.head/core.md\n');
    const [a, b] = claudeCore(dir, { id: 'old', order });
    assert.ok(a && b);
    assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), '# Mine\n\nkeep this\n\n');
    const [c, d] = claudeCore(dir, { id: 'new' });
    assert.ok(c && d);
  }
  const only = fresh();
  setup(only);
  fs.writeFileSync(path.join(only, 'CLAUDE.md'), '@.head/core.md\n');
  claudeCore(only, { id: 'x' });
  assert.equal(fs.existsSync(path.join(only, 'CLAUDE.md')), false);
});
test('Claude resume: a conversation whose records carry no core from the hook (begun under 0.7) gets it once; one that does gets nothing', () => {
  const dir = fresh();
  setup(dir);
  const held = path.join(dir, 'held.jsonl'),
    old = path.join(dir, 'old.jsonl');
  fs.writeFileSync(held, JSON.stringify({ attachment: { content: coreParts(dir, 2, 9000)[0] } }) + '\n');
  fs.writeFileSync(old, '{"type":"user"}\n');
  const run = (transcript, source = 'resume') =>
    [1, 2].map((i) =>
      text(
        runHook(
          { hook_event_name: 'SessionStart', session_id: 'r', source, cwd: dir, transcript_path: transcript },
          { env: { CLAUDE_PROJECT_DIR: dir }, args: ['core', String(i), '2'] },
        ),
      ),
    );
  assert.deepEqual(run(held), ['', '']);
  const [a, b] = run(old);
  assert.ok(a.startsWith('# HEAD Core') && b.startsWith('# HEAD Core (계속'));
  assert.deepEqual(run(old, 'fork'), ['', '']);
});
test('Codex start: core whole, the server instructions, the work session and context; resume and fork add nothing', () => {
  const dir = fresh(),
    data = fresh();
  setup(dir);
  const s = sessions(dir, { host: 'codex' });
  s.create({ name: 'demo', context: 'CODEX DIRECTION', conversation_id: 'seed' });
  s.branch({ action: 'create', branch: 'work', conversation_id: 'seed' });
  s.save({ summary: 'S1', history: 'B1', next: 'N1', conversation_id: 'seed' });
  const first = codexStart(dir, { id: 't1', data });
  assert.equal(first.core, core);
  assert.equal(first.instructions, instructionsFor('codex'));
  assert.match(first.instructions, /send\(threadId/);
  assert.match(first.session, UNCONNECTED_FIRST);
  assert.equal(first.context, '');
  const reg = JSON.parse(fs.readFileSync(path.join(data, 'threads', 't1.json'), 'utf8'));
  assert.equal(reg.cwd, dir);
  assert.equal(reg.transcript_path, '/x/rollout-t1.jsonl');
  const compact = codexStart(dir, { id: 'seed', source: 'compact', data });
  assert.equal(compact.core, core);
  assert.match(compact.session, /CODEX DIRECTION[\s\S]*이 대화의 작업 브랜치: work/);
  assert.match(compact.context, /이 작업 브랜치의 최근 기록: work[\s\S]*다음: N1/);
  for (const source of ['resume', 'fork'])
    assert.deepEqual(codexStart(dir, { id: 'seed', source, data }), {
      core: '',
      instructions: '',
      session: '',
      context: '',
    });
  assert.ok(fs.existsSync(path.join(dir, '.head/state/conversations/codex-seed.json')));
});
test('Codex /clear starts unconnected even when the conversation before it was connected', () => {
  const dir = fresh(),
    data = fresh();
  setup(dir);
  const s = sessions(dir, { host: 'codex' });
  s.create({ name: 'demo', context: 'D', conversation_id: 'before' });
  const after = codexStart(dir, { id: 'after', source: 'clear', data });
  assert.match(after.session, UNCONNECTED_FIRST);
  assert.doesNotMatch(after.session, /# 작업 세션/);
  assert.equal(after.context, '');
  assert.equal(after.core, core);
  assert.equal(fs.existsSync(path.join(dir, '.head/state/conversations/codex-after.json')), false);
});
const mcp = (messages, env) => {
  const r = spawnSync(process.execPath, [path.resolve('scripts/codex-mcp.mjs')], {
    input: messages.map((m) => JSON.stringify(m)).join('\n') + '\n',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: 'utf8',
  });
  return r.stdout
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
};
const call = (id, name, args, thread) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { _meta: thread ? { threadId: thread, sessionId: thread } : {}, name, arguments: args },
});
test('Codex tool server: the conversation from _meta.threadId, the project from the registered folder', () => {
  const dir = fresh(),
    data = fresh();
  setup(dir);
  sessions(dir, { host: 'codex' }).create({ name: 'demo', context: 'MCP DIRECTION', conversation_id: 'seed' });
  codex(dir, 'session', { id: 'th1', data });
  const [init, load, unknown] = mcp(
    [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      call(2, 'load', { name: 'demo' }, 'th1'),
      call(3, 'list', {}, 'nobody'),
    ],
    { HEAD_CONTEXT_CODEX_DATA: data },
  );
  assert.equal(init.result.serverInfo.version, '0.9.4');
  assert.equal(load.result.isError, undefined);
  assert.match(load.result.content[0].text, /MCP DIRECTION/);
  const bound = JSON.parse(fs.readFileSync(path.join(dir, '.head/state/conversations/codex-th1.json'), 'utf8'));
  assert.equal(bound.host, 'codex');
  assert.equal(bound.session, 'demo');
  assert.equal(unknown.result.isError, true);
  assert.equal(unknown.result.content[0].text, UNREGISTERED);
  assert.match(UNREGISTERED, /Hook → 플러그인에서 제공 → Head Context → 모두 신뢰/);
  assert.match(UNREGISTERED, /Trust all and continue/);
});
test('Codex subagent: a thread the conversation spawned reads through its conversation and writes nothing; its hooks keep to it', () => {
  const dir = fresh(),
    data = fresh();
  setup(dir);
  sessions(dir, { host: 'codex' }).create({ name: 'demo', context: 'SUB DIRECTION', conversation_id: 'seed' });
  codex(dir, 'session', { id: 'root1', data });
  // Codex names the spawned thread (threadId) and its tree's root (sessionId) on each call.
  const sub = (id, name, args) => ({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { _meta: { threadId: 'child1', sessionId: 'root1' }, name, arguments: args },
  });
  const [load, read, todo, save, setupCall] = mcp(
    [
      call(1, 'load', { name: 'demo' }, 'root1'),
      sub(2, 'read', { action: 'overview', name: 'demo' }),
      sub(3, 'todo', { action: 'list', name: 'demo' }),
      sub(4, 'save', { summary: 's', history: 'h' }),
      sub(5, 'setup', { action: 'setup' }),
    ],
    { HEAD_CONTEXT_CODEX_DATA: data },
  );
  assert.equal(load.result.isError, undefined);
  assert.equal(read.result.isError, undefined);
  assert.match(read.result.content[0].text, /SUB DIRECTION/);
  assert.equal(todo.result.isError, undefined);
  assert.equal(save.result.isError, true);
  assert.equal(save.result.content[0].text, FORK_WRITE_REFUSED);
  assert.equal(setupCall.result.isError, true);
  assert.equal(setupCall.result.content[0].text, FORK_WRITE_REFUSED);
  assert.equal(fs.existsSync(path.join(dir, '.head/state/conversations/codex-child1.json')), false);
  // SubagentStart gives the task notice; its prompt hook does not empty the conversation's inbox.
  const hook = (input, part) =>
    spawnSync(process.execPath, [codexScript, part], {
      input: JSON.stringify(input),
      env: { PATH: process.env.PATH, HOME: process.env.HOME, HEAD_CONTEXT_CODEX_DATA: data },
      encoding: 'utf8',
    });
  assert.equal(
    text(
      hook(
        { hook_event_name: 'SubagentStart', session_id: 'root1', agent_id: 'child1', agent_type: 'default', cwd: dir },
        'subagent',
      ).stdout,
    ),
    SUBAGENT_NOTICE,
  );
  queue(dir, 'root1', { from: 'claude:x', text: 'FOR ROOT' });
  assert.equal(
    hook(
      { hook_event_name: 'UserPromptSubmit', session_id: 'root1', agent_id: 'child1', cwd: dir, prompt: 'go' },
      'inbox',
    ).stdout,
    '',
  );
  assert.match(
    hook({ hook_event_name: 'UserPromptSubmit', session_id: 'root1', cwd: dir, prompt: 'hi' }, 'inbox').stdout,
    /FOR ROOT/,
  );
});
test('Codex data folder: worked out from the installed plugin folder, the same for the hook and the server', () => {
  assert.equal(
    dataDir({ env: {}, root: '/h/.codex/plugins/cache/head-agent-core/head-context/0.8.0' }),
    '/h/.codex/plugins/data/head-context-head-agent-core',
  );
  assert.equal(dataDir({ env: { PLUGIN_DATA: '/d' }, root: '/src/packages/context' }), '/d');
  assert.equal(dataDir({ env: {}, root: '/src/packages/context' }), null);
});
test('one package carries both hosts: Codex manifest, hooks and a relative tool server path', () => {
  const m = JSON.parse(fs.readFileSync('.codex-plugin/plugin.json', 'utf8')),
    c = JSON.parse(fs.readFileSync('.claude-plugin/plugin.json', 'utf8'));
  assert.equal(m.version, c.version);
  assert.equal(m.name, c.name);
  const server = JSON.parse(fs.readFileSync(m.mcpServers, 'utf8')).mcpServers.session;
  assert.deepEqual(server.args, ['scripts/codex-mcp.mjs']);
  assert.equal(server.cwd, '.');
  const hooks = JSON.parse(fs.readFileSync(m.hooks, 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks), ['SessionStart', 'UserPromptSubmit', 'SubagentStart']);
  assert.deepEqual(
    hooks.SubagentStart[0].hooks.map((h) => h.command.split(' ').at(-1)),
    ['subagent'],
  );
  assert.deepEqual(
    hooks.UserPromptSubmit[0].hooks.map((h) => h.command.split(' ').at(-1)),
    ['inbox'],
  );
  assert.deepEqual(
    hooks.SessionStart[0].hooks.map((h) => h.command.split(' ').at(-1)),
    ['core', 'instructions', 'session', 'context'],
  );
  const claude = JSON.parse(fs.readFileSync('hooks/hooks.json', 'utf8')).hooks.SessionStart[0].hooks.map((h) =>
    h.args.slice(1).join(' '),
  );
  assert.deepEqual(claude, ['core 1 2', 'core 2 2', 'session', 'context', 'recent']);
});

// Review findings (검수 B1 first branch, B2, I1, I2), each as the reviewer reproduced it.
test('review B1: a conversation that got the core from setup does not get it again on resume', () => {
  const dir = fresh(),
    out = setupTool(dir, { action: 'setup' }),
    transcript = path.join(dir, 'setup.jsonl');
  assert.ok(out.includes(core));
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'setup', content: out }] },
    }) + '\n',
  );
  const got = [1, 2].map((i) =>
    text(
      runHook(
        { hook_event_name: 'SessionStart', source: 'resume', session_id: 'r', cwd: dir, transcript_path: transcript },
        { env: { CLAUDE_PROJECT_DIR: dir }, args: ['core', String(i), '2'] },
      ),
    ),
  );
  assert.deepEqual(got, ['', '']);
});
test('review B2: an unregistered Codex conversation stops at PROJECT_UNKNOWN even with CLAUDE_PROJECT_DIR set', () => {
  const a = fresh(),
    data = fresh();
  sessions(a, { host: 'codex' }).create({ name: 'PROJECT_A_ONLY', context: 'Project A', conversation_id: 'seed' });
  const [reply] = mcp([call(1, 'list', {}, 'unregistered-B')], {
    CLAUDE_PROJECT_DIR: a,
    HEAD_CONTEXT_CODEX_DATA: data,
  });
  assert.equal(reply.result.isError, true);
  assert.equal(reply.result.content[0].text, UNREGISTERED);
  assert.doesNotMatch(reply.result.content[0].text, /PROJECT_A_ONLY/);
});
test('review I1: migrateImport takes only the import lines out and keeps every other byte', () => {
  const dir = fresh(),
    file = path.join(dir, 'CLAUDE.md');
  fs.writeFileSync(file, '# User\r\n\r\n\r\n\r\nkeep  \r\n\r\n@.head/core.md\r\n  @.head/core.md  \r\n\r\n');
  assert.equal(migrateImport(dir), true);
  assert.equal(fs.readFileSync(file, 'utf8'), '# User\r\n\r\n\r\n\r\nkeep  \r\n\r\n\r\n');
  fs.writeFileSync(file, 'tail line\n@.head/core.md');
  migrateImport(dir);
  assert.equal(fs.readFileSync(file, 'utf8'), 'tail line\n');
  fs.writeFileSync(file, '\n@.head/core.md\n\n');
  migrateImport(dir);
  assert.equal(fs.existsSync(file), false);
  fs.writeFileSync(file, 'no import\r\n');
  assert.equal(migrateImport(dir), false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'no import\r\n');
});
test('review I2: on Codex the setup guide and result promise no Claude-only effect; the Claude settings are still written', () => {
  const dir = fresh(),
    data = fresh();
  const first = codex(dir, 'session', { id: 'g', data });
  assert.match(first, /Claude Code로 열 때 쓰도록/);
  assert.match(first, /Codex에서는 이 설정이 쓰이지 않고/);
  const [reply] = mcp([call(1, 'setup', { action: 'setup' }, 'g')], { HEAD_CONTEXT_CODEX_DATA: data });
  const out = reply.result.content[0].text;
  assert.doesNotMatch(out, /기본 포크가 켜지며|앱이 시작할 때 새 판을 받습니다/);
  assert.match(out, /Codex 설정은 바꾸지 않았습니다/);
  assert.match(out, /Claude Code용, Codex에서는 쓰이지 않음/);
  assert.ok(fs.existsSync(path.join(dir, '.claude/settings.json')));
  const claude = setupTool(fresh(), { action: 'setup' });
  assert.match(claude, /기본 포크가 켜지며, 앱이 시작할 때 새 판을 받습니다/);
  assert.doesNotMatch(claude, /Codex/);
});
