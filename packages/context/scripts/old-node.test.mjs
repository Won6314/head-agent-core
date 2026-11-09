import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// A Node without node:sqlite (older than 22.13) still starts the tool servers and the hooks:
// the host keeps the server (it does not remember a failed start for every conversation), every
// tool call answers with the reason, and the start hooks put that reason in once.
const here = path.dirname(new URL(import.meta.url).pathname);
const noSqlite = path.join(here, 'fixtures/no-sqlite.cjs');
const run = (script, args, input) =>
  spawnSync(process.execPath, ['--require', noSqlite, path.join(here, script), ...args], {
    input,
    cwd: process.env.HOME,
    env: { ...process.env, CLAUDE_PROJECT_DIR: process.env.HOME },
    encoding: 'utf8',
  });
const rpc = (...messages) => messages.map((m) => JSON.stringify({ jsonrpc: '2.0', ...m })).join('\n') + '\n';
const REASON = /^head-context는 Node 22\.13 이상이 필요합니다\(지금 v[\d.]+, .+\)/;

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

test('old Node: the start hooks give the reason once, the core parts and other hooks run as before', () => {
  const start = JSON.stringify({
    hook_event_name: 'SessionStart',
    session_id: '11111111-2222-3333-4444-555555555555',
    cwd: process.env.HOME,
    source: 'startup',
  });
  const said = [];
  for (const [script, part] of [
    ['hook.mjs', ['session']],
    ['hook.mjs', ['context']],
    ['hook.mjs', ['recent']],
    ['hook.mjs', ['core', '1', '2']],
    ['codex-hook.mjs', ['session']],
    ['codex-hook.mjs', ['context']],
  ]) {
    const r = run(script, part, start);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
    if (r.stdout.trim()) said.push([`${script} ${part[0]}`, JSON.parse(r.stdout).hookSpecificOutput.additionalContext]);
  }
  assert.deepEqual(
    said.map(([who]) => who),
    ['hook.mjs session', 'codex-hook.mjs session'],
  );
  for (const [, text] of said) assert.match(text, REASON);
  const instructions = run('codex-hook.mjs', ['instructions'], start);
  assert.match(JSON.parse(instructions.stdout).hookSpecificOutput.additionalContext, /작업 세션/);
  const pre = run(
    'hook.mjs',
    [],
    JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: 'c1',
      cwd: process.env.HOME,
      tool_name: 'mcp__plugin_head-context_session__list',
      tool_input: {},
    }),
  );
  assert.equal(JSON.parse(pre.stdout).hookSpecificOutput.updatedInput.conversation_id, 'c1');
  assert.equal(fs.existsSync(path.join(process.env.HOME, '.head/index.sqlite')), false);
});
