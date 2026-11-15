import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sessions } from '../core/sessions.mjs';
import { withGraphRead } from '../core/graph.mjs';

const core = new URL('../core/', import.meta.url).href;
const root = process.env.HEAD_CONTEXT_TEST_ROOT || process.env.HOME;
const events = [];
const worker = `
import fs from 'node:fs';
import {sessions} from ${JSON.stringify(core + 'sessions.mjs')};
import {withGraphRead} from ${JSON.stringify(core + 'graph.mjs')};
const [project,role,id,branch,barrier] = process.argv.slice(1);
const api=sessions(project,{host:Number(id)%2?'codex':'claude',now:()=>Date.parse('2026-02-01T00:00:00.000Z')});
const emit=x=>process.send({...x,pid:process.pid,at:Date.now()});
const held=new Map(),waiting=new Map();
const mkdir=fs.mkdirSync,rm=fs.rmSync,append=fs.appendFileSync;
let appended=false;
fs.appendFileSync=function(...args){const v=append(...args);appended=true;return v;};
fs.mkdirSync=function(p,...args){
 if(!String(p).endsWith('.lock'))return mkdir(p,...args);
 const index=String(p).endsWith('index-v4.sqlite.lock');
 if(index&&[...held.keys()].some(f=>!f.endsWith('index-v4.sqlite.lock')))throw new Error('history -> index nesting');
 if(!index&&[...held.keys()].some(f=>f.endsWith('index-v4.sqlite.lock')))throw new Error('index -> history nesting');
 const start=waiting.get(p)??performance.now();waiting.set(p,start);
 try {const v=mkdir(p,...args);const at=performance.now();held.set(p,at);waiting.delete(p);emit({event:'acquire',file:p,wait:at-start});return v;}
 catch(e){let owner=null;try{owner=fs.readFileSync(p+'/owner','utf8');}catch{}emit({event:'wait',file:p,code:e.code,owner,exists:fs.existsSync(p)});throw e;}
};
fs.rmSync=function(p,...args){const v=rm(p,...args);if(held.has(p)){emit({event:'release',file:p,hold:performance.now()-held.get(p)});held.delete(p);
 if(barrier&&appended&&!held.size&&!String(p).endsWith('index-v4.sqlite.lock')){appended=false;emit({event:'paused'});while(!fs.existsSync(barrier))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}
}return v;};
const proto=withGraphRead(project,g=>Object.getPrototypeOf(g));
for(const method of ['sync','relate','recent','map','find','item']){const original=proto[method];proto[method]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{emit({event:method==='sync'||method==='relate'?method:'callback',method,ms:performance.now()-t,changed:this.reindexed.length,records:this.db.prepare("SELECT count(*) n FROM nodes WHERE kind='checkpoint'").get().n});}};}
api.load({name:'A',branch:branch||'main',conversation_id:'w'+id});
const verify=({token,request,returned})=>{
 const start=performance.now();emit({event:'start',method:'verify',token,returned});
 try {
  const recent=api.inspect({action:'recent',name:'A',branch:branch||'main',count:0});
  const map=api.inspect({action:'map',name:'A',branch:branch||undefined,limit:0});
  const find=api.inspect({action:'find',name:'A',query:token,limit:0});
  if(!recent.includes(token)||!map.includes(token)||!find.includes(token))throw new Error('completed token invisible '+token);
  const id=find.split(' · ')[0];if(!api.inspect({action:'entry',name:'A',id}).includes(token))throw new Error('entry missing');
  if(branch)withGraphRead(project,g=>{for(const stem of ['main',branch])if(!g.own('A',stem).some(r=>g.detail(r).summary===token))throw new Error('branch/main snapshot mismatch');});
  emit({event:'verified',request,token,ms:performance.now()-start});
 }catch(e){emit({event:'error',request,error:e.stack});}
};
if(role==='create'){for(let i=0;i<8;i++){api.branch({action:'create',branch:'b'+i,parent:'main',conversation_id:'w'+id});api.load({branch:'main',conversation_id:'w'+id});}process.disconnect();}
else if(role==='reader'){process.on('message',m=>{if(m.stop)process.exit(0);verify(m);});emit({event:'ready'});}
else {const n=role==='single'?1:8;for(let i=0;i<n;i++){const token='token-'+id+'-'+i;const t=performance.now();emit({event:'start',method:'save',token});api.save({summary:token,history:'body '+token,next:'next',conversation_id:'w'+id});emit({event:'saved',token,returned:Date.now(),ms:performance.now()-t});}process.disconnect();}
`;

function child(project, role, id, branch = '', barrier = '') {
  const proc = spawn(process.execPath, ['--input-type=module', '-e', worker, project, role, String(id), branch, barrier], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const messages = [], waiting = []; let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  proc.on('message', (m) => {
    events.push(m); messages.push(m);
    for (const w of [...waiting]) if (w.predicate(m)) { waiting.splice(waiting.indexOf(w), 1); w.resolve(m); }
  });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('exit', (code, signal) => code === 0 || signal === 'SIGKILL' ? resolve() : reject(new Error(stderr || `worker exit ${code}`)));
  });
  const next = (predicate) => {
    const found = messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`worker message timeout: ${stderr}`)), 30000);
      waiting.push({ predicate, resolve: (m) => { clearTimeout(timer); resolve(m); } });
    });
  };
  return { proc, messages, done, next };
}
const fixture = () => {
  const project = fs.mkdtempSync(path.join(root, 'parallel-'));
  const api = sessions(project);
  api.create({ name: 'A', context: 'concurrency', conversation_id: 'parent' });
  return { project, api };
};

for (const branch of ['', 'shared'])
  test(`v4 processes: 4x8 ${branch ? 'branch+main' : 'main'} writers, four IPC readers, fixed timestamps and cross-host visibility`, { timeout: 60000 }, async (t) => {
    const { project, api } = fixture();
    if (branch) api.branch({ action: 'create', branch, conversation_id: 'parent' });
    const readers = Array.from({ length: 4 }, (_, i) => child(project, 'reader', 10 + i, branch));
    const writers = []; t.after(() => { for (const c of [...readers, ...writers]) if (c.proc.exitCode === null) c.proc.kill('SIGKILL'); });
    await Promise.all(readers.map((r) => r.next((m) => m.event === 'ready')));
    let request = 0; const verified = [];
    for (let i = 0; i < 4; i++) {
      const c = child(project, 'writer', i, branch); writers.push(c);
      c.proc.on('message', (m) => {
        if (m.event !== 'saved') return;
        const reader = readers[request % 4], n = request++;
        // This instruction is sent only after the writer's success-return signal.
        const check = reader.next((r) => r.request === n && ['verified', 'error'].includes(r.event)).then((r) => assert.equal(r.event, 'verified', r.error));
        verified.push(check); reader.proc.send({ token: m.token, returned: m.returned, request: n });
      });
    }
    await Promise.all(writers.map((w) => w.done));
    await Promise.all(verified); assert.equal(request, 32);
    for (const r of readers) r.proc.send({ stop: true });
    await Promise.all(readers.map((r) => r.done));
    withGraphRead(project, (g) => {
      const rows = g.own('A', branch || 'main');
      assert.equal(rows.length, 32); assert.equal(new Set(rows.map((r) => r.id)).size, 32);
      if (branch) assert.equal(g.own('A', 'main').length, 32);
    });
  });

test('v4 process barriers: late refresh cannot delete a later commit; killed md-only writer is recovered on read', { timeout: 30000 }, async (t) => {
  for (const kill of [false, true]) {
    const { project } = fixture(), barrier = path.join(project, 'resume');
    const a = child(project, 'single', 20, '', barrier);
    t.after(() => { if (a.proc.exitCode === null) a.proc.kill('SIGKILL'); });
    await a.next((m) => m.event === 'paused');
    if (kill) { a.proc.kill('SIGKILL'); await a.done; }
    else {
      const b = child(project, 'single', 21); await b.done;
      fs.writeFileSync(barrier, 'resume'); await a.done;
    }
    withGraphRead(project, (g) => {
      const summaries = g.recent('A', 'main', 0).map((e) => e.summary);
      assert.ok(summaries.includes('token-20-0'));
      if (!kill) assert.ok(summaries.includes('token-21-0'));
    });
  }
});

test('v4 branch create and save run without index/history nesting or deadlock', { timeout: 30000 }, async () => {
  const { project } = fixture();
  await Promise.all([child(project, 'create', 31).done, child(project, 'writer', 30).done]);
  assert.equal(withGraphRead(project, (g) => g.branches('A').length), 8);
});

test('v4 concurrency evidence: latency differs from actual mkdir wait/hold; all graph reads acquire lock', () => {
  const stats = (values) => {
    const a = values.sort((a, b) => a - b);
    return { count: a.length, min: a[0], median: a[Math.floor(a.length / 2)], p95: a[Math.min(a.length - 1, Math.floor(a.length * .95))], max: a.at(-1) };
  };
  const summary = {
    node: process.version,
    latencyMs: stats(events.filter((e) => ['saved', 'verified'].includes(e.event)).map((e) => e.ms)),
    lockWaitMs: stats(events.filter((e) => e.event === 'acquire').map((e) => e.wait)),
    lockHoldMs: stats(events.filter((e) => e.event === 'release').map((e) => e.hold)),
    timeouts: events.filter((e) => /잠금을 얻지/.test(e.error || '')).length,
  };
  assert.ok(events.some((e) => e.event === 'acquire' && e.file.endsWith('index-v4.sqlite.lock')));
  for (const pid of new Set(events.map((e) => e.pid))) {
    let count = null;
    for (const e of events.filter((e) => e.pid === pid)) {
      if (e.event === 'start' && e.method === 'verify') count = 0;
      if (count !== null && e.event === 'acquire' && e.file.endsWith('index-v4.sqlite.lock')) count++;
      if (e.event === 'verified') { assert.ok(count >= 4, 'every inspect read must acquire the index lock'); count = null; }
    }
  }
  assert.ok(!events.some((e) => e.event === 'error'));
  fs.writeFileSync(path.join(root, 'v4-concurrency-events.json'), JSON.stringify({ summary, events }, null, 2));
  console.log(JSON.stringify(summary));
});
