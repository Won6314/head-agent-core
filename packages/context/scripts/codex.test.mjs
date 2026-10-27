import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { runHook } from './hook-run.mjs';
import { sessions } from '../core/sessions.mjs';
import { callTool, instructions, PROJECT_UNKNOWN } from '../core/mcp.mjs';
import { CORE_SOURCE, coreParts } from '../core/project.mjs';
import { dataDir } from '../hosts/codex/register.mjs';
const root = process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir();
const fresh = () => fs.mkdtempSync(path.join(root, 'codex-'));
const core = fs.readFileSync(CORE_SOURCE, 'utf8').trimEnd();
const setup = dir => callTool(sessions(dir), 'project_setup', { action: 'setup' }, undefined, dir);
const text = out => (out ? JSON.parse(out).hookSpecificOutput.additionalContext : '');
// Claude: the core arrives as `core <i> 2`.
const claudeCore = (dir, { id = 'c1', source = 'startup', order = [1, 2] } = {}) => {
  const got = {};
  for (const i of order) got[i] = text(runHook({ hook_event_name: 'SessionStart', session_id: id, source, cwd: dir }, { env: { CLAUDE_PROJECT_DIR: dir }, part: undefined, args: ['core', String(i), '2'] }));
  return [got[1], got[2]];
};
// Another test file may lay a survey procedure down for a moment; the guide line may follow.
const UNCONNECTED_FIRST = /^이 대화는 아직 작업 세션에 연결되지 않았습니다\.(\n\n# 프로젝트 조사[\s\S]*)?$/;
const codexScript = path.resolve('scripts/codex-hook.mjs');
const codex = (dir, part, { id = 't1', source = 'startup', data, env = {} } = {}) => {
  const r = spawnSync(process.execPath, [codexScript, part], { input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: id, source, cwd: dir, transcript_path: `/x/rollout-${id}.jsonl` }), env: { PATH: process.env.PATH, HOME: process.env.HOME, HEAD_CONTEXT_CODEX_DATA: data, ...env }, encoding: 'utf8' });
  assert.equal(r.status, 0); assert.equal(r.stderr, ''); return text(r.stdout);
};
const codexStart = (dir, opts) => Object.fromEntries(['core', 'instructions', 'session', 'context'].map(p => [p, codex(dir, p, opts)]));

test('Claude: the core comes from the start hook after setup, in two named parts under the cap; not on resume or fork', () => {
  const dir = fresh();
  assert.deepEqual(claudeCore(dir), ['', '']);
  setup(dir);
  for (const source of ['startup', 'clear', 'compact']) {
    const [a, b] = claudeCore(dir, { source, id: `s-${source}` });
    assert.ok(a.startsWith('# HEAD Core')); assert.match(b, /^# HEAD Core \(계속 2\/2\)/);
    assert.ok(a.length <= 9000 && b.length <= 9000);
    const whole = a.replace(/\n\n\(HEAD Core 1\/2[^\n]*\)$/, '') + '\n\n' + b.replace(/^# HEAD Core \(계속 2\/2\)\n\n/, '');
    assert.equal(whole, core);
  }
  for (const source of ['resume', 'fork']) assert.deepEqual(claudeCore(dir, { source, id: `q-${source}` }), ['', '']);
  assert.deepEqual(coreParts(dir, 1), [core]);
});
test('Claude: a 0.7 project loses its CLAUDE.md import on the next start, which gives the core once from the hook', () => {
  for (const order of [[1, 2], [2, 1]]) {
    const dir = fresh(); setup(dir);
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Mine\n\nkeep this\n\n@.head/core.md\n');
    const [a, b] = claudeCore(dir, { id: 'old', order }); assert.ok(a && b);
    assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), '# Mine\n\nkeep this\n');
    const [c, d] = claudeCore(dir, { id: 'new' }); assert.ok(c && d);
  }
  const only = fresh(); setup(only); fs.writeFileSync(path.join(only, 'CLAUDE.md'), '@.head/core.md\n');
  claudeCore(only, { id: 'x' }); assert.equal(fs.existsSync(path.join(only, 'CLAUDE.md')), false);
  // Resume and fork leave CLAUDE.md as it is.
  fs.writeFileSync(path.join(only, 'CLAUDE.md'), '@.head/core.md\n');
  assert.deepEqual(claudeCore(only, { id: 'y', source: 'resume' }), ['', '']); assert.ok(fs.existsSync(path.join(only, 'CLAUDE.md')));
});
test('Codex start: core whole, the server instructions, the work session and context; resume and fork add nothing', () => {
  const dir = fresh(), data = fresh(); setup(dir);
  const s = sessions(dir, { host: 'codex' }); s.create({ name: 'demo', context: 'CODEX DIRECTION', conversation_id: 'seed' });
  s.branch({ action: 'create', branch: 'work', conversation_id: 'seed' }); s.save({ summary: 'S1', history: 'B1', next: 'N1', conversation_id: 'seed' });
  const first = codexStart(dir, { id: 't1', data });
  assert.equal(first.core, core); assert.equal(first.instructions, instructions);
  assert.match(first.session, UNCONNECTED_FIRST); assert.equal(first.context, '');
  const reg = JSON.parse(fs.readFileSync(path.join(data, 'threads', 't1.json'), 'utf8'));
  assert.equal(reg.cwd, dir); assert.equal(reg.transcript_path, '/x/rollout-t1.jsonl');
  const compact = codexStart(dir, { id: 'seed', source: 'compact', data });
  assert.equal(compact.core, core); assert.match(compact.session, /CODEX DIRECTION[\s\S]*이 대화의 작업 브랜치: work/); assert.match(compact.context, /이 작업 브랜치의 최근 기록: work[\s\S]*다음: N1/);
  for (const source of ['resume', 'fork']) assert.deepEqual(codexStart(dir, { id: 'seed', source, data }), { core: '', instructions: '', session: '', context: '' });
  assert.ok(fs.existsSync(path.join(dir, '.head/state/conversations/codex-seed.json')));
});
test('Codex /clear starts unconnected even when the conversation before it was connected', () => {
  const dir = fresh(), data = fresh(); setup(dir);
  const s = sessions(dir, { host: 'codex' }); s.create({ name: 'demo', context: 'D', conversation_id: 'before' });
  const after = codexStart(dir, { id: 'after', source: 'clear', data });
  assert.match(after.session, UNCONNECTED_FIRST); assert.doesNotMatch(after.session, /# 작업 세션/); assert.equal(after.context, ''); assert.equal(after.core, core);
  assert.equal(fs.existsSync(path.join(dir, '.head/state/conversations/codex-after.json')), false);
});
const mcp = (messages, env) => { const r = spawnSync(process.execPath, [path.resolve('scripts/codex-mcp.mjs')], { input: messages.map(m => JSON.stringify(m)).join('\n') + '\n', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, encoding: 'utf8' }); return r.stdout.trim().split('\n').map(l => JSON.parse(l)); };
const call = (id, name, args, thread) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { _meta: thread ? { threadId: thread, sessionId: thread } : {}, name, arguments: args } });
test('Codex tool server: the conversation from _meta.threadId, the project from the registered folder', () => {
  const dir = fresh(), data = fresh(); setup(dir);
  sessions(dir, { host: 'codex' }).create({ name: 'demo', context: 'MCP DIRECTION', conversation_id: 'seed' });
  codex(dir, 'session', { id: 'th1', data });
  const [init, load, unknown] = mcp([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, call(2, 'session_load', { name: 'demo' }, 'th1'), call(3, 'session_list', {}, 'nobody')], { HEAD_CONTEXT_CODEX_DATA: data });
  assert.equal(init.result.serverInfo.version, '0.8.0');
  assert.equal(load.result.isError, undefined); assert.match(load.result.content[0].text, /MCP DIRECTION/);
  const bound = JSON.parse(fs.readFileSync(path.join(dir, '.head/state/conversations/codex-th1.json'), 'utf8'));
  assert.equal(bound.host, 'codex'); assert.equal(bound.session, 'demo');
  assert.equal(unknown.result.isError, true); assert.equal(unknown.result.content[0].text, PROJECT_UNKNOWN);
});
test('Codex data folder: worked out from the installed plugin folder, the same for the hook and the server', () => {
  assert.equal(dataDir({ env: {}, root: '/h/.codex/plugins/cache/head-agent-core/head-context/0.8.0' }), '/h/.codex/plugins/data/head-context-head-agent-core');
  assert.equal(dataDir({ env: { PLUGIN_DATA: '/d' }, root: '/src/packages/context' }), '/d');
  assert.equal(dataDir({ env: {}, root: '/src/packages/context' }), null);
});
test('one package carries both hosts: Codex manifest, hooks and a relative tool server path', () => {
  const m = JSON.parse(fs.readFileSync('.codex-plugin/plugin.json', 'utf8')), c = JSON.parse(fs.readFileSync('.claude-plugin/plugin.json', 'utf8'));
  assert.equal(m.version, c.version); assert.equal(m.name, c.name);
  const server = JSON.parse(fs.readFileSync(m.mcpServers, 'utf8')).mcpServers.context;
  assert.deepEqual(server.args, ['scripts/codex-mcp.mjs']); assert.equal(server.cwd, '.');
  const hooks = JSON.parse(fs.readFileSync(m.hooks, 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks), ['SessionStart']);
  assert.deepEqual(hooks.SessionStart[0].hooks.map(h => h.command.split(' ').at(-1)), ['core', 'instructions', 'session', 'context']);
  const claude = JSON.parse(fs.readFileSync('hooks/hooks.json', 'utf8')).hooks.SessionStart[0].hooks.map(h => h.args.slice(1).join(' '));
  assert.deepEqual(claude, ['core 1 2', 'core 2 2', 'session', 'context', 'recent']);
});
