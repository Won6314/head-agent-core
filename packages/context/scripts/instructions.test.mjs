import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  INSTRUCTIONS,
  instructionsFor,
  APP_INSTRUCTIONS,
  DEFINITIONS,
  SUBAGENT_NOTICE,
  FORK_WRITE_REFUSED,
} from '../core/mcp.mjs';

// The app tools each app's own instructions name; the shared text names none of them.
const TOOLS = {
  claude: [/SendMessage/, /subagent_type/, /Agent 도구/],
  codex: [/spawn_agent/, /fork_turns/, /send_message_to_thread/, /\bsend\(/],
};
const none = (text, patterns, what) => {
  for (const p of patterns) assert.doesNotMatch(text, p, `${what}: ${p}`);
};
const skill = fs.readFileSync(new URL('../skills/start-job/SKILL.md', import.meta.url), 'utf8');
// What one app's server says at the start and lists as its tools.
const server = (script, env) => {
  const r = spawnSync(process.execPath, [path.resolve('scripts', script)], {
    input:
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ]
        .map((m) => JSON.stringify(m))
        .join('\n') + '\n',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: 'utf8',
  });
  const [init, list] = r.stdout
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  return { instructions: init.result.instructions, tools: list.result.tools.map((t) => JSON.stringify(t)).join('\n') };
};

test('shared instructions, the start-job skill and the shared notices name no app tool', () => {
  const all = [...TOOLS.claude, ...TOOLS.codex];
  none(INSTRUCTIONS, all, 'shared instructions');
  none(skill, all, 'start-job');
  none(SUBAGENT_NOTICE, all, 'subagent notice');
  none(FORK_WRITE_REFUSED, all, 'write refused');
  none(DEFINITIONS.map((d) => JSON.stringify(d)).join('\n'), all, 'shared tool descriptions');
  assert.match(skill, /이 앱에서 부르는 도구/);
});

test("each app reads the shared part and its own part, never the other app's tools", () => {
  const dir = fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir(), 'instr-'));
  const claude = server('mcp.mjs', { CLAUDE_PROJECT_DIR: dir });
  assert.equal(claude.instructions, instructionsFor('claude'));
  assert.ok(claude.instructions.startsWith(INSTRUCTIONS));
  assert.ok(claude.instructions.endsWith(APP_INSTRUCTIONS.claude));
  assert.match(claude.instructions, /SendMessage\(to: 보낼 곳\)/);
  assert.match(claude.instructions, /subagent_type "fork"/);
  none(claude.instructions + claude.tools, TOOLS.codex, 'Claude');
  const codex = server('codex-mcp.mjs', { HEAD_CONTEXT_CODEX_DATA: dir });
  assert.equal(codex.instructions, instructionsFor('codex'));
  const hook = spawnSync(process.execPath, [path.resolve('scripts/codex-hook.mjs'), 'instructions'], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'i1', source: 'startup', cwd: dir }),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, HEAD_CONTEXT_CODEX_DATA: dir },
    encoding: 'utf8',
  });
  assert.equal(JSON.parse(hook.stdout).hookSpecificOutput.additionalContext, instructionsFor('codex'));
  assert.match(codex.instructions, /send\(threadId: 보낼 곳, prompt\)/);
  assert.match(codex.instructions, /fork_turns "all"/);
  none(codex.instructions + codex.tools, TOOLS.claude, 'Codex');
  // A host without its own part (OpenCode) reads the shared part alone.
  assert.equal(instructionsFor('opencode'), INSTRUCTIONS);
});
