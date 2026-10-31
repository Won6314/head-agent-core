import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sessions } from '../core/sessions.mjs';
import { processEvidence, evidenceAlive } from '../core/liveness.mjs';
import { report } from '../core/state.mjs';
const temporaryRoot = process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir();

test('the host boundary isolates equal native IDs: each host has its own connection and branch', () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'context-hosts-'));
  try {
    const a = sessions(root, { host: 'alpha' }),
      b = sessions(root, { host: 'bravo' });
    a.create({ name: 'demo', context: 'direction', conversation_id: 'same' });
    a.branch({ action: 'create', branch: 'A', conversation_id: 'same' });
    b.load({ name: 'demo', conversation_id: 'same' });
    b.branch({ action: 'create', branch: 'B', conversation_id: 'same' });
    a.save({ summary: 'A', history: 'A body', next: 'A next', conversation_id: 'same' });
    b.save({ summary: 'B', history: 'B body', next: 'B next', conversation_id: 'same' });
    assert.equal(a.connection('same').branch, 'A');
    assert.equal(b.connection('same').branch, 'B');
    assert.match(fs.readFileSync(path.join(root, '.head/sessions/demo/work/A/history.md'), 'utf8'), /A body/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, '.head/sessions/demo/work/A/history.md'), 'utf8'), /B body/);
    assert.ok(fs.existsSync(path.join(root, '.head/state/conversations/alpha-same.json')));
    assert.ok(fs.existsSync(path.join(root, '.head/state/conversations/bravo-same.json')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('kept for adapters outside the core: process evidence and the subtask report still work', () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'context-hosts-'));
  try {
    assert.equal(evidenceAlive({}), false);
    const evidence = processEvidence();
    assert.equal(evidenceAlive({ liveness: evidence }), true);
    report(root, { host: 'claude', parent_conversation_id: 'p', id: 'child', status: 'running' });
    assert.ok(fs.existsSync(path.join(root, '.head/state/subtasks/claude-p__child.json')));
    assert.throws(
      () => report(root, { host: 'claude', parent_conversation_id: 'p', id: 'c', status: 'busy' }),
      /하위작업 상태/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('0.7.1: report keeps a subtask child conversation id once given', async () => {
  const { report } = await import('../core/state.mjs');
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir(), 'report-'));
  report(dir, {
    host: 'claude',
    parent_conversation_id: 'p',
    id: 'ctx-1',
    name: '일',
    status: 'running',
    kind: 'context_run',
    child_conversation_id: 'k',
  });
  report(dir, { host: 'claude', parent_conversation_id: 'p', id: 'ctx-1', status: 'ended' });
  const r = JSON.parse(fs.readFileSync(path.join(dir, '.head/state/subtasks/claude-p__ctx-1.json'), 'utf8'));
  const assert = (await import('node:assert/strict')).default;
  assert.equal(r.child_conversation_id, 'k');
  assert.equal(r.status, 'ended');
  assert.equal(r.name, '일');
  assert.equal(r.kind, 'context_run');
});
