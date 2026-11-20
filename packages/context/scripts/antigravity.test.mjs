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
import { checkpointOf, steps, recentPart } from '../hosts/antigravity/transcript.mjs';
import { callerOf } from '../hosts/antigravity/register.mjs';
import { queue, readPresence } from '../hosts/antigravity/threads.mjs';
import { register as registerClaudeSend } from '../hooks/conversations.mjs';
import { locations } from '../core/storage.mjs';
import { agyOwner } from '../hosts/antigravity/process.mjs';
import { processBirth } from '../core/platform.mjs';
import { antigravityPeer } from '../hosts/antigravity/peer.mjs';
import { claudeTree } from '../hosts/claude/tree.mjs';

const fresh = () => fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir(), 'agy-'));
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
  assert.match(
    sessions(dir, {
      host: 'claude',
      peers: [{ host: 'antigravity', live: () => [{ conversation_id: 'c1', address: 'antigravity:c1' }] }],
    }).conversations(),
    /antigravity:c1 · antigravity/,
  );
});
