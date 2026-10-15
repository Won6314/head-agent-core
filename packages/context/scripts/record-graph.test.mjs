import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {sessions} from '../core/sessions.mjs';
import {withGraph} from '../core/graph.mjs';
import {parseHistory} from '../core/history.mjs';
import {board,renderBoard} from '../core/board.mjs';
import {callTool} from '../core/mcp.mjs';
import opencode from '../hosts/opencode/plugin.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT;
if(!root)throw new Error('HEAD_CONTEXT_TEST_ROOT must point at the evidence test directory');
const fixture=()=>{const dir=fs.mkdtempSync(path.join(root,'record-'));const s=sessions(dir,{host:'claude'});s.create({name:'demo',context:'DIRECTION_SECRET_19',conversation_id:'c'});return {dir,s,base:path.join(dir,'.head/sessions/demo')};};
const save=(s,text,id='c')=>s.save({summary:text,history:'BODY_SECRET_37 '+text,next:'CURSOR_SECRET_58 '+text,conversation_id:id});

test('main default, no work, branch only-own files, nested graph ancestry and frozen fork point',()=>{
  const {dir,s,base}=fixture();save(s,'main-one');
  s.branch({action:'create',branch:'A',topic:'TOPIC_SECRET_76',conversation_id:'c'});
  assert.doesNotMatch(fs.readFileSync(path.join(base,'work/A/history.md'),'utf8'),/main-one|여기까지/);
  save(s,'A-one');s.branch({action:'create',branch:'B',topic:'nested',conversation_id:'c'});save(s,'B-one');
  assert.match(s.inspect({action:'recent',conversation_id:'c',count:10}),/main-one[\s\S]+A-one[\s\S]+B-one/);
  s.branch({action:'main',conversation_id:'c',keep_open:true});save(s,'later-main');s.branch({action:'attach',branch:'B',conversation_id:'c'});
  const body=s.inspect({action:'recent',conversation_id:'c',count:10});assert.doesNotMatch(body,/later-main/);
  const map=s.inspect({action:'map',branch:'B',conversation_id:'c'});assert.match(map,/A \[열림\]/);assert.match(map,/B \[열림\]/);assert.match(map,/갈라진 뒤 메인 \(요약만\)/);assert.match(map,/later-main/);
  const rows=withGraph(dir,g=>g.recent('demo','B',0));assert.equal(rows.length,3);assert.equal(s.inspect({action:'entry',id:rows[1].id,conversation_id:'c'}),rows[1].body);
  assert.doesNotMatch(fs.readFileSync(path.join(base,'history.md'),'utf8'),/work:/);
});
test('finish squash one entry, pointer and merge, idempotence, abandonment, main return',()=>{
  const {dir,s,base}=fixture();save(s,'parent');s.branch({action:'create',branch:'done',topic:'finish topic',conversation_id:'c'});save(s,'branch-result');
  s.finish({summary:'merged result',history:'Decision and output.',conversation_id:'c'});
  s.finish({branch:'done',summary:'retry',history:'retry',conversation_id:'c'});
  const main=fs.readFileSync(path.join(base,'history.md'),'utf8');assert.equal(parseHistory(main).length,2);assert.match(main,/브랜치: done\n기록: work\/done\/history.md/);assert.doesNotMatch(main,/work:/);
  assert.equal(s.connection('c').branch,null);assert.match(s.inspect({action:'map',conversation_id:'c'}),/합쳐짐/);assert.match(s.inspect({action:'map',conversation_id:'c'}),/done \[끝남\]/);
  s.branch({action:'create',topic:'auto name',conversation_id:'c'});const name=s.connection('c').branch;assert.match(name,/^branch-/);
  s.branch({action:'abandon',reason:'User stopped this direction.',summary:'stopped',conversation_id:'c'});
  assert.match(fs.readFileSync(path.join(base,'history.md'),'utf8'),/상태: 중단[\s\S]+이유: User stopped/);assert.equal(s.connection('c').branch,null);
  assert.match(fs.readFileSync(path.join(base,'work',name,'history.md'),'utf8'),/상태: 중단/);
});
test('no parent checkpoints, branch-of-empty-branch, branch name safety',()=>{
  const {s,base}=fixture();s.branch({action:'create',branch:'empty',topic:'empty',conversation_id:'c'});
  assert.match(fs.readFileSync(path.join(base,'work/empty/history.md'),'utf8'),/갈래: demo\/메인@없음/);
  s.branch({action:'create',branch:'child',topic:'child',conversation_id:'c'});save(s,'child-first');assert.match(s.inspect({action:'map',conversation_id:'c'}),/부모 체크포인트 없음/);
  assert.throws(()=>s.branch({action:'create',branch:'../escape',topic:'bad',conversation_id:'c'}));assert.throws(()=>s.branch({action:'create',branch:'main',topic:'bad',conversation_id:'c'}));
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
  const original=fs.readFileSync(path.join(dir,'.head/state/conversations/claude-c.json'),'utf8');assert.match(s.start({conversation_id:'c'}).text,/자리: 메인/);assert.equal(fs.readFileSync(path.join(dir,'.head/state/conversations/claude-c.json'),'utf8'),original);
  const {sessions:oldSessions}=await import('/home/jywon/Dropbox/project/head-agent-core/packages/context/core/sessions.mjs');
  oldSessions(dir,{host:'claude'}).save({summary:'old MCP append',history:'old resident code',next:'cursor',conversation_id:'c'});
  const oldMcp=spawnSync(process.execPath,['/home/jywon/Dropbox/project/head-agent-core/packages/context/hosts/claude/mcp.mjs'],{env:{...process.env,CLAUDE_PROJECT_DIR:dir},input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'session_save',arguments:{conversation_id:'c',summary:'real old MCP',history:'stdio old process body',next:'old cursor'}}})+'\n',encoding:'utf8'});
  assert.equal(oldMcp.status,0);assert.equal(JSON.parse(oldMcp.stdout).result.isError,undefined);
  const data=withGraph(dir,g=>g.recent('demo','main',0));assert.equal(data.length,3);assert.equal(data[0].summary,'context_run old summary');assert.equal(data[1].summary,'old MCP append');assert.equal(data[2].summary,'real old MCP');
  assert.equal(withGraph(dir,g=>g.branches('demo').length),0);assert.match(s.load({conversation_id:'c'}),/자리: 메인/);assert.throws(()=>callTool(s,'session_save',{summary:'x',history:'y',work:'old'},'c'),/유효하지 않은 인자: work/);
  assert.doesNotThrow(()=>s.finish({conversation_id:'c'}));assert.doesNotThrow(()=>board(dir));assert.doesNotThrow(()=>renderBoard(board(dir),{all:true}));
});
test('other-session map does not rebind, load returns direction/map/body, MCP surface and old hook still run',()=>{
  const {dir,s}=fixture();save(s,'main');s.create({name:'other',context:'OTHER',conversation_id:'other'});save(s,'other','other');
  assert.match(s.inspect({action:'map',name:'other',conversation_id:'c'}),/other\/main/);assert.equal(s.connection('c').session,'demo');
  const loaded=s.load({conversation_id:'c'});assert.match(loaded,/DIRECTION_SECRET_19/);assert.match(loaded,/# 최근 기록/);assert.doesNotMatch(loaded,/# 지도:/);
  assert.match(callTool(s,'session_read',{action:'recent',count:1},'c'),/BODY_SECRET/);assert.throws(()=>callTool(s,'session_read',{action:'oops'},'c'));
  const hook=spawnSync(process.execPath,[path.resolve('scripts/hook.mjs')],{input:JSON.stringify({hook_event_name:'SessionStart',session_id:'c',source:'compact',cwd:dir}),env:{...process.env,CLAUDE_PROJECT_DIR:dir},encoding:'utf8'});
  assert.equal(hook.status,0);assert.equal(hook.stderr,'');assert.match(hook.stdout,/DIRECTION_SECRET_19/);assert.ok(hook.stdout.length<10000);
});
test('OpenCode adapter load, ID injection for new tools, state/child behavior remains',async()=>{
  const {dir,s}=fixture();const before=[process.env.HEAD_CONTEXT_SESSION,process.env.HEAD_CONTEXT_WORK];
  try{process.env.HEAD_CONTEXT_SESSION='demo';delete process.env.HEAD_CONTEXT_WORK;const hooks=await opencode.server({directory:dir,client:{session:{get:async({path})=>({data:{id:path.id,parentID:path.id==='ses_child'?'ses_parent':undefined}})}}});
    await hooks['chat.message']({sessionID:'ses_parent'});const out={system:[]};await hooks['experimental.chat.system.transform']({sessionID:'ses_parent'},out);assert.match(out.system.join('\n'),/DIRECTION_SECRET/);
    const args={action:'map'};await hooks['tool.execute.before']({sessionID:'ses_parent',tool:'head_context_session_read'},{args});assert.equal(args.conversation_id,'ses_parent');
    await hooks.event({event:{type:'session.created',properties:{info:{id:'ses_child',parentID:'ses_parent'}}}});await hooks.event({event:{type:'session.status',properties:{sessionID:'ses_child',status:{type:'busy'}}}});assert.equal(board(dir)[0].main.conversations.find(c=>c.host==='opencode').running_subtasks,1);
    await hooks.dispose();assert.equal(board(dir)[0].main.status,'stopped');
  }finally{for(const [i,key]of ['HEAD_CONTEXT_SESSION','HEAD_CONTEXT_WORK'].entries())if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];}
});
test('concurrent processes write the same file and index without losing or duplicating records',async()=>{
  const {dir,s}=fixture();const module=path.resolve('core/sessions.mjs');
  const code=`import {sessions} from ${JSON.stringify('file://'+module)};const s=sessions(process.argv[1],{host:'claude'});s.load({name:'demo',conversation_id:process.argv[2]});for(let i=0;i<8;i++)s.save({summary:process.argv[2]+'-'+i,history:'concurrent',next:'next',conversation_id:process.argv[2]});`;
  await Promise.all(Array.from({length:4},(_,i)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,dir,'child'+i],{stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',d=>error+=d);child.on('exit',c=>c===0?resolve():reject(new Error(error)));child.on('error',reject);})));assert.equal(withGraph(dir,g=>g.recent('demo','main',0).length),32);
  assert.equal(new Set(withGraph(dir,g=>g.recent('demo','main',0).map(e=>e.id))).size,32);assert.match(s.inspect({action:'map',conversation_id:'c',limit:4}),/그 앞 28개/);
});
