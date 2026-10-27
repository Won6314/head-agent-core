import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { sessions } from '../core/sessions.mjs';
import { setupTool } from '../core/project.mjs';
import { locations, noSymlink } from '../core/storage.mjs';

const fixture = t => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir(), 'symlink-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const real = path.join(base, 'real'), alias = path.join(base, 'shortcut');
  fs.mkdirSync(path.join(real, 'project'), { recursive: true });
  fs.symlinkSync(real, alias, 'dir');
  return { base, real: path.join(real, 'project'), project: path.join(alias, 'project'), data: path.join(base, 'data') };
};
const run = (script, args, input, env = {}) => {
  const r = spawnSync(process.execPath, [path.resolve('scripts', script), ...args], { input, encoding: 'utf8', env });
  assert.equal(r.status, 0); assert.equal(r.stderr.replace(/\(node:\d+\) ExperimentalWarning:[^\n]*\n/g, '').replace(/\(Use `node --trace-warnings[^\n]*\n/g, ''), '');
  return r.stdout;
};
const hook = (host, f, part, id = 'new', source = 'startup') => {
  const out = run(host === 'claude' ? 'hook.mjs' : 'codex-hook.mjs', part, JSON.stringify({ hook_event_name: 'SessionStart', cwd: f.project, session_id: id, source }), { CLAUDE_PROJECT_DIR: f.project, HEAD_CONTEXT_CODEX_DATA: f.data });
  return out ? JSON.parse(out).hookSpecificOutput.additionalContext : '';
};
const tool = (host, f, name, args, id = 'new') => {
  const out = run(host === 'claude' ? 'mcp.mjs' : 'codex-mcp.mjs', [], JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { ...args, ...(name.startsWith('session_') ? { conversation_id: id } : {}) }, _meta: { threadId: id } } }) + '\n', { CLAUDE_PROJECT_DIR: f.project, HEAD_CONTEXT_CODEX_DATA: f.data });
  const result = JSON.parse(out).result;
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return result.content[0].text;
};

test('ancestor links: both hosts set up, start and session_load through the original cwd', t => {
  for (const host of ['claude', 'codex']) {
    const f = fixture(t);
    assert.match(hook(host, f, ['session']), /초기설정/);
    assert.match(tool(host, f, 'project_setup', { action: 'setup' }), /초기설정을 마쳤습니다/);
    sessions(f.real).create({ name: 'demo', context: 'LINK CONTEXT', conversation_id: 'seed' });
    assert.match(hook(host, f, host === 'claude' ? ['core', '1', '2'] : ['core']), /# HEAD Core/);
    assert.match(tool(host, f, 'session_load', { name: 'demo' }), /LINK CONTEXT/);
    assert.match(hook(host, f, ['session'], 'new', 'compact'), /LINK CONTEXT/);
    assert.equal(sessions(f.real, { host }).connection('new').session, 'demo');
    if (host === 'codex') assert.equal(JSON.parse(fs.readFileSync(path.join(f.data, 'threads/new.json'))).cwd, f.project);
    // A project path that is itself a shortcut is also a valid boundary.
    const direct = path.join(f.base, 'project-link'); fs.symlinkSync(f.real, direct, 'dir');
    assert.equal(locations(direct).root, path.join(f.real, '.head'));
  }
});

test('record links stay refused: .head, record folders/files, connection files and configured sessions_dir', t => {
  for (const target of ['.head', '.head/sessions', '.head/sessions/demo', '.head/sessions/demo/history.md', '.head/state/conversations/claude-seed.json', 'records']) {
    const f = fixture(t); setupTool(f.project, { action: 'setup' });
    const store = sessions(f.project);
    store.create({ name: 'demo', context: 'SAFE', conversation_id: 'seed' });
    store.save({ summary: 'SAFE', history: 'SAFE BODY', conversation_id: 'seed' });
    const source = path.join(f.real, target), outside = path.join(f.base, 'outside');
    if (target === 'records') {
      fs.mkdirSync(outside); fs.writeFileSync(path.join(f.real, '.head/config.json'), JSON.stringify({ sessions_dir: 'records' }));
    } else fs.renameSync(source, outside);
    fs.symlinkSync(outside, source, target.endsWith('.md') || target.endsWith('.json') ? 'file' : 'dir');
    const before = fs.statSync(outside).mtimeMs;
    assert.throws(() => noSymlink(source), /심볼릭 링크는 허용하지 않습니다/);
    // A linked session directory is omitted from the graph rather than followed.
    assert.throws(() => sessions(f.project).save({ summary: 'NO', history: 'NO', conversation_id: 'seed' }), /심볼릭 링크는 허용하지 않습니다|연결|없습니다/);
    assert.equal(fs.statSync(outside).mtimeMs, before);
    if (target === '.head') assert.throws(() => setupTool(f.project, { action: 'setup' }), /심볼릭 링크/);
  }
});

test('0.8.0 connection records survive alias/real cwd changes, including old Codex registration', t => {
  const f = fixture(t), old = JSON.parse(fs.readFileSync(new URL('./fixtures/0.8.0-connections.json', import.meta.url)));
  for (const [name, body] of Object.entries(old.files)) {
    const file = path.join(f.real, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body);
  }
  // 0.8.0 registers cwd verbatim; neither its format nor its spelling is migrated.
  fs.mkdirSync(path.join(f.data, 'threads'), { recursive: true });
  const registration = JSON.stringify({ thread_id: 'old-codex', cwd: f.project, transcript_path: '/record/old.jsonl', at: '2026-10-27T11:57:05.266Z' });
  fs.writeFileSync(path.join(f.data, 'threads/old-codex.json'), registration);
  for (const host of ['claude', 'codex']) {
    const id = `old-${host}`;
    assert.equal(sessions(f.project, { host }).connection(id).branch, 'ongoing');
    const out = tool(host, f, 'session_load', {}, id);
    assert.match(out, /LEGACY 0.8.0 CONTEXT/); assert.match(out, /LEGACY NEXT/);
    assert.match(hook(host, f, ['session'], id, 'compact'), /LEGACY 0.8.0 CONTEXT/);
    assert.equal(sessions(f.real, { host }).connection(id).branch, 'ongoing');
  }
  for (const [name, body] of Object.entries(old.files).filter(([name]) => name.includes('/sessions/'))) assert.equal(fs.readFileSync(path.join(f.real, name), 'utf8'), body);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.data, 'threads/old-codex.json'))).cwd, f.project);
});

test('absolute sessions_dir under the original project prefix keeps internal link checks', t => {
  const f = fixture(t); setupTool(f.project, { action: 'setup' });
  fs.writeFileSync(path.join(f.real, '.head/config.json'), JSON.stringify({ sessions_dir: path.join(f.project, 'records') }));
  sessions(f.project).create({ name: 'demo', context: 'CUSTOM', conversation_id: 'seed' });
  assert.match(sessions(f.project).load({ name: 'demo', conversation_id: 'seed' }), /CUSTOM/);
  const records = path.join(f.real, 'records'); fs.renameSync(records, path.join(f.base, 'outside')); fs.symlinkSync(path.join(f.base, 'outside'), records, 'dir');
  assert.throws(() => sessions(f.project), /심볼릭 링크/);
});

test('absolute external sessions_dir shares only the allowed project ancestor, not record links', t => {
  const f = fixture(t); setupTool(f.project, { action: 'setup' });
  const records = path.join(path.dirname(f.project), 'records');
  fs.writeFileSync(path.join(f.real, '.head/config.json'), JSON.stringify({ sessions_dir: records }));
  sessions(f.project).create({ name: 'demo', context: 'EXTERNAL', conversation_id: 'seed' });
  assert.match(sessions(f.project).load({ name: 'demo', conversation_id: 'seed' }), /EXTERNAL/);
  const actual = path.join(path.dirname(f.real), 'records');
  fs.renameSync(actual, path.join(f.base, 'outside')); fs.symlinkSync(path.join(f.base, 'outside'), actual, 'dir');
  assert.throws(() => sessions(f.project), /심볼릭 링크/);
});
