import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { sessions } from '../core/sessions.mjs';
import { setupTool, CORE_SOURCE } from '../core/project.mjs';
import { compactInstruction } from '../hosts/claude/compact.mjs';
import { SUBAGENT_NOTICE } from '../core/mcp.mjs';
import { checkpointOf, steps, recentPart } from '../hosts/antigravity/transcript.mjs';
import { callerOf } from '../hosts/antigravity/register.mjs';
import { queue, readPresence, writePresence, antigravityLive } from '../hosts/antigravity/threads.mjs';
import { take as takeCodex } from '../hosts/codex/threads.mjs';
import { register as registerClaudeSend } from '../hooks/conversations.mjs';
import { locations } from '../core/storage.mjs';
import { agyOwner } from '../hosts/antigravity/process.mjs';
import { processBirth } from '../core/platform.mjs';
import { antigravityPeer } from '../hosts/antigravity/peer.mjs';
import { claudeTree } from '../hosts/claude/tree.mjs';
import { keyDir, keyFile, lockFile, writeKey, holdsLock } from '../hosts/antigravity/wake-key.mjs';
import { registerCommand } from '../hosts/antigravity/wake-command.mjs';
import { decide } from '../hosts/antigravity/pretool.mjs';

const fresh = () => fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir(), 'agy-'));
const PARENT = '3330a406-49c4-47c8-9be3-c6daf8e2a838';
const message = (sender = PARENT, messageTitle = 'Message from Parent Agent', recipient = 'c1') => ({
  id: 'message-1', recipient, sender, priority: 'MESSAGE_PRIORITY_HIGH',
  timestamp: '2026-11-23T04:23:40.747013683Z', renderDetails: { messageTitle }, content: 'Do this task',
});
const brain = (id, messages) => {
  const dir = path.join(fresh(), 'brain', id);
  const folder = path.join(dir, '.system_generated/messages');
  fs.mkdirSync(folder, { recursive: true });
  messages.forEach((m, n) => fs.writeFileSync(path.join(folder, `${n}.json`), JSON.stringify(m)));
  return dir;
};
test('Antigravity send: owner ACP HTTP only, signal has no payload; failure/non-ACP/dead owners stay queued', async () => {
  const dir = fresh();
  const presence = path.join(locations(dir).state, 'presence');
  const logs = path.join(os.homedir(), '.gemini/antigravity-cli/log');
  fs.mkdirSync(presence, { recursive: true });
  fs.mkdirSync(logs, { recursive: true });
  const requests = [];
  const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'acp']);
  await once(owner, 'spawn');
  let status = 200;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, body: JSON.parse(body) });
    res.writeHead(status).end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const log = path.join(logs, `acp-server-20261120_120000-${owner.pid}.log`);
  const put = (identity) => fs.writeFileSync(path.join(presence, 'antigravity-target.json'), JSON.stringify(identity));
  const send = () => antigravityPeer.send('antigravity:target', 'SECRET_PAYLOAD', { project: dir, from: 'claude:sender' });
  const inbox = path.join(locations(dir).state, 'inbox/antigravity-target');
  try {
    put({ pid: owner.pid, start: processBirth(owner.pid) });
    // An unrelated ACP log must never substitute for this owner's missing log.
    fs.writeFileSync(path.join(logs, 'acp-server-20261120_120000-99999999.log'), `Language server listening on random port at ${server.address().port} for HTTP\n`);
    assert.equal(await send(), 'queued');
    assert.equal(requests.length, 0);
    fs.writeFileSync(log, `Language server listening on random port at 1 for HTTPS (gRPC)\n`);
    assert.equal(await send(), 'queued');
    assert.equal(requests.length, 0);
    fs.appendFileSync(log, `Language server listening on random port at ${server.address().port} for HTTP\n`);
    assert.equal(await send(), 'started');
    assert.deepEqual(requests[0], {
      url: '/exa.language_server_pb.LanguageServerService/SendAgentMessage',
      body: { recipient: 'target', content: '다른 대화에서 메시지가 도착했습니다.', senderId: 'head-context' },
    });
    assert.equal(fs.readdirSync(inbox).filter((f) => f.endsWith('.json')).length, 3);
    status = 401;
    assert.equal(await send(), 'queued');
    put({ pid: owner.pid, start: 'reused' });
    assert.equal(await send(), 'queued');
    put({});
    assert.equal(await send(), 'queued');
    assert.equal(requests.length, 2);
    assert.equal(fs.readdirSync(inbox).filter((f) => f.endsWith('.json')).length, 6);
    // Even an old ACP log for this live non-ACP pid must not signal it.
    const oldLog = path.join(logs, `acp-server-20261120_120000-${process.pid}.log`);
    fs.copyFileSync(log, oldLog);
    put({ pid: process.pid });
    assert.equal(await send(), 'queued');
    assert.equal(requests.length, 2);
    fs.unlinkSync(oldLog);
    put({ pid: owner.pid });
    await new Promise((resolve) => server.close(resolve));
    assert.equal(await send(), 'queued');
  } finally {
    server.close();
    owner.kill();
    fs.rmSync(log, { force: true });
  }
});
const hook = (dir, data, input = {}, env = {}, error = false) => {
  const r = spawnSync(process.execPath, ['scripts/antigravity-hook.mjs'], {
    input: JSON.stringify({
      conversationId: 'c1',
      cwd: dir,
      hookEventName: 'PreInvocation',
      invocationNum: 0,
      ...input,
    }),
    env: { ...process.env, PLUGIN_DATA: data, ...env },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  if (error) assert.match(r.stderr, /^head-context: .+\n$/);
  else assert.equal(r.stderr, '');
  return r.stdout ? JSON.parse(r.stdout).injectSteps.map((s) => s.systemMessage.systemMessage) : [];
};
test('Antigravity owner: walk past the hook shell; missing start uses pid only; never adopt an unrelated ancestor', () => {
  const table = new Map([
    [30, { argv: ['sh', '-c', 'node hook.mjs'], ppid: 20 }],
    [20, { argv: ['/opt/tools/agy', 'acp'], ppid: 10 }],
  ]);
  assert.deepEqual(
    agyOwner(
      30,
      (pid) => table.get(pid),
      () => '123',
    ),
    { pid: 20, start: '123' },
  );
  assert.deepEqual(
    agyOwner(
      30,
      (pid) => table.get(pid),
      () => null,
    ),
    { pid: 20 },
  );
  table.set(20, { argv: ['node', 'unrelated.mjs'], ppid: 10 });
  assert.deepEqual(
    agyOwner(30, (pid) => table.get(pid)),
    {},
  );
});
test('Antigravity lists: shared owner, close removes only one, process exit removes the other; legacy and reused pid excluded, no age cutoff', async () => {
  const dir = fresh(),
    presence = path.join(locations(dir).state, 'presence');
  fs.mkdirSync(presence, { recursive: true });
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  await once(child, 'spawn');
  const file = (id) => path.join(presence, `antigravity-${id}.json`);
  const put = (id, identity) =>
    fs.writeFileSync(
      file(id),
      JSON.stringify({
        host: 'antigravity',
        conversation_id: id,
        at: '2000-01-01T00:00:00Z',
        ...identity,
      }),
    );
  try {
    const start = processBirth(child.pid);
    put('one', { pid: child.pid, ...(start ? { start } : {}) });
    put('two', { pid: child.pid });
    put('legacy', {});
    put('reused', { pid: child.pid, start: 'different-process' });
    const ids = () =>
      antigravityPeer
        .live(dir)
        .map((p) => p.conversation_id)
        .sort();
    assert.deepEqual(ids(), ['one', 'two']);
    for (const host of ['claude', 'codex', 'antigravity']) {
      const out = sessions(dir, {
        host,
        peers: [{ host: 'antigravity', live: (known) => antigravityPeer.live(dir, known) }],
      }).conversations();
      assert.match(out, /antigravity:one/);
      assert.match(out, /antigravity:one · antigravity/);
      assert.match(out, /antigravity:two/);
      assert.doesNotMatch(out, /antigravity:(legacy|reused)/);
    }
    assert.equal(claudeTree(dir).loose.filter((p) => p.host === 'antigravity').length, 2);
    fs.unlinkSync(file('one'));
    assert.deepEqual(ids(), ['two']);
    child.kill();
    await once(child, 'exit');
    assert.deepEqual(ids(), []);
    assert.equal(claudeTree(dir).loose.filter((p) => p.host === 'antigravity').length, 0);
    assert.ok(fs.existsSync(file('legacy')));
  } finally {
    child.kill();
  }
});
test('Antigravity start file: same head/context and connection as env, per conversation, optional branch via load', () => {
  const dir = fresh(),
    data = fresh();
  const store = sessions(dir, { host: 'antigravity' });
  store.create({ name: 'demo', context: 'START PURPOSE', conversation_id: 'seed' });
  store.branch({ action: 'create', branch: 'proof', conversation_id: 'seed' });
  store.save({ summary: 'saved', history: 'START HISTORY', next: 'START NEXT', conversation_id: 'seed' });
  const startDir = path.join(locations(dir).state, 'start');
  fs.mkdirSync(startDir, { recursive: true });
  const file = path.join(startDir, 'antigravity-c1.json');
  fs.writeFileSync(file, JSON.stringify({ session: 'demo' }));
  // PreInvocation must not consume the request.
  hook(dir, data);
  assert.ok(fs.existsSync(file));
  const input = { hookEventName: 'SessionStart' };
  const fromFile = hook(dir, data, input);
  assert.ok(!fs.existsSync(file));
  const fromEnv = hook(dir, data, { ...input, conversationId: 'env' }, { HEAD_CONTEXT_SESSION: 'demo' });
  assert.deepEqual(fromFile, fromEnv);
  const { bound_at: fileAt, ...fileConnection } = store.connection('c1');
  const { bound_at: envAt, ...envConnection } = store.connection('env');
  assert.ok(fileAt && envAt);
  assert.deepEqual(fileConnection, { ...envConnection, conversation_id: 'c1' });
  assert.match(fromFile.join('\n'), /START PURPOSE/);
  assert.match(hook(dir, data, { ...input, conversationId: 'unbound' }).join('\n'), /연결되지 않았습니다/);
  fs.writeFileSync(file, JSON.stringify({ session: 'demo', branch: 'proof' }));
  const branched = hook(dir, data, input).join('\n');
  assert.match(branched, /START HISTORY/);
  assert.match(branched, /START NEXT/);
  assert.equal(store.connection('c1').branch, 'proof');
  // Env wins even over a malformed request, and the overridden file is removed.
  fs.writeFileSync(file, 'broken');
  hook(dir, data, input, { HEAD_CONTEXT_SESSION: 'demo' });
  assert.ok(!fs.existsSync(file));
});
test('Antigravity start file: bad requests notify once and are consumed; only stale Antigravity requests are pruned', () => {
  const dir = fresh(),
    data = fresh();
  const startDir = path.join(locations(dir).state, 'start');
  fs.mkdirSync(startDir, { recursive: true });
  const file = path.join(startDir, 'antigravity-c1.json');
  for (const request of ['broken', '{}', '{"session":"missing"}', '{"session":"missing","branch":42}']) {
    fs.writeFileSync(file, request);
    const out = hook(dir, data, { hookEventName: 'SessionStart' }, {}, true);
    assert.equal(out.length, 1);
    assert.match(out[0], /^head-context: 작업 맥락을 넣지 못했습니다: .+$/);
    assert.ok(!fs.existsSync(file));
  }
  for (const name of ['antigravity-old.json', 'claude-old.json', 'antigravity-fresh.json']) {
    const old = path.join(startDir, name);
    fs.writeFileSync(old, '{}');
    if (!name.includes('fresh')) fs.utimesSync(old, new Date(0), new Date(0));
  }
  hook(dir, data, { hookEventName: 'SessionStart' });
  assert.ok(!fs.existsSync(path.join(startDir, 'antigravity-old.json')));
  assert.ok(fs.existsSync(path.join(startDir, 'claude-old.json')));
  assert.ok(fs.existsSync(path.join(startDir, 'antigravity-fresh.json')));
});
test('Antigravity hook: camelCase -> injectSteps, consent, registration; ordinary invocations/resume add nothing; inbox once even mid-turn', () => {
  const dir = fresh(),
    data = fresh();
  const first = hook(dir, data, { hookEventName: 'SessionStart' });
  assert.equal(first.filter((s) => s.startsWith('# HEAD Core')).length, 0);
  assert.equal(first.filter((s) => s.includes('초기설정 해도 될까요?')).length, 1);
  assert.equal(first.filter((s) => s.includes('연결되지 않았습니다')).length, 1);
  assert.equal(first.filter((s) => s.startsWith('일을 시작할 때는 먼저')).length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'conversations/c1.json'))).cwd, dir);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(data, 'conversations/c1.json')))).sort(), ['checkpoint', 'cwd', 'parent']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'conversations/c1.json'))).parent, null);
  assert.deepEqual(hook(dir, data), []);
  setupTool(dir, { action: 'setup' }, { host: 'antigravity' });
  assert.ok(
    hook(dir, data, { hookEventName: 'SessionStart' }).includes(fs.readFileSync(CORE_SOURCE, 'utf8').trimEnd()),
  );
  queue(dir, 'c1', { from: 'claude:other', text: 'INBOX_SENTINEL' });
  assert.match(hook(dir, data, { invocationNum: 1 }).join('\n'), /INBOX_SENTINEL/);
  assert.deepEqual(hook(dir, data, { invocationNum: 2 }), []);
  assert.deepEqual(hook(dir, data), []);
  assert.equal(readPresence(dir, 'c1').host, 'antigravity');
});
test('Antigravity: /compact instruction and new CHECKPOINT recovery once, across hook processes; new input not mistaken for pre-cut exchange', () => {
  const dir = fresh(),
    data = fresh(),
    file = path.join(dir, 'transcript.jsonl');
  setupTool(dir, { action: 'setup' }, { host: 'antigravity' });
  const store = sessions(dir, { host: 'antigravity' });
  store.create({ name: 'demo', context: 'AGY PURPOSE', conversation_id: 'c1' });
  store.branch({ action: 'create', branch: 'proof', conversation_id: 'c1' });
  store.save({ summary: 'saved', history: 'saved body', next: 'continue', conversation_id: 'c1' });
  const rows = [];
  const row = (type, content, source = 'SYSTEM') => ({
    step_index: rows.length,
    type,
    content,
    source,
    status: 'DONE',
    created_at: '2026-11-20T10:00:00Z',
  });
  for (let i = 0; i < 6; i++) {
    rows.push(
      row(
        'USER_INPUT',
        `<USER_REQUEST>\nuser ${i}\n</USER_REQUEST>\n<ADDITIONAL_METADATA>secret</ADDITIONAL_METADATA>`,
        'USER_EXPLICIT',
      ),
    );
    rows.push(row('SYSTEM_MESSAGE', 'hidden hook'));
    rows.push(row('PLANNER_RESPONSE', `model ${i}`, 'MODEL'));
  }
  fs.writeFileSync(file, rows.map(JSON.stringify).join('\n') + '\n');
  hook(dir, data, { hookEventName: 'SessionStart', transcriptPath: file });
  assert.deepEqual(hook(dir, data, { transcriptPath: file, lastUserInput: '/compact' }), [compactInstruction()]);
  rows.push(row('CHECKPOINT', '# Resuming from a compaction'));
  const checkpoint = checkpointOf(rows);
  rows.push(row('USER_INPUT', '<USER_REQUEST>\nafter cut\n</USER_REQUEST>', 'USER_EXPLICIT'));
  fs.writeFileSync(file, rows.map(JSON.stringify).join('\n') + '\n{"partial":');
  assert.equal(checkpointOf(steps(file)), checkpoint);
  const recovered = hook(dir, data, { transcriptPath: file }).join('\n\n');
  assert.match(recovered, /# HEAD Core/);
  assert.match(recovered, /AGY PURPOSE/);
  assert.match(recovered, /saved body/);
  assert.match(recovered, /직전 주고받기 5번/);
  assert.match(recovered, /user 1[\s\S]*model 5/);
  assert.doesNotMatch(recovered, /user 0|after cut|hidden hook|secret/);
  assert.deepEqual(hook(dir, data, { transcriptPath: file }), []);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'conversations/c1.json'))).checkpoint, checkpoint);
  assert.ok(recentPart(rows, file, { budget: 400 }).length < 700);
});
test('Antigravity MCP: authoritative meta, registration, shared records and child read-only', () => {
  const dir = fresh(),
    data = fresh();
  hook(dir, data, { hookEventName: 'SessionStart' });
  const run = (meta, name, args) => {
    const r = spawnSync(process.execPath, ['scripts/antigravity-mcp.mjs'], {
      input:
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { _meta: meta, name, arguments: args },
        }) + '\n',
      encoding: 'utf8',
      env: { ...process.env, PLUGIN_DATA: data },
    });
    return JSON.parse(r.stdout).result;
  };
  const meta = { 'antigravity.google/conversation_id': 'c1', 'antigravity.google/root_conversation_id': 'c1' };
  assert.equal(run(meta, 'create', { name: 'proof', context: 'AGY MCP' }).isError, undefined);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, '.head/state/conversations/antigravity-c1.json'))).host,
    'antigravity',
  );
  assert.match(sessions(dir, { host: 'claude' }).inspect({ action: 'overview', name: 'proof' }), /AGY MCP/);
  const child = { ...meta, 'antigravity.google/conversation_id': 'child' };
  assert.deepEqual(callerOf({ params: { _meta: child } }), { conversation: 'c1', agent: 'child' });
  assert.equal(run(child, 'save', { summary: 'forbidden', history: 'no' }).isError, true);
  assert.equal(run(child, 'read', { action: 'overview', name: 'proof' }).isError, undefined);
  assert.equal(run({}, 'list', {}).isError, true);
});
test('Claude sends Antigravity addresses through its relay; non-ACP owner queued and delivered once next invocation', async () => {
  const dir = fresh(),
    data = fresh();
  hook(dir, data, { hookEventName: 'SessionStart' });
  let send;
  registerClaudeSend((_event, fn) => {
    send = fn;
    return { catch() {} };
  });
  const $ = {
    plugin: { root: process.cwd() },
    session: { root: async () => dir, id: async () => 'claude-proof' },
    process: {
      run: async (args, options) => {
        const r = spawnSync(args[0], args.slice(1), { input: options.stdin, encoding: 'utf8' });
        return { stdout: r.stdout, stderr: r.stderr };
      },
    },
  };
  assert.deepEqual(await send($, { to: 'antigravity:c1', text: 'CLAUDE_TO_AGY' }, () => assert.fail('native send')), {
    isDelivered: true,
  });
  assert.match(hook(dir, data).join('\n'), /CLAUDE_TO_AGY/);
  assert.deepEqual(hook(dir, data), []);
});
test('Antigravity inbox: all broken files are set aside without claims; unreadable inbox differs from Codex', () => {
  const dir = fresh(), data = fresh();
  queue(dir, 'c1', { from: 'claude:other', text: 'broken' });
  const inbox = path.join(locations(dir).state, 'inbox/antigravity-c1');
  const [name] = fs.readdirSync(inbox);
  fs.writeFileSync(path.join(inbox, name), '{broken');
  const broken = hook(dir, data);
  assert.equal(broken.length, 1);
  assert.match(broken[0], /^head-context: 읽을 수 없는 메시지를 따로 두었습니다: .+$/);
  assert.ok(!fs.readdirSync(inbox).some((f) => f.startsWith('.taking-')));
  assert.deepEqual(fs.readdirSync(path.join(inbox, '.broken')), [name]);
  if (process.getuid?.() === 0) return;
  fs.chmodSync(inbox, 0);
  try {
    const out = hook(dir, data, {}, {}, true);
    assert.equal(out.length, 1);
    assert.match(out[0], /^head-context: 작업 맥락을 넣지 못했습니다: [^\n]+$/);
    // Both hosts read the same blocked folder, addressed by their own prefix.
    fs.renameSync(inbox, path.join(locations(dir).state, 'inbox/codex-c1'));
    const { messages, broken } = takeCodex(dir, 'c1');
    assert.deepEqual({ messages, broken }, { messages: [], broken: [] });
  } finally {
    const codex = path.join(locations(dir).state, 'inbox/codex-c1');
    fs.chmodSync(fs.existsSync(codex) ? codex : inbox, 0o700);
  }
});

let subagent;
test('Antigravity subagent start', () => {
  const dir = fresh(), data = fresh(), artifactDirectoryPath = brain('c1', [message()]);
  setupTool(dir, { action: 'setup' }, { host: 'antigravity' });
  const store = sessions(dir, { host: 'antigravity' });
  store.create({ name: 'sub-task', context: 'SUB PURPOSE', conversation_id: 'seed' });
  const start = path.join(locations(dir).state, 'start');
  fs.mkdirSync(start, { recursive: true });
  const files = ['antigravity-other.json', 'antigravity-stale.json', 'antigravity-c1.json'];
  const body = JSON.stringify({ session: 'sub-task' });
  for (const name of files) fs.writeFileSync(path.join(start, name), body);
  const old = new Date(Date.now() - 2 * 86400000);
  fs.utimesSync(path.join(start, files[1]), old, old);
  const staleMtime = fs.statSync(path.join(start, files[1])).mtimeMs;
  assert.deepEqual(hook(dir, data, { hookEventName: 'SessionStart', artifactDirectoryPath }, { HEAD_CONTEXT_SESSION: 'sub-task' }), [SUBAGENT_NOTICE]);
  assert.equal(readPresence(dir, 'c1'), null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'conversations/c1.json'))).parent, PARENT);
  for (const name of files) assert.equal(fs.readFileSync(path.join(start, name), 'utf8'), body);
  assert.equal(fs.statSync(path.join(start, files[1])).mtimeMs, staleMtime);
  assert.ok(!store.locate({ conversation_id: 'c1' }));
  subagent = { dir, data, artifactDirectoryPath };
});
test('Antigravity subagent every invocation', () => {
  const { dir, data, artifactDirectoryPath } = subagent;
  const run = (input = {}) => {
    const out = hook(dir, data, { artifactDirectoryPath, ...input });
    assert.equal(readPresence(dir, 'c1'), null);
    return out;
  };
  assert.deepEqual(run({ lastUserInput: '/compact' }), []);
  queue(dir, 'c1', { from: 'claude:other', text: 'SUB_INBOX' });
  assert.equal(run().join('\n').split('SUB_INBOX').length - 1, 1);
  assert.deepEqual(run(), []);
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(transcriptPath, JSON.stringify({ step_index: 0, type: 'CHECKPOINT', content: '# Resuming from a compaction', source: 'SYSTEM', status: 'DONE', created_at: '2026-11-20T10:00:00Z' }) + '\n');
  assert.deepEqual(run({ transcriptPath }), [SUBAGENT_NOTICE]);
  assert.deepEqual(run({ transcriptPath }), []);
});
test('Antigravity 0.9.14 remnants', () => {
  const dir = fresh(), data = fresh();
  fs.mkdirSync(path.join(data, 'conversations'));
  fs.writeFileSync(path.join(data, 'conversations/c1.json'), JSON.stringify({ cwd: dir, checkpoint: null }));
  writePresence(dir, { conversation_id: 'c1' });
  assert.deepEqual(hook(dir, data, { artifactDirectoryPath: brain('c1', [message()]) }), []);
  assert.equal(readPresence(dir, 'c1'), null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'conversations/c1.json'))).parent, PARENT);
});
test('Antigravity prevent misclassification', () => {
  const cases = [
    () => ({}),
    () => { const dir = brain('c1', []); fs.rmdirSync(path.join(dir, '.system_generated/messages')); return { artifactDirectoryPath: dir }; },
    () => ({ artifactDirectoryPath: brain('c1', [message('c1/task-1', 'Background task finished')]) }),
    () => ({ artifactDirectoryPath: brain('c1', [message(PARENT, 'Message from Data Analyst (self)')]) }),
    () => ({ artifactDirectoryPath: brain('c1', ['system', 'user'].map((sender) => ({ ...message(sender), renderDetails: {} }))) }),
    () => ({ conversationId: PARENT, artifactDirectoryPath: brain(PARENT, [message(PARENT, 'Message from Parent Agent', PARENT)]) }),
    () => ({ artifactDirectoryPath: brain('other', [message()]) }),
    () => { const dir = brain('c1', []); fs.writeFileSync(path.join(dir, '.system_generated/messages/0.json'), '{broken'); return { artifactDirectoryPath: dir }; },
  ];
  if (process.getuid?.() !== 0) cases.push(() => {
    const dir = brain('c1', [message()]);
    fs.chmodSync(path.join(dir, '.system_generated/messages'), 0);
    return { artifactDirectoryPath: dir };
  });
  for (const make of cases) {
    const dir = fresh(), data = fresh(), input = make();
    try {
      const out = hook(dir, data, { hookEventName: 'SessionStart', ...input });
      assert.ok(!out.includes(SUBAGENT_NOTICE));
      assert.equal(out.filter((s) => s.startsWith('일을 시작할 때는 먼저')).length, 1);
      assert.equal(out.filter((s) => s.includes('연결되지 않았습니다')).length, 1);
      const id = input.conversationId || 'c1';
      assert.ok(readPresence(dir, id));
      assert.equal(JSON.parse(fs.readFileSync(path.join(data, `conversations/${id}.json`))).parent, null);
    } finally {
      if (input.artifactDirectoryPath) {
        const folder = path.join(input.artifactDirectoryPath, '.system_generated/messages');
        if (fs.existsSync(folder)) fs.chmodSync(folder, 0o700);
      }
    }
  }
});
test('Antigravity a classified human conversation is not checked again', () => {
  const dir = fresh(), data = fresh(), artifactDirectoryPath = brain('c1', []);
  hook(dir, data, { hookEventName: 'SessionStart', artifactDirectoryPath });
  fs.writeFileSync(path.join(artifactDirectoryPath, '.system_generated/messages/0.json'), JSON.stringify(message()));
  assert.deepEqual(hook(dir, data, { artifactDirectoryPath }), []);
  assert.ok(readPresence(dir, 'c1'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'conversations/c1.json'))).parent, null);
});
test('Antigravity old Node', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  for (const child of [true, false]) {
    const dir = fresh(), data = fresh();
    const r = spawnSync(process.execPath, ['--require', path.join(here, 'fixtures/no-sqlite.cjs'), path.join(here, 'antigravity-hook.mjs')], {
      input: JSON.stringify({ conversationId: 'c1', cwd: dir, hookEventName: 'SessionStart', artifactDirectoryPath: brain('c1', child ? [message()] : []) }),
      env: { ...process.env, PLUGIN_DATA: data }, encoding: 'utf8',
    });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
    const out = JSON.parse(r.stdout).injectSteps.map((s) => s.systemMessage.systemMessage);
    if (child) assert.deepEqual(out, [SUBAGENT_NOTICE]);
    assert.equal(out.some((s) => /^head-context는 node:sqlite를 쓸 수 있는 Node/.test(s)), !child);
  }
});
test('Antigravity excluded from lists', () => {
  const dir = fresh(), data = fresh(), presence = path.join(locations(dir).state, 'presence');
  fs.mkdirSync(presence, { recursive: true });
  for (const id of [PARENT, 'c1']) fs.writeFileSync(path.join(presence, `antigravity-${id}.json`), JSON.stringify({
    host: 'antigravity', conversation_id: id, cwd: dir, pid: process.pid, start: processBirth(process.pid), at: new Date().toISOString(),
  }));
  assert.deepEqual(hook(dir, data, { artifactDirectoryPath: brain('c1', [message()]) }), []);
  assert.deepEqual(antigravityLive(dir).map((p) => p.conversation_id), [PARENT]);
});

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const REGISTER = path.join(ROOT, 'scripts/antigravity-wake-register.mjs');
const PRETOOL = path.join(ROOT, 'scripts/antigravity-pretool.mjs');
const ASK = `head-context 깨우기 등록: 이 agy 프로세스는 아직 등록되지 않아, 다른 대화가 보낸 메시지로 이 대화를 깨울 수 없습니다. 사용자 물음에 답하기 전에 run_command로 아래 명령을 글자 그대로 한 번만 실행하세요. 인자를 붙이거나 따옴표·경로를 고치지 마세요. 출력은 한 줄이며 사용자에게 따로 설명하지 않아도 됩니다. 실행하지 못했거나 거절되면 다시 시도하지 말고 사용자 물음에 답하세요.
${registerCommand(ROOT)}`;
const TEST_TOKEN = 'TEST-TOKEN-0918';
const clearKeys = () => fs.rmSync(keyDir(), { recursive: true, force: true });
const keyNames = () => fs.existsSync(keyDir()) ? fs.readdirSync(keyDir()) : [];
const keyValues = () => keyNames().filter((n) => n.endsWith('.json')).map((n) => JSON.parse(fs.readFileSync(path.join(keyDir(), n), 'utf8')));
const payload = (dir, input = {}) => JSON.stringify({ conversationId: 'c1', cwd: dir, hookEventName: 'PreInvocation', invocationNum: 0, ...input });
const partsOf = (text) => text.trim() ? JSON.parse(text).injectSteps.map((s) => s.systemMessage.systemMessage) : [];
function fakeAgy(args = []) {
  const dir = fresh(), bin = path.join(dir, 'bin'), file = path.join(bin, 'agy');
  fs.mkdirSync(bin);
  const body = '"$FAKE_AGY_NODE" "$FAKE_AGY_SCRIPT"';
  const script = (commands = body) => fs.writeFileSync(file, `#!/bin/sh\n${commands}\nstatus=$?\nexit $status\n`, { mode: 0o755 });
  script();
  return {
    dir, script,
    run(input, env = {}) {
      return spawnSync(file, args, {
        input, encoding: 'utf8',
        env: { ...process.env, FAKE_AGY_NODE: process.execPath, FAKE_AGY_SCRIPT: path.join(ROOT, 'scripts/antigravity-hook.mjs'), PLUGIN_DATA: fresh(), PLUGIN_ROOT: ROOT, ...env },
      });
    },
  };
}
const cleanResult = (r) => {
  assert.equal(r.status, 0);
  assert.ok(r.stderr === '', 'stderr is empty');
  assert.ok(!r.stdout.includes(TEST_TOKEN) && !r.stderr.includes(TEST_TOKEN), 'no key in output');
};
function hookPair(fake, dir, first = {}, second = {}, concurrent = false) {
  for (const [name, input] of [['one', first], ['two', second]])
    fs.writeFileSync(path.join(fake.dir, name), payload(dir, input));
  fake.script(`"$FAKE_AGY_NODE" "$FAKE_AGY_SCRIPT" < "${fake.dir}/one" > "${fake.dir}/out-one"${concurrent ? ' &' : ''}\n"$FAKE_AGY_NODE" "$FAKE_AGY_SCRIPT" < "${fake.dir}/two" > "${fake.dir}/out-two"${concurrent ? ' &\nwait' : ''}`);
  const r = fake.run('');
  cleanResult(r);
  return ['one', 'two'].map((name) => partsOf(fs.readFileSync(path.join(fake.dir, `out-${name}`), 'utf8')));
}
function holder(lockPath, args = [], open = true) {
  return spawn(process.execPath, ['-e', `const fs=require('fs');fs.mkdirSync(require('path').dirname(process.argv[1]),{recursive:true});${open ? "fs.closeSync(fs.openSync(process.argv[1],'a'));const fd=fs.openSync(process.argv[1],'r');" : ''}process.stdout.write('ready');setInterval(()=>{},1000)`, lockPath, ...args]);
}

test('Ask once per terminal agy process', () => {
  clearKeys();
  const dir = fresh(), fake = fakeAgy();
  setupTool(dir, { action: 'setup' }, { host: 'antigravity' });
  const [first, second] = hookPair(fake, dir, {}, { conversationId: 'c2' });
  assert.equal(first.at(-1), ASK);
  assert.ok(!second.includes(ASK));
  const [record] = keyValues();
  assert.equal(keyNames().length, 1);
  assert.match(keyNames()[0], new RegExp(`^${record.pid}-[a-f0-9]{16}\\.json$`));
  assert.deepEqual(Object.keys(record), ['pid', 'start', 'asked_at']);
  assert.ok(record.start && record.asked_at);
  assert.equal(record.pid, readPresence(dir, 'c1').pid);
  assert.equal(record.pid, readPresence(dir, 'c2').pid);
  assert.equal(fs.statSync(keyFile(record)).mode & 0o777, 0o600);
  assert.equal(fs.statSync(keyDir()).mode & 0o777, 0o700);
});
test('Concurrent asks', () => {
  clearKeys();
  const dir = fresh();
  setupTool(dir, { action: 'setup' }, { host: 'antigravity' });
  const outputs = hookPair(fakeAgy(), dir, {}, { conversationId: 'c2' }, true);
  assert.equal(outputs.filter((p) => p.includes(ASK)).length, 1);
});
test('No ask', () => {
  const cases = [
    ...['acp', '-p', '--print', '--prompt=hi', '--remote-agent'].map((arg) => ({ args: [arg] })),
    { input: { artifactDirectoryPath: brain('c1', [message()]) } },
    { env: { PLUGIN_ROOT: undefined } }, { env: { PLUGIN_ROOT: '/tmp/"root' } },
    { input: { hookEventName: 'SessionStart' } },
  ];
  for (const { args = [], input = {}, env = {} } of cases) {
    clearKeys();
    const r = fakeAgy(args).run(payload(fresh(), input), env);
    cleanResult(r);
    assert.ok(!partsOf(r.stdout).includes(ASK));
    assert.deepEqual(keyNames(), []);
  }
  clearKeys();
  assert.ok(!hook(fresh(), fresh(), {}, { PLUGIN_ROOT: ROOT }).includes(ASK));
  assert.deepEqual(keyNames(), []);
  const [compact, next] = hookPair(fakeAgy(), fresh(), { lastUserInput: '/compact' }, { lastUserInput: 'hi' });
  assert.ok(!compact.includes(ASK));
  assert.ok(next.includes(ASK));
});
test('Prune at ask time', () => {
  clearKeys();
  fs.mkdirSync(keyDir(), { recursive: true });
  const dead = spawnSync(process.execPath, ['-e', '']);
  const owners = [{ pid: dead.pid, start: 'dead' }, { pid: process.pid, start: 'other' }, { pid: process.pid, start: processBirth(process.pid) }];
  for (const owner of owners) fs.writeFileSync(keyFile(owner), JSON.stringify(owner));
  for (const name of ['x.tmp', 'y.tmp']) fs.writeFileSync(path.join(keyDir(), name), '');
  const old = new Date(Date.now() - 7200000);
  fs.utimesSync(path.join(keyDir(), 'x.tmp'), old, old);
  const r = fakeAgy().run(payload(fresh()));
  cleanResult(r);
  assert.ok(partsOf(r.stdout).includes(ASK));
  assert.ok(!fs.existsSync(keyFile(owners[0])) && !fs.existsSync(keyFile(owners[1])));
  assert.ok(fs.existsSync(keyFile(owners[2])));
  assert.ok(!fs.existsSync(path.join(keyDir(), 'x.tmp')));
  assert.ok(fs.existsSync(path.join(keyDir(), 'y.tmp')));
  assert.equal(keyNames().length, 3);
});
test('Register command', () => {
  const env = { FAKE_AGY_SCRIPT: REGISTER, ANTIGRAVITY_LS_ADDRESS: 'localhost:4567', ANTIGRAVITY_CSRF_TOKEN: TEST_TOKEN };
  for (const token of [TEST_TOKEN, '']) {
    clearKeys();
    const r = fakeAgy().run('', { ...env, ANTIGRAVITY_CSRF_TOKEN: token });
    cleanResult(r);
    assert.equal(r.stdout, 'head-context: 깨우기 등록됨\n');
    const [record] = keyValues();
    assert.deepEqual(Object.keys(record), ['pid', 'start', 'address', 'token', 'registered_at']);
    assert.ok(record.token === token, 'recorded key matches');
    assert.equal(record.address, 'localhost:4567');
    assert.equal(fs.statSync(keyFile(record)).mode & 0o777, 0o600);
  }
  clearKeys();
  const fake = fakeAgy();
  fake.script(`"$FAKE_AGY_NODE" "${ROOT}/scripts/antigravity-hook.mjs"\ncp "${keyDir()}"/*.json "${fake.dir}/asked.json"\n"$FAKE_AGY_NODE" "$FAKE_AGY_SCRIPT"`);
  const asked = fake.run(payload(fresh()), env);
  cleanResult(asked);
  const [record] = keyValues();
  assert.deepEqual(Object.keys(record), ['pid', 'start', 'asked_at', 'address', 'token', 'registered_at']);
  assert.equal(record.asked_at, JSON.parse(fs.readFileSync(path.join(fake.dir, 'asked.json'), 'utf8')).asked_at);
  assert.ok(partsOf(asked.stdout.slice(0, asked.stdout.indexOf('\n'))).includes(ASK));
  assert.ok(asked.stdout.endsWith('head-context: 깨우기 등록됨\n'));
  const failures = [
    [{ ANTIGRAVITY_LS_ADDRESS: undefined, ANTIGRAVITY_CSRF_TOKEN: undefined }, 'agy가 깨울 주소를 넘기지 않았습니다.'],
    ...['10.0.0.1:1', 'localhost:0', 'localhost:99999'].map((address) => [{ ANTIGRAVITY_LS_ADDRESS: address }, 'agy가 넘긴 주소를 쓸 수 없습니다.']),
  ];
  for (const [extra, reason] of failures) {
    clearKeys();
    const r = fakeAgy().run('', { ...env, ...extra });
    cleanResult(r);
    assert.equal(r.stdout, `head-context: 깨우기 등록 안 됨 — ${reason}\n`);
    assert.deepEqual(keyNames(), []);
  }
  const absent = spawnSync(process.execPath, [REGISTER], { encoding: 'utf8', env: { ...process.env, ...env } });
  cleanResult(absent);
  assert.equal(absent.stdout, 'head-context: 깨우기 등록 안 됨 — agy 프로세스를 찾지 못했습니다.\n');
  assert.deepEqual(keyNames(), []);
  fs.mkdirSync(path.dirname(keyDir()), { recursive: true });
  fs.writeFileSync(keyDir(), 'unchanged');
  try {
    const r = fakeAgy().run('', env);
    cleanResult(r);
    assert.match(r.stdout, /^head-context: 깨우기 등록 안 됨 — 기록을 쓰지 못했습니다\([A-Za-z0-9_]+\)\.\n$/);
    assert.equal(fs.readFileSync(keyDir(), 'utf8'), 'unchanged');
  } finally { clearKeys(); }
});
test('PreToolUse decides', () => {
  const command = registerCommand(ROOT);
  const input = (CommandLine = command, name = 'run_command') => ({ toolCall: { name, args: { CommandLine } } });
  assert.deepEqual(decide(input(), { PLUGIN_ROOT: ROOT }), { decision: 'auto_approve', reason: 'head-context 깨우기 등록 명령' });
  for (const changed of [command + ' ', command.replaceAll('"', "'"), command + '; ls', 'cd /tmp && ' + command])
    assert.deepEqual(decide(input(changed), { PLUGIN_ROOT: ROOT }), { decision: 'allow' });
  assert.deepEqual(decide(input(command, 'view_file'), { PLUGIN_ROOT: ROOT }), { decision: 'allow' });
  for (const env of [{}, { PLUGIN_ROOT: 'relative' }]) assert.deepEqual(decide(input(), env), { decision: 'allow' });
  for (const stdin of [JSON.stringify(input()), '', 'not json', '{}']) {
    const r = spawnSync(process.execPath, [PRETOOL], { input: stdin, encoding: 'utf8', env: { ...process.env, PLUGIN_ROOT: ROOT } });
    cleanResult(r);
    assert.notEqual(r.stdout, '{}\n');
    if (stdin === JSON.stringify(input())) assert.equal(JSON.parse(r.stdout).decision, 'auto_approve');
    else assert.equal(r.stdout, '{"decision":"allow"}\n');
  }
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks.json'), 'utf8'));
  const entry = hooks['head-context-pretool'].PreToolUse[0];
  assert.equal(entry.matcher, 'run_command');
  assert.equal(entry.hooks[0].command, 'node "${PLUGIN_ROOT}/scripts/antigravity-pretool.mjs"');
  for (const [key, event] of [['head-context-start', 'SessionStart'], ['head-context-invocation', 'PreInvocation']])
    assert.deepEqual(hooks[key], { [event]: [{ type: 'command', command: 'node "${PLUGIN_ROOT}/scripts/antigravity-hook.mjs"', timeout: 20 }] });
});
test('Terminal wake', async () => {
  clearKeys();
  const dir = fresh(), presence = path.join(locations(dir).state, 'presence');
  fs.mkdirSync(presence, { recursive: true });
  const requests = [];
  let status = 200;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, token: req.headers['x-codeium-csrf-token'], body: JSON.parse(body) });
    res.writeHead(status).end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const owners = [];
  const startHolder = async (id, open = true) => {
    const child = holder(lockFile(id), [], open);
    owners.push(child);
    await once(child.stdout, 'data');
    return child;
  };
  const owner = await startHolder('target');
  const identity = (child = owner) => ({ pid: child.pid, start: processBirth(child.pid) });
  const address = `localhost:${server.address().port}`;
  const put = (value) => fs.writeFileSync(path.join(presence, 'antigravity-target.json'), JSON.stringify(value));
  const inbox = path.join(locations(dir).state, 'inbox/antigravity-target');
  let count = 0;
  const send = async (expected) => {
    assert.equal(await antigravityPeer.send('antigravity:target', 'PRIVATE_MESSAGE_BODY', { project: dir, from: 'claude:sender' }), expected);
    assert.equal(fs.readdirSync(inbox).filter((n) => n.endsWith('.json')).length, ++count);
  };
  const record = (child = owner, extra = {}) => writeKey(identity(child), { address, token: TEST_TOKEN, ...extra });
  try {
    put(identity()); record();
    assert.ok(holdsLock(owner.pid, 'target'));
    await send('started');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/exa.language_server_pb.LanguageServerService/SendAgentMessage');
    assert.ok(requests[0].token === TEST_TOKEN, 'request key matches');
    assert.deepEqual(requests[0].body, { recipient: 'target', content: '다른 대화에서 메시지가 도착했습니다.', senderId: 'head-context' });
    fs.rmSync(keyFile(identity()));
    await send('queued'); assert.equal(requests.length, 1);
    record();
    const file = keyFile(identity()), wrong = JSON.parse(fs.readFileSync(file, 'utf8'));
    wrong.start = 'other'; fs.writeFileSync(file, JSON.stringify(wrong));
    await send('queued'); assert.equal(requests.length, 1);
    record(owner, { token: '' });
    await send('queued'); assert.equal(requests.length, 1);
    record(owner, { address: `10.0.0.1:${server.address().port}` });
    await send('queued'); assert.equal(requests.length, 1);
    record(); fs.unlinkSync(lockFile('target'));
    await send('queued'); assert.equal(requests.length, 1);
    fs.writeFileSync(lockFile('target'), '');
    const unopened = await startHolder('target', false);
    put(identity(unopened)); record(unopened);
    await send('queued'); assert.equal(requests.length, 1);
    const other = await startHolder('other');
    put(identity(other)); record(other);
    await send('queued'); assert.equal(requests.length, 1);
    const current = await startHolder('target');
    put(identity(current)); record(current); status = 401;
    await send('queued'); assert.equal(requests.length, 2);
    current.kill(); await once(current, 'exit');
    await send('queued'); assert.equal(requests.length, 2);
  } finally {
    for (const child of owners) child.kill();
    await new Promise((resolve) => server.close(resolve));
    clearKeys();
  }
});
test('ACP path unchanged', async () => {
  const dir = fresh(), presence = path.join(locations(dir).state, 'presence');
  fs.mkdirSync(presence, { recursive: true });
  const owner = holder(lockFile('acp-target'), ['acp']);
  await once(owner.stdout, 'data');
  const requests = [];
  const server = http.createServer(async (req, res) => {
    for await (const chunk of req) {}
    requests.push(req.headers);
    res.writeHead(200).end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const identity = { pid: owner.pid, start: processBirth(owner.pid) };
  const logs = path.join(os.homedir(), '.gemini/antigravity-cli/log');
  fs.mkdirSync(logs, { recursive: true });
  const log = path.join(logs, `acp-server-20261123_120000-${owner.pid}.log`);
  try {
    fs.writeFileSync(path.join(presence, 'antigravity-target.json'), JSON.stringify(identity));
    writeKey(identity, { address: `localhost:${server.address().port}`, token: TEST_TOKEN });
    fs.writeFileSync(log, `Language server listening on random port at ${server.address().port} for HTTP\n`);
    assert.equal(await antigravityPeer.send('antigravity:target', 'MESSAGE', { project: dir, from: 'claude:sender' }), 'started');
    assert.equal(requests.length, 1);
    assert.ok(!('x-codeium-csrf-token' in requests[0]));
  } finally {
    owner.kill();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(log, { force: true }); clearKeys();
  }
});
test('Old Node', () => {
  clearKeys();
  const fake = fakeAgy();
  fake.script(`"$FAKE_AGY_NODE" --require "${ROOT}/scripts/fixtures/no-sqlite.cjs" "$FAKE_AGY_SCRIPT"`);
  const r = fake.run(payload(fresh()));
  cleanResult(r);
  assert.ok(partsOf(r.stdout).includes(ASK));
  assert.ok(!r.stdout.includes('node:sqlite'));
  const registered = fake.run('', { FAKE_AGY_SCRIPT: REGISTER, ANTIGRAVITY_LS_ADDRESS: 'localhost:4567', ANTIGRAVITY_CSRF_TOKEN: TEST_TOKEN });
  cleanResult(registered);
  assert.equal(registered.stdout, 'head-context: 깨우기 등록됨\n');
  const approved = fake.run(JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: registerCommand(ROOT) } } }), { FAKE_AGY_SCRIPT: PRETOOL });
  cleanResult(approved);
  assert.equal(JSON.parse(approved.stdout).decision, 'auto_approve');
  clearKeys();
});
