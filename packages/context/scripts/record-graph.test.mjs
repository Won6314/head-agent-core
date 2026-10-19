import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sessions} from '../core/sessions.mjs';
import {withGraph} from '../core/graph.mjs';
import {parseHistory} from '../core/history.mjs';
import {callTool} from '../core/mcp.mjs';
import {runStart} from './hook-run.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT;
if(!root)throw new Error('HEAD_CONTEXT_TEST_ROOT must point at the evidence test directory');
// These tests are about the record files and the index; the conversation works on main.
const fixture=({main=true}={})=>{const dir=fs.mkdtempSync(path.join(root,'record-'));const s=sessions(dir,{host:'claude'});s.create({name:'demo',context:'DIRECTION_SECRET_19',conversation_id:'c'});if(main)s.load({branch:'main',conversation_id:'c'});return {dir,s,base:path.join(dir,'.head/sessions/demo')};};
const save=(s,text,id='c')=>s.save({summary:text,history:'BODY_SECRET_37 '+text,next:'CURSOR_SECRET_58 '+text,conversation_id:id});

test('a branch keeps only its own records, the graph keeps the ancestry and the fork point stays frozen',()=>{
  const {dir,s,base}=fixture();save(s,'main-one');
  s.branch({action:'create',branch:'A',conversation_id:'c'});
  assert.doesNotMatch(fs.readFileSync(path.join(base,'work/A/history.md'),'utf8'),/main-one|여기까지/);
  save(s,'A-one');s.branch({action:'create',branch:'B',conversation_id:'c'});save(s,'B-one');
  assert.match(s.inspect({action:'recent',conversation_id:'c',count:10}),/main-one[\s\S]+A-one[\s\S]+B-one/);
  s.load({branch:'main',conversation_id:'c'});save(s,'later-main');s.branch({action:'attach',branch:'B',conversation_id:'c'});
  const body=s.inspect({action:'recent',conversation_id:'c',count:10});assert.doesNotMatch(body,/later-main/);
  // Leaving A closed nothing. The B map: main in the first column (with the save made
  // after B forked), A, then B forking off A; each name at its own tip.
  const map=s.inspect({action:'map',branch:'B',conversation_id:'c'});assert.match(map,/^# 지도: demo \/ B\n/);assert.match(map,/ A-one \(A\)\n/);assert.match(map,/ B-one \(B\)\n/);assert.match(map,/\n?\* [0-9a-f]{5} [^\n]+ later-main \(main\)\n/);
  assert.match(map,/\|   \* [0-9a-f]{5} [^\n]+ B-one \(B\)\n\|  \/\n\| \* [0-9a-f]{5} [^\n]+ A-one/);assert.match(map,/\n\|\/\n\* [0-9a-f]{5} [^\n]+ main-one\n?$/);assert.doesNotMatch(map,/demo\/|@20/);
  const rows=withGraph(dir,g=>g.recent('demo','B',0));assert.equal(rows.length,3);assert.equal(s.inspect({action:'entry',id:rows[1].id,conversation_id:'c'}),rows[1].body);
  // A short ID from the map opens the same record; another session's short ID needs its name.
  const short=/([0-9a-f]{5}) \d\d-\d\d \d\d:\d\d A-one/.exec(map)[1];assert.equal(s.inspect({action:'entry',id:short,conversation_id:'c'}),rows[1].body);
  assert.equal(s.inspect({action:'entry',id:short,name:'demo'}),rows[1].body);assert.throws(()=>s.inspect({action:'entry',id:'zz-not',conversation_id:'c'}),/짧은 ID/);
  assert.doesNotMatch(fs.readFileSync(path.join(base,'history.md'),'utf8'),/work:/);
});
test('closing squashes one entry with its pointer and merge, is idempotent, and abandonment keeps the reason',()=>{
  const {s,base}=fixture();save(s,'parent');s.branch({action:'create',branch:'done',conversation_id:'c'});
  s.save({summary:'branch-result',history:'BODY_SECRET_37',recap:'RECAP_SECRET_61',conversation_id:'c'});
  assert.equal(s.connection('c').branch,null);
  assert.throws(()=>s.branch({action:'abandon',branch:'done',reason:'late',conversation_id:'c'}),/이미 닫혀/); // already closed: no second entry
  const main=fs.readFileSync(path.join(base,'history.md'),'utf8');
  assert.equal(parseHistory(main).filter(e=>e.branch==='done').length,1);
  assert.match(main,/브랜치: done\n기록: work\/done\/history.md/);assert.doesNotMatch(main,/work:/);
  assert.match(s.inspect({action:'map',conversation_id:'c'}),/합침 ← done · 끝남/);assert.match(s.inspect({action:'map',conversation_id:'c'}),/ branch-result \(done 끝남\)/);
  s.branch({action:'create',branch:'later',conversation_id:'c'});save(s,'to abandon');
  s.branch({action:'abandon',reason:'User stopped this direction.',conversation_id:'c'});
  assert.match(fs.readFileSync(path.join(base,'history.md'),'utf8'),/상태: 중단[\s\S]+이유: User stopped/);
  assert.equal(s.connection('c').branch,null);
  assert.match(fs.readFileSync(path.join(base,'work','later','history.md'),'utf8'),/상태: 중단/);
});
test('no parent checkpoints, branch-of-empty-branch, branch name safety',()=>{
  const {s,base}=fixture();s.branch({action:'create',branch:'empty',conversation_id:'c'});
  assert.match(fs.readFileSync(path.join(base,'work/empty/history.md'),'utf8'),/갈래: demo\/메인@없음/);
  s.branch({action:'create',branch:'child',conversation_id:'c'});save(s,'child-first');const orphan=s.inspect({action:'map',conversation_id:'c'});assert.match(orphan,/child-first \(child\)/);assert.doesNotMatch(orphan,/\|\//); // no fork point: the column just ends
  assert.throws(()=>s.branch({action:'create',branch:'../escape',conversation_id:'c'}));assert.throws(()=>s.branch({action:'create',branch:'main',conversation_id:'c'}));
});
test('graph contains identifiers/locations/relationships only; file references and direct word search',()=>{
  const {dir,s,base}=fixture();fs.writeFileSync(path.join(base,'doc.md'),'referenced file');fs.writeFileSync(path.join(base,'other.txt'),'other');
  s.save({summary:'SUMMARY_SECRET_93',history:'BODY_SECRET_37 [reference](doc.md) and other.txt and missing.md.',next:'CURSOR_SECRET_58',conversation_id:'c'});
  const result=s.inspect({action:'find',file:'doc.md',conversation_id:'c'});assert.match(result,/SUMMARY_SECRET_93/);assert.match(s.inspect({action:'find',file:'other.txt',conversation_id:'c'}),/SUMMARY_SECRET_93/);
  assert.equal(s.inspect({action:'find',file:'missing.md',conversation_id:'c'}),'(없음)');assert.match(s.inspect({action:'find',query:'body_secret',conversation_id:'c'}),/SUMMARY_SECRET_93/);
  const data=withGraph(dir,g=>({nodes:g.db.prepare('SELECT * FROM nodes').all(),edges:g.db.prepare('SELECT * FROM edges').all(),columns:g.db.prepare('PRAGMA table_info(nodes)').all().map(c=>c.name)}));
  for(const secret of ['DIRECTION_SECRET_19','BODY_SECRET_37','CURSOR_SECRET_58','SUMMARY_SECRET_93'])assert.ok(!JSON.stringify(data).includes(secret));
  const bytes=fs.readFileSync(path.join(dir,'.head/index.sqlite')).toString();assert.ok(!bytes.includes('BODY_SECRET_37'));assert.ok(!bytes.includes('DIRECTION_SECRET_19'));
  assert.ok(data.edges.some(e=>e.kind==='points'));assert.deepEqual(data.columns,['id','kind','session','stem','stamp','file','start','end','seq']);
});
test('delete/version/corrupt index rebuild, external append, unchanged files not reindexed, map limit',()=>{
  const {dir,s,base}=fixture();save(s,'one');save(s,'two');const map=s.inspect({action:'map',conversation_id:'c'});
  fs.unlinkSync(path.join(dir,'.head/index.sqlite'));assert.equal(s.inspect({action:'map',conversation_id:'c'}),map);
  withGraph(dir,g=>g.db.exec('PRAGMA user_version=99'));assert.equal(s.inspect({action:'map',conversation_id:'c'}),map);
  fs.writeFileSync(path.join(dir,'.head/index.sqlite'),'not a database');assert.equal(s.inspect({action:'map',conversation_id:'c'}),map);
  const file=path.join(base,'history.md');fs.appendFileSync(file,'\n## 2026-10-14T00:00:00.000Z work:old-topic\n\n요약: outside\n상태: 열림\n\nexternal body\n\n다음: external cursor\n');
  const indexed=withGraph(dir,g=>({changed:g.reindexed,entries:g.recent('demo','main',0)}));assert.deepEqual(indexed.changed,[file]);assert.equal(indexed.entries.length,3);
  assert.deepEqual(withGraph(dir,g=>g.reindexed),[]);assert.match(s.inspect({action:'map',conversation_id:'c',limit:1}),/그 앞 2개/);
});
test('legacy labels/fallback/connection and actual old 0.3 store append read as main',async()=>{
  const {dir,s,base}=fixture();fs.writeFileSync(path.join(base,'history.md'),'## 2020-01-01 work:old\n\n**context_run** old summary\n다음: old\n');
  fs.writeFileSync(path.join(dir,'.head/state/conversations/claude-c.json'),JSON.stringify({host:'claude',conversation_id:'c',session:'demo',work:'old'}));
  const {sessions:oldSessions}=await import(new URL('../core/sessions.mjs',import.meta.url).href);
  oldSessions(dir,{host:'claude'}).save({summary:'old MCP append',history:'old resident code',next:'cursor',conversation_id:'c'});
  const oldMcp=spawnSync(process.execPath,[fileURLToPath(new URL('../hosts/claude/mcp.mjs',import.meta.url))],{env:{...process.env,CLAUDE_PROJECT_DIR:dir},input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'session_save',arguments:{conversation_id:'c',summary:'real old MCP',history:'stdio old process body',next:'old cursor'}}})+'\n',encoding:'utf8'});
  assert.equal(oldMcp.status,0);assert.equal(JSON.parse(oldMcp.stdout).result.isError,undefined);
  const data=withGraph(dir,g=>g.recent('demo','main',0));assert.equal(data.length,3);assert.equal(data[0].summary,'context_run old summary');assert.equal(data[1].summary,'old MCP append');assert.equal(data[2].summary,'real old MCP');
  assert.equal(withGraph(dir,g=>g.branches('demo').length),0);
  assert.throws(()=>callTool(s,'session_save',{summary:'x',history:'y',work:'old'},'c'),/유효하지 않은 인자: work/);
  // A record from before branches existed keeps its session and works on main.
  const started=s.start({conversation_id:'c'});assert.equal(started.session,'demo');assert.equal(started.stem,'main');
  assert.match(s.identity({conversation_id:'c'}),/## 흐름 \(최신이 위\)[\s\S]*real old MCP/);
});
test('other-session map does not rebind, load returns direction/map/body, MCP surface and old hook still run',()=>{
  const {dir,s}=fixture();save(s,'main');s.create({name:'other',context:'OTHER',conversation_id:'other'});save(s,'other','other');
  assert.match(s.inspect({action:'map',name:'other',conversation_id:'c'}),/^# 지도: other\n\* [0-9a-f]{5} [^\n]+ other/);assert.equal(s.connection('c').session,'demo');
  const loaded=s.load({conversation_id:'c'});assert.match(loaded,/DIRECTION_SECRET_19/);assert.match(loaded,/## 흐름/);assert.doesNotMatch(loaded,/# 지도:|BODY_SECRET/);
  assert.match(callTool(s,'session_read',{action:'recent',count:1},'c'),/BODY_SECRET/);assert.throws(()=>callTool(s,'session_read',{action:'oops'},'c'));
  const hook=runStart({session_id:'c',source:'compact',cwd:dir},{env:{CLAUDE_PROJECT_DIR:dir}});
  assert.match(hook.parts.session,/DIRECTION_SECRET_19/);assert.match(hook.parts.context,/## 흐름/);assert.ok(hook.parts.session.length<10000&&hook.parts.context.length<10000);
});
test('concurrent processes write the same file and index without losing or duplicating records',async()=>{
  const {dir,s}=fixture();const module=path.resolve('core/sessions.mjs');
  const code=`import {sessions} from ${JSON.stringify('file://'+module)};const s=sessions(process.argv[1],{host:'claude'});s.load({name:'demo',conversation_id:process.argv[2]});for(let i=0;i<8;i++)s.save({summary:process.argv[2]+'-'+i,history:'concurrent',next:'next',conversation_id:process.argv[2]});`;
  await Promise.all(Array.from({length:4},(_,i)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,dir,'child'+i],{stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',d=>error+=d);child.on('exit',c=>c===0?resolve():reject(new Error(error)));child.on('error',reject);})));assert.equal(withGraph(dir,g=>g.recent('demo','main',0).length),32);
  assert.equal(new Set(withGraph(dir,g=>g.recent('demo','main',0).map(e=>e.id))).size,32);assert.match(s.inspect({action:'map',conversation_id:'c',limit:4}),/그 앞 28개/); // 32 records; the 32 index lines they left on main are not drawn
});
