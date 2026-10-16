import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sessions } from '../core/sessions.mjs';
import { transition, report } from '../core/state.mjs';
import { processEvidence, evidenceAlive } from '../core/liveness.mjs';
import { board } from '../core/board.mjs';
import { callTool } from '../core/mcp.mjs';
import opencode from '../hosts/opencode/plugin.mjs';
const temporaryRoot = process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir();

test('normalized host boundary isolates equal native IDs and reads legacy evidence', () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'context-hosts-'));
  try {
    const a = sessions(root, { host: 'alpha' }), b = sessions(root, { host: 'bravo' });
    a.create({ name: 'demo', context: 'direction', conversation_id: 'same' });
    a.branch({action:'create',branch:'A',label:'alpha branch',conversation_id:'same'});
    b.load({ name: 'demo', conversation_id: 'same' });
    b.branch({action:'create',branch:'B',label:'bravo branch',conversation_id:'same'});
    a.save({ summary: 'A', history: 'A body', next: 'A next', conversation_id: 'same' });
    b.save({ summary: 'B', history: 'B body', next: 'B next', conversation_id: 'same' });
    transition(root, { host: 'alpha', conversation_id: 'same', status: 'waiting', liveness: processEvidence() });
    transition(root, { host: 'bravo', conversation_id: 'same', status: 'working', liveness: null });
    report(root, { host: 'bravo', parent_conversation_id: 'same', id: 'child', status: 'running' });
    const data = board(root)[0].branches;
    assert.equal(data.find(w => w.name === 'A').status, 'waiting');
    assert.equal(data.find(w => w.name === 'B').status, 'stopped');
    assert.equal(data.find(w => w.name === 'A').conversations.flatMap(c=>c.subtasks).length, 0);
    assert.equal(data.find(w => w.name === 'B').conversations[0].running_subtasks, 0);
    assert.equal(data.find(w => w.name === 'B').conversations[0].host, 'bravo');
    assert.equal(evidenceAlive({}), false);
    const evidence = processEvidence();
    if (evidence) {
      assert.equal(evidenceAlive({ process: { pid: evidence.pid, start: evidence.start, platform: 'linux' } }), true);
      assert.equal(evidenceAlive({ liveness: { ...evidence, start: 'wrong' } }), false);
    }
    // Legacy evidence (a plain linux process) is still read, on the place that holds it.
    const legacy = sessions(root, { host: 'claude' });
    legacy.load({ name: 'demo', conversation_id: 'legacy' });
    const place = legacy.connection('legacy').branch;
    fs.writeFileSync(path.join(root, '.head/state/activity/claude-legacy.json'), JSON.stringify({ conversation_id: 'legacy', status: 'waiting', process: evidence && { pid: evidence.pid, start: evidence.start, platform: 'linux' } }));
    assert.equal(board(root)[0].branches.find(w => w.name === place).status, evidence ? 'waiting' : 'stopped');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('OpenCode V1 admission, MCP ID injection, permission/question and native child events', async () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'context-opencode-'));
  const previous = [process.env.HEAD_CONTEXT_SESSION, process.env.HEAD_CONTEXT_WORK];
  try {
    sessions(root, { host: 'seed' }).create({ name: 'demo', context: 'DIRECTION', conversation_id: 'seed' });
    process.env.HEAD_CONTEXT_SESSION = 'demo'; process.env.HEAD_CONTEXT_WORK = 'B';
    const hooks = await opencode.server({ directory: root, client: { session: { get: async ({ path }) => ({ data: { id: path.id, parentID: path.id === 'ses_child' ? 'ses_root' : undefined } }) } } });
    await hooks['chat.message']({ sessionID: 'ses_root' });
    const system = { system: [] };
    await hooks['experimental.chat.system.transform']({ sessionID: 'ses_root' }, system);
    assert.match(system.system.join('\n'), /DIRECTION/);
    const args = { summary: 'B saved', history: 'body', next: 'cursor', conversation_id: 'forged' };
    await hooks['tool.execute.before']({ tool: 'head_context_session_save', sessionID: 'ses_root' }, { args });
    assert.equal(args.conversation_id, 'ses_root');
    callTool(sessions(root, { host: 'opencode' }), 'session_save', args, args.conversation_id);
    const event = (type, properties) => hooks.event({ event: { type, properties } });
    const placeOf = () => { const data = board(root)[0]; return data.branches.find(b => b.conversations.some(c => c.host === 'opencode')); };
    await event('permission.asked', { sessionID: 'ses_root', id: 'p' });
    assert.equal(placeOf().status, 'waiting');
    await event('permission.replied', { sessionID: 'ses_root', requestID: 'p' });
    await event('question.asked', { sessionID: 'ses_root', id: 'q' });
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.head/state/activity/opencode-ses_root.json'))).status, 'blocked');
    await event('question.rejected', { sessionID: 'ses_root', id: 'q' });
    await event('session.created', { info: { id: 'ses_child', parentID: 'ses_root', title: 'native child' } });
    await event('session.status', { sessionID: 'ses_child', status: { type: 'busy' } });
    assert.equal(placeOf().conversations.find(c=>c.host==='opencode').running_subtasks, 1);
    await event('session.status', { sessionID: 'ses_child', status: { type: 'idle' } });
    assert.equal(placeOf().conversations.find(c=>c.host==='opencode').running_subtasks, 0);
    await event('session.status', { sessionID: 'ses_root', status: { type: 'idle' } });
    assert.equal(placeOf().status, 'waiting');
    const name = placeOf().name;
    await hooks.dispose();
    assert.equal(board(root)[0].branches.find(b => b.name === name)?.status || 'stopped', 'stopped');
  } finally {
    for (const [i, key] of ['HEAD_CONTEXT_SESSION', 'HEAD_CONTEXT_WORK'].entries()) if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
    fs.rmSync(root, { recursive: true, force: true });
  }
});
