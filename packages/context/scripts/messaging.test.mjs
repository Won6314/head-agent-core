import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { engineOf } from '../hosts/codex/mode.mjs';
import { splitCommandLine } from '../core/platform.mjs';
import { delegatedPrompt, deliverToCodex, queueToApp } from '../hosts/codex/deliver.mjs';
import { writePresence, queue, drain, take, codexLive, STALE_MS } from '../hosts/codex/threads.mjs';
import { packet, canonicalInbox } from '../hosts/claude/deliver.mjs';
import { sessions } from '../core/sessions.mjs';
import { DEFINITIONS } from '../core/mcp.mjs';
const root = process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir();
const fresh = name => fs.mkdtempSync(path.join(root, `${name}-`));
// Children never reach the user's own Codex or Claude: their own homes.
const ISOLATED = dir => ({ PATH: process.env.PATH, HOME: dir, CODEX_HOME: path.join(dir, '_codex-home'), CLAUDE_CONFIG_DIR: path.join(dir, '_claude') });

// A stand-in for the Codex shared engine: WebSocket JSON-RPC on a Unix socket. `answer`
// gives each method's result (a function of params) and records every request.
function fakeEngine(socket, answer) {
  const seen = [];
  const server = net.createServer(sock => {
    let buf = Buffer.alloc(0), up = false;
    const sendText = obj => { const d = Buffer.from(JSON.stringify(obj)); const h = d.length < 126 ? Buffer.from([0x81, d.length]) : Buffer.from([0x81, 126, d.length >> 8, d.length & 255]); sock.write(Buffer.concat([h, d])); };
    sock.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (!up) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; buf = buf.subarray(i + 4); up = true; sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'); }
      while (buf.length >= 2) {
        let n = buf[1] & 127, off = 2; if (n === 126) { n = buf.readUInt16BE(2); off = 4; }
        if (buf.length < off + 4 + n) return;
        const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + n).map((b, k) => b ^ mask[k % 4]));
        const op = buf[0] & 15; buf = buf.subarray(off + 4 + n);
        if (op !== 1) continue;
        const msg = JSON.parse(data.toString());
        if (msg.id === undefined) continue;
        seen.push(msg);
        try { sendText({ id: msg.id, result: answer(msg.method, msg.params) }); }
        catch (e) { sendText({ id: msg.id, error: { code: e.code ?? -32600, message: e.message } }); }
      }
    });
  });
  return new Promise(r => server.listen(socket, () => r({ seen, close: () => new Promise(c => server.close(c)) })));
}
const THREAD = id => ({ id, name: 'A 작업', preview: 'hello', status: { type: 'idle' }, cwd: '/p', modelProvider: 'openai', historyMode: 'paginated' });
const base = (method, params) => {
  switch (method) {
    case 'initialize': return { userAgent: 'fake' };
    case 'thread/read': return { thread: THREAD(params.threadId) };
    case 'thread/resume': return { thread: THREAD(params.threadId), model: 'gpt-x', modelProvider: 'openai' };
    case 'account/read': return { account: { type: 'chatgpt' } };
    case 'model/list': return { data: [{ model: 'gpt-x', availableAccessPrograms: null }] };
    case 'turn/start': return { turn: { id: 'turn-1' } };
    case 'thread/loaded/list': return { data: [] };
    default: return {};
  }
};
// A Claude conversation's inbox socket, registered as Claude Code registers a running one:
// <pid>.json and the key file with its peer token. Like Claude Code on Windows, it takes a
// message only after a first line {"type":"auth","token":<peer token>}; any other first line
// closes the connection and the message is dropped (counted in `dropped`).
async function claudeInbox(dir, id, { key = true } = {}) {
  const sock = path.join(dir, `${id}.sock`), reg = path.join(dir, '_claude', 'sessions'); fs.mkdirSync(reg, { recursive: true });
  fs.writeFileSync(path.join(reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: id, cwd: dir, messagingSocketPath: sock }));
  const token = randomBytes(16).toString('hex');
  if (key) fs.writeFileSync(path.join(reg, `${process.pid}.${createHash('sha256').update(path.resolve(sock)).digest('hex')}.key`), JSON.stringify({ peerToken: token }));
  const got = [], state = { dropped: 0 };
  const server = net.createServer(s => {
    let d = '';
    s.on('data', x => { d += x; });
    s.on('end', () => {
      const [first, ...rest] = d.split('\n').filter(Boolean).map(l => JSON.parse(l));
      if (first?.type !== 'auth' || first.token !== token) { state.dropped += 1; s.destroy(); return; }
      got.push(...rest); s.end();
    });
  });
  await new Promise(r => server.listen(sock, r));
  return { got, reg, token, get dropped() { return state.dropped; }, close: () => new Promise(r => server.close(r)) };
}
// One call to the Codex tool server, as Codex makes it (the calling thread in _meta).
function codexCall(dir, data, caller, name, args, env = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.resolve('scripts/codex-mcp.mjs')], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...ISOLATED(dir), HEAD_CONTEXT_CODEX_DATA: data, ...env } });
    let out = ''; child.stdout.on('data', d => { out += d; });
    child.on('close', () => resolve(out.trim().split('\n').map(l => JSON.parse(l))));
    child.stdin.end([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args, _meta: { threadId: caller } } }].map(m => JSON.stringify(m)).join('\n') + '\n');
  });
}
const registerThread = (data, id, cwd) => { fs.mkdirSync(path.join(data, 'threads'), { recursive: true }); fs.writeFileSync(path.join(data, 'threads', `${id}.json`), JSON.stringify({ thread_id: id, cwd })); };

test('names: the tools drop their session_/project_ heads; Codex alone gets send, shaped like its own', async () => {
  assert.deepEqual(DEFINITIONS.map(t => t.name), ['list', 'load', 'create', 'save', 'branch', 'read', 'todo', 'conversations', 'setup']);
  const dir = fresh('names'), data = path.join(dir, '_data');
  const [list] = await codexCall(dir, data, 'th-x', 'list', {});
  const send = list.result.tools.find(t => t.name === 'send');
  assert.deepEqual(send.inputSchema.required, ['threadId', 'prompt']);
  assert.equal(list.result.tools.length, DEFINITIONS.length + 1);
  assert.deepEqual(JSON.parse(fs.readFileSync('.mcp.json', 'utf8')).session.args.at(-1), '${CLAUDE_PLUGIN_ROOT}/scripts/mcp.mjs');
  assert.match(JSON.parse(fs.readFileSync('hooks/hooks.json', 'utf8')).hooks.PreToolUse[0].matcher, /session__/);
});

test('engine mode from the process ancestors: shared engine (and its socket), a window running its own, the desktop app', () => {
  const table = procs => pid => procs[pid] || null;
  const env = { CODEX_HOME: '/h' };
  assert.deepEqual(engineOf({ pid: 10, env, read: table({ 10: { argv: ['/bin/sh', '-c', 'node x'], ppid: 9 }, 9: { argv: ['/r/0.164.0/bin/codex', 'app-server', '--listen', 'unix://', '--analytics-default-enabled'], ppid: 1 } }) }),
    { mode: 'shared', pid: 9, home: '/h', socket: '/h/app-server-control/app-server-control.sock', bin: '/r/0.164.0/bin/codex' });
  assert.equal(engineOf({ pid: 9, env, read: table({ 9: { argv: ['codex', 'app-server', '--listen', 'unix:///tmp/x.sock'], ppid: 1 } }) }).socket, '/tmp/x.sock');
  assert.equal(engineOf({ pid: 9, env, read: table({ 9: { argv: ['/usr/local/bin/codex'], ppid: 1 } }) }).mode, 'embedded');
  assert.equal(engineOf({ pid: 9, env, read: table({ 9: { argv: ['/Applications/Codex.app/Contents/Resources/codex', 'app-server'], ppid: 1 } }) }).mode, 'app');
  assert.equal(engineOf({ pid: 9, env, read: table({ 9: { argv: ['bash'], ppid: 1 } }) }).mode, 'unknown');
  // Windows: the command line as Win32_Process gives it, split as Windows quotes it.
  const win = splitCommandLine('"C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\vendor\\codex.exe" app-server --listen unix:// --analytics-default-enabled');
  assert.deepEqual(win.slice(1), ['app-server', '--listen', 'unix://', '--analytics-default-enabled']);
  const hook = splitCommandLine('"C:\\Program Files\\nodejs\\node.exe" "C:\\p\\scripts\\codex-hook.mjs" session');
  const shared = engineOf({ pid: 30, env, read: table({ 30: { argv: hook, ppid: 20 }, 20: { argv: win, ppid: 4 } }) });
  assert.deepEqual([shared.mode, shared.pid, shared.bin], ['shared', 20, win[0]]);
  assert.equal(engineOf({ pid: 9, env, read: table({ 9: { argv: splitCommandLine('C:\\a\\codex.exe'), ppid: 1 } }) }).mode, 'embedded');
});

test('to a Codex conversation on the shared engine: its turn starts as a delegation, in the frame Codex itself uses', async () => {
  const dir = fresh('wake'), socket = path.join(dir, 's.sock'), eng = await fakeEngine(socket, base);
  try {
    writePresence(dir, { thread_id: 'th1', cwd: dir, engine: { mode: 'shared', socket, home: dir } });
    assert.equal(await deliverToCodex(dir, 'th1', 'a <b> & c', { from: 'claude:c-1' }), 'started');
    const start = eng.seen.find(m => m.method === 'turn/start').params;
    assert.deepEqual(start, { threadId: 'th1', input: [], toolOutput: { retain: false, name: 'send_message_to_thread', namespace: 'codex_tui', output: delegatedPrompt('claude:c-1', 'a <b> & c') } });
    assert.equal(delegatedPrompt('claude:x', 'a <b>'), '<codex_delegation>\n  <source_thread_id>claude:x</source_thread_id>\n  <input>a &lt;b&gt;</input>\n</codex_delegation>');
    await assert.rejects(deliverToCodex(dir, 'nobody', 'x', { from: 'claude:c-1' }), /이 프로젝트에서 연 Codex 대화가 아닙니다/);
  } finally { await eng.close(); }
});

test('Codex send: to a Claude conversation, to a Codex one (woken or queued), and a Claude one that is not running fails', async () => {
  const dir = fresh('send'), data = path.join(dir, '_data'), socket = path.join(dir, 's.sock');
  registerThread(data, 'caller', dir);
  writePresence(dir, { thread_id: 'caller', cwd: dir, engine: { mode: 'embedded', pid: 1, home: dir }, title: '창 A' });
  writePresence(dir, { thread_id: 'shared-b', cwd: dir, engine: { mode: 'shared', socket, home: dir } });
  writePresence(dir, { thread_id: 'inside-c', cwd: dir, engine: { mode: 'embedded', pid: 1, home: dir } });
  const inbox = await claudeInbox(dir, 'c-1'), eng = await fakeEngine(socket, base);
  try {
    const result = async (args) => (await codexCall(dir, data, 'caller', 'send', args))[1].result;
    let r = await result({ threadId: 'claude:c-1', prompt: '안녕' });
    assert.deepEqual(JSON.parse(r.content[0].text), { threadId: 'claude:c-1', delivery: 'sent' });
    assert.equal(inbox.dropped, 0);
    assert.equal(inbox.got[0].message.content, '<cross-session-message from="codex:caller" from-name="창 A">\n안녕\n</cross-session-message>');
    r = await result({ threadId: 'codex:shared-b', prompt: 'B에게' });
    assert.deepEqual(JSON.parse(r.content[0].text), { threadId: 'codex:shared-b', delivery: 'started' });
    assert.equal(eng.seen.find(m => m.method === 'turn/start').params.toolOutput.output, delegatedPrompt('codex:caller', 'B에게'));
    r = await result({ threadId: 'inside-c', prompt: 'C에게' });
    assert.deepEqual(JSON.parse(r.content[0].text), { threadId: 'codex:inside-c', delivery: 'queued' });
    assert.deepEqual(drain(dir, 'inside-c').map(m => [m.from, m.text]), [['codex:caller', 'C에게']]);
    r = await result({ threadId: 'claude:gone', prompt: 'x' });
    assert.equal(r.isError, true); assert.match(r.content[0].text, /지금 실행 중이 아닙니다: claude:gone/);
    r = await result({ threadId: 'codex:caller', prompt: 'x' });
    assert.equal(r.isError, true);
  } finally { await eng.close(); await inbox.close(); }
});

test('to a Codex desktop app conversation: into Codex\'s own queue with the app engine\'s binary; if that fails, the inbox', async () => {
  const dir = fresh('appq'), log = path.join(dir, 'args.json'), bin = path.join(dir, 'fake-codex');
  // A stand-in for the app's codex: records its arguments and CODEX_HOME; fails when told to.
  fs.writeFileSync(bin, `#!${process.execPath}\nconst fs=require('fs');if(process.env.FAKE_FAIL){console.error('no such thread');process.exit(1)}fs.writeFileSync(${JSON.stringify(log)},JSON.stringify({args:process.argv.slice(2),home:process.env.CODEX_HOME}))\n`);
  fs.chmodSync(bin, 0o755);
  writePresence(dir, { thread_id: 'app-1', cwd: dir, engine: { mode: 'app', pid: 1, home: '/h/.codex', bin } });
  assert.equal(await deliverToCodex(dir, 'app-1', '확인해 줘', { from: 'claude:c-1' }), 'app-queued');
  const got = JSON.parse(fs.readFileSync(log, 'utf8'));
  assert.deepEqual(got.args, ['queue', '--thread', 'app-1', '--message', delegatedPrompt('claude:c-1', '확인해 줘')]);
  assert.equal(got.home, '/h/.codex');
  assert.deepEqual(drain(dir, 'app-1'), []);
  process.env.FAKE_FAIL = '1';
  try { assert.equal(await deliverToCodex(dir, 'app-1', '다시', { from: 'claude:c-1' }), 'queued'); }
  finally { delete process.env.FAKE_FAIL; }
  assert.deepEqual(drain(dir, 'app-1').map(m => m.text), ['다시']);
  // An app conversation recorded before 0.9.4 has no binary: the inbox, as before.
  writePresence(dir, { thread_id: 'app-2', cwd: dir, engine: { mode: 'app', pid: 1, home: '/h' } });
  assert.equal(await deliverToCodex(dir, 'app-2', 'x', { from: 'claude:c-1' }), 'queued');
});

test('Codex queue on Mac also asks the app to pick the conversation up, in the background; elsewhere only the queue', async () => {
  const calls = [];
  const run = (cmd, args) => { calls.push([cmd, ...args]); const ee = new EventEmitter(); if (cmd !== 'open') setImmediate(() => ee.emit('close', 0)); ee.unref = () => { }; return ee; };
  await queueToApp({ bin: '/app/codex', home: '/h' }, 't-1', 'm', { wake: true, run });
  assert.deepEqual(calls, [['/app/codex', 'queue', '--thread', 't-1', '--message', 'm'], ['open', '-g', 'codex://threads/wake/t-1']]);
  calls.length = 0;
  await queueToApp({ bin: 'C:\\app\\codex.exe' }, 't-2', 'm', { wake: false, run });
  assert.deepEqual(calls, [['C:\\app\\codex.exe', 'queue', '--thread', 't-2', '--message', 'm']]);
});

test('one list for both apps: each caller sees the other app\'s conversations, addressed for its own send tool', () => {
  const dir = fresh('list');
  writePresence(dir, { thread_id: '01a1-codex', cwd: dir, engine: { mode: 'app', home: '/h' }, transcript_path: path.join(dir, 'r.jsonl') });
  fs.writeFileSync(path.join(dir, 'r.jsonl'), JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '코덱스에게 시킨 말입니다' }] } }) + '\n');
  const claudeRows = () => [{ conversation_id: 'c-1', title: 'head-a', address: 'uds:/run/a.sock', entrypoint: 'cli', reachable: true, last_at: Date.now() }, { conversation_id: 'down', entrypoint: 'claude-desktop', reachable: false, last_at: Date.now() }];
  const live = known => codexLive(dir, known);
  const fromClaude = sessions(dir, { host: 'claude', live: claudeRows, peers: [{ host: 'codex', live }] }).conversations({});
  assert.match(fromClaude, /^보내기: SendMessage\(to: 보낼 곳\)/m);
  assert.match(fromClaude, /보낼 곳 uds:\/run\/a\.sock · Claude · 사람/);
  assert.match(fromClaude, /보낼 곳 codex:01a1-codex · Codex · 사람[^\n]*\n\s+하는 일: 최근 지시: "코덱스에게 시킨 말입니다"/);
  assert.doesNotMatch(fromClaude, /받지 못함/);
  const fromCodex = sessions(dir, { host: 'codex', live, peers: [{ host: 'claude', live: claudeRows }] }).conversations({});
  assert.match(fromCodex, /^보내기: send\(threadId: 보낼 곳, prompt\)/m);
  assert.match(fromCodex, /보낼 곳 claude:c-1 · Claude/); assert.match(fromCodex, /보낼 곳 codex:01a1-codex · Codex/);
  assert.match(fromCodex, /보낼 곳 claude:down · Claude[^\n]*지금은 받지 못함/);
});

test('from Claude: a message to codex:<id> goes through the relay; off the shared engine it waits and is given once at the next prompt', () => {
  const dir = fresh('inbox'), script = path.resolve('scripts/codex-hook.mjs'), relay = path.resolve('scripts/relay.mjs');
  writePresence(dir, { thread_id: 'th1', cwd: dir, engine: { mode: 'embedded', pid: 1, home: '/h' } });
  const r = spawnSync(process.execPath, [relay, dir, 'codex:th1', 'claude:c-9', 'head-a'], { input: '확인 부탁', encoding: 'utf8', env: ISOLATED(dir) });
  assert.deepEqual(JSON.parse(r.stdout), { delivered: true, how: 'queued' });
  const prompt = () => spawnSync(process.execPath, [script, 'inbox'], { input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'th1', cwd: dir, prompt: 'hi' }), encoding: 'utf8', env: ISOLATED(dir) });
  const got = JSON.parse(prompt().stdout);
  assert.equal(got.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(got.hookSpecificOutput.additionalContext, '<cross-session-message from="claude:c-9" from-name="head-a">\n확인 부탁\n</cross-session-message>');
  assert.equal(prompt().stdout, '');
  assert.equal(JSON.parse(spawnSync(process.execPath, [relay, dir, 'codex:unknown', 'claude:c-9'], { input: 'x', encoding: 'utf8', env: ISOLATED(dir) }).stdout).delivered, false);
});

test('to a Claude conversation: the packet another Claude conversation sends, on its inbox socket', async () => {
  const p = packet('hi', { from: 'codex:th1', fromName: 'A "q"' });
  assert.equal(p.message.content, '<cross-session-message from="codex:th1" from-name="A &quot;q&quot;">\nhi\n</cross-session-message>');
  assert.deepEqual([p.msgV, p.type, p.priority, p.from], [1, 'user', 'next', 'codex:th1']);
  const dir = fresh('claude'), inbox = await claudeInbox(dir, 'c-1');
  process.env.HEAD_CONTEXT_CLAUDE_SESSIONS = inbox.reg;
  try {
    const { deliverToClaude } = await import('../hosts/claude/deliver.mjs');
    await deliverToClaude('claude:c-1', '보냄', { from: 'codex:th1' });
    assert.equal(inbox.got[0].message.content, '<cross-session-message from="codex:th1">\n보냄\n</cross-session-message>');
    await assert.rejects(deliverToClaude('claude:nobody', 'x', { from: 'codex:th1' }), /실행 중인 Claude 대화가 없습니다/);
    assert.equal(inbox.dropped, 0);
  } finally { delete process.env.HEAD_CONTEXT_CLAUDE_SESSIONS; await inbox.close(); }
});

test('to a Claude conversation on Windows: the auth line goes first, and with no key nothing is sent', async () => {
  const dir = fresh('claude-auth'), inbox = await claudeInbox(dir, 'c-2', { key: false });
  process.env.HEAD_CONTEXT_CLAUDE_SESSIONS = inbox.reg;
  try {
    const { deliverToClaude } = await import('../hosts/claude/deliver.mjs');
    await assert.rejects(deliverToClaude('claude:c-2', 'x', { from: 'codex:th1', requireAuth: true }), /인증 키를 찾지 못해 보내지 않았습니다/);
    assert.equal(inbox.dropped, 0);
    // Without a key where auth is optional the message still goes, as before (this stand-in
    // always asks for auth, so it drops it: the case the Windows fix is about).
    await deliverToClaude('claude:c-2', 'x', { from: 'codex:th1', requireAuth: false });
    await new Promise(r => setTimeout(r, 50));
    assert.equal(inbox.dropped, 1);
    // A key of a dead owner is passed over for the live one's.
    const sock = path.join(dir, 'c-2.sock'), hash = createHash('sha256').update(path.resolve(sock)).digest('hex');
    fs.writeFileSync(path.join(inbox.reg, `999999.${hash}.key`), JSON.stringify({ peerToken: 'f'.repeat(32) }));
    fs.writeFileSync(path.join(inbox.reg, `${process.pid}.${hash}.key`), JSON.stringify({ peerToken: inbox.token }));
    await deliverToClaude('claude:c-2', '인증함', { from: 'codex:th1', requireAuth: true });
    assert.equal(inbox.got[0].message.content, '<cross-session-message from="codex:th1">\n인증함\n</cross-session-message>');
    assert.equal(inbox.dropped, 1);
  } finally { delete process.env.HEAD_CONTEXT_CLAUDE_SESSIONS; await inbox.close(); }
});

test('the inbox path Claude Code hashes for its key: Windows pipes lowered, other paths resolved', () => {
  assert.equal(canonicalInbox('\\\\.\\pipe\\Claude-ABC'), '\\\\.\\pipe\\claude-abc');
  assert.equal(canonicalInbox('//./pipe/LOCAL/Cc-Msg-1'), '\\\\.\\pipe\\local\\cc-msg-1');
  assert.equal(canonicalInbox('\\\\.\\pipe\\bad.'), null);
  assert.equal(canonicalInbox('/run/a/../b.sock'), null);
  assert.equal(canonicalInbox('/run/x/./a.sock'), '/run/x/a.sock');
});

test('a headless conversation its starter marks as a person\'s: kept as a person in the list, not as a copy', async () => {
  const { runHook } = await import('./hook-run.mjs');
  const dir = fresh('person');
  runHook({ hook_event_name: 'SessionStart', session_id: 'p-1', source: 'startup', cwd: dir }, { env: { CLAUDE_PROJECT_DIR: dir, CLAUDE_CODE_ENTRYPOINT: 'sdk-cli', HEAD_CONTEXT_PERSON: '1' }, part: 'session' });
  runHook({ hook_event_name: 'SessionStart', session_id: 'w-1', source: 'startup', cwd: dir }, { env: { CLAUDE_PROJECT_DIR: dir, CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' }, part: 'session' });
  const live = () => ['p-1', 'w-1'].map(id => ({ conversation_id: id, entrypoint: 'sdk-cli', address: `uds:/run/${id}.sock`, last_at: Date.now() }));
  const tree = sessions(dir, { host: 'claude', live }).tree({});
  assert.deepEqual(tree.loose.map(r => [r.conversation_id, r.kind]), [['p-1', 'person'], ['w-1', 'copy']]);
});

test('the inbox is taken once: two takers at once, a taker that died, a message that arrives while one takes', async () => {
  const dir = fresh('take');
  for (let k = 0; k < 3; k++) queue(dir, 'th', { from: 'x', text: `m${k}` });
  const one = take(dir, 'th'), two = take(dir, 'th');
  assert.deepEqual([one.messages.map(m => m.text), two.messages.length], [['m0', 'm1', 'm2'], 0]);
  queue(dir, 'th', { from: 'x', text: 'late' });
  one.done();
  assert.deepEqual(drain(dir, 'th').map(m => m.text), ['late']);
  // A taker that died before done(): its messages come back once, at the next take.
  queue(dir, 'th', { from: 'x', text: 'lost?' });
  const inbox = path.join(dir, '.head', 'state', 'inbox', 'codex-th'), file = fs.readdirSync(inbox).find(f => f.endsWith('.json'));
  const dead = path.join(inbox, '.taking-999999999-x'); fs.mkdirSync(dead); fs.renameSync(path.join(inbox, file), path.join(dead, file));
  assert.deepEqual(drain(dir, 'th').map(m => m.text), ['lost?']);
  assert.deepEqual(drain(dir, 'th'), []);
  // One whose process is alive but that is older than STALE_MS is taken back too.
  queue(dir, 'th', { from: 'x', text: 'stuck' });
  const f2 = fs.readdirSync(inbox).find(f => f.endsWith('.json')), stuck = path.join(inbox, `.taking-${process.pid}-y`);
  fs.mkdirSync(stuck); fs.renameSync(path.join(inbox, f2), path.join(stuck, f2));
  assert.deepEqual(drain(dir, 'th'), []);
  assert.deepEqual(take(dir, 'th', { now: Date.now() + STALE_MS + 1000 }).messages.map(m => m.text), ['stuck']);
  // Many takers in separate processes at once: every message given exactly once.
  const many = fresh('take-many');
  for (let k = 0; k < 60; k++) queue(many, 'th', { from: 'x', text: `n${k}` });
  const code = `import { take } from ${JSON.stringify(path.resolve('hosts/codex/threads.mjs'))}; const t = take(${JSON.stringify(many)}, 'th'); process.stdout.write(JSON.stringify(t.messages.map(m => m.text))); t.done();`;
  const runs = await Promise.all(Array.from({ length: 6 }, () => new Promise(r => { const c = spawn(process.execPath, ['--input-type=module', '-e', code]); let o = ''; c.stdout.on('data', d => { o += d; }); c.on('close', () => r(JSON.parse(o || '[]'))); })));
  const all = runs.flat().sort();
  assert.equal(all.length, 60); assert.equal(new Set(all).size, 60);
});
