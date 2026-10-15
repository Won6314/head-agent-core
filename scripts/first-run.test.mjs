import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {sessions} from '../core/sessions.mjs';
import {callTool} from '../core/mcp.mjs';
import {CORE_SOURCE,SURVEY_SOURCE,firstRun,guide,refreshCore} from '../core/project.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT||os.tmpdir();
const fresh=()=>fs.mkdtempSync(path.join(root,'first-run-'));
const core=fs.readFileSync(CORE_SOURCE,'utf8');
const tool=(dir,args)=>callTool(sessions(dir),'project_setup',args,undefined,dir);
const read=(dir,f)=>fs.readFileSync(path.join(dir,f),'utf8');
const hook=(dir,{id='c1',source='startup',session}={})=>{const r=spawnSync(process.execPath,[path.resolve('scripts/hook.mjs')],{input:JSON.stringify({hook_event_name:'SessionStart',session_id:id,source,cwd:dir}),env:{...process.env,CLAUDE_PROJECT_DIR:dir,HEAD_CONTEXT_SESSION:session||''},encoding:'utf8'});assert.equal(r.status,0);assert.equal(r.stderr,'');return r.stdout?JSON.parse(r.stdout).hookSpecificOutput.additionalContext:'';};
const mcp=(dir,args)=>{const r=spawnSync(process.execPath,[path.resolve('scripts/mcp.mjs')],{env:{...process.env,CLAUDE_PROJECT_DIR:dir},input:[{jsonrpc:'2.0',id:1,method:'tools/list'},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'project_setup',arguments:args}}].map(m=>JSON.stringify(m)).join('\n')+'\n',encoding:'utf8'});return r.stdout.trim().split('\n').map(l=>JSON.parse(l));};

test('fresh project: start hook asks setup on startup/clear only, setup writes core + one CLAUDE.md line and returns the core',()=>{
  const dir=fresh();
  assert.match(hook(dir),/초기설정 해도 될까요/);assert.match(hook(dir,{source:'clear'}),/초기설정 해도 될까요/);
  assert.equal(hook(dir,{source:'resume'}),'');assert.equal(hook(dir,{source:'compact'}),'');
  assert.equal(fs.existsSync(path.join(dir,'CLAUDE.md')),false);
  const out=tool(dir,{action:'setup'});
  assert.ok(out.endsWith(core));assert.match(out,/새로 만들었습니다/);
  assert.equal(read(dir,'.head/core.md'),core);assert.equal(read(dir,'CLAUDE.md'),'@.head/core.md\n');
  assert.deepEqual(firstRun(dir),{setup:'done',survey:null});
  assert.equal(hook(dir),'');assert.equal(guide(dir),'');
  tool(dir,{action:'setup'});assert.equal(read(dir,'CLAUDE.md'),'@.head/core.md\n');
});
test('setup keeps an existing CLAUDE.md and other config keys, adds the line once',()=>{
  const dir=fresh();fs.mkdirSync(path.join(dir,'.head'));
  fs.writeFileSync(path.join(dir,'.head/config.json'),JSON.stringify({sessions_dir:'sessions'}));
  fs.writeFileSync(path.join(dir,'CLAUDE.md'),'# Mine\n\nkeep this');
  assert.match(tool(dir,{action:'setup'}),/기존 내용 끝에 한 줄을 더했습니다/);
  assert.equal(read(dir,'CLAUDE.md'),'# Mine\n\nkeep this\n\n@.head/core.md\n');
  assert.match(tool(dir,{action:'setup'}),/이미 있어 그대로/);assert.equal(read(dir,'CLAUDE.md'),'# Mine\n\nkeep this\n\n@.head/core.md\n');
  assert.deepEqual(JSON.parse(read(dir,'.head/config.json')),{sessions_dir:'sessions',first_run:{setup:'done'}});
});
test('declining: never_ask stops the question; not recording asks again next start',()=>{
  const dir=fresh();
  assert.match(hook(dir),/다시는 묻지 않을까요/);assert.match(hook(dir,{id:'c2'}),/초기설정 해도 될까요/);
  assert.match(tool(dir,{action:'never_ask',step:'setup'}),/다시 묻지 않습니다/);
  assert.deepEqual(firstRun(dir),{setup:'never_ask',survey:null});assert.equal(hook(dir,{id:'c3'}),'');
  assert.equal(fs.existsSync(path.join(dir,'CLAUDE.md')),false);assert.equal(fs.existsSync(path.join(dir,'.head/core.md')),false);
  assert.throws(()=>tool(dir,{action:'never_ask'}),/step/);assert.throws(()=>tool(dir,{action:'bogus'}),/유효하지 않은 인자: action/);
});
test('start refreshes .head/core.md from the plugin only after setup',()=>{
  const dir=fresh();hook(dir);assert.equal(fs.existsSync(path.join(dir,'.head/core.md')),false);assert.equal(refreshCore(dir),false);
  tool(dir,{action:'setup'});fs.writeFileSync(path.join(dir,'.head/core.md'),'OLD CORE');
  hook(dir,{source:'resume'});assert.equal(read(dir,'.head/core.md'),core);assert.equal(refreshCore(dir),false);
});
test('survey is asked only after setup and only when the plugin carries its procedure',()=>{
  const dir=fresh();tool(dir,{action:'setup'});assert.equal(fs.existsSync(SURVEY_SOURCE),false);assert.equal(hook(dir),'');
  fs.writeFileSync(SURVEY_SOURCE,'SURVEY PROCEDURE');
  try{
    assert.match(hook(dir),/프로젝트 조사해볼까요/);
    const other=fresh();assert.match(hook(other),/초기설정 해도 될까요/);assert.doesNotMatch(hook(other),/프로젝트 조사/);
    assert.match(tool(other,{action:'setup'}),/이어서 "프로젝트 조사해볼까요\?"/);
    tool(dir,{action:'survey_done'});assert.deepEqual(firstRun(dir),{setup:'done',survey:'done'});assert.equal(hook(dir),'');
    tool(other,{action:'never_ask',step:'survey'});assert.equal(hook(other),'');
  }finally{fs.rmSync(SURVEY_SOURCE,{force:true});}
});
test('guide rides with the session identity, also when the identity goes to the channel',()=>{
  const dir=fresh(),s=sessions(dir);s.create({name:'demo',context:'FIRST RUN DIRECTION',conversation_id:'seed'});
  const small=hook(dir,{id:'small',session:'demo'});assert.match(small,/FIRST RUN DIRECTION/);assert.match(small,/초기설정 해도 될까요/);
  for(let i=0;i<5;i++)s.save({summary:'BIG-'+i,history:'긴 본문 '.repeat(500),conversation_id:'seed'});
  const big=hook(dir,{id:'big',session:'demo'});assert.match(big,/채널 메시지로 이어서/);assert.match(big,/초기설정 해도 될까요/);assert.ok(JSON.stringify(big).length<9000);
});
test('real MCP process lists project_setup and runs it in CLAUDE_PROJECT_DIR',()=>{
  const dir=fresh(),[list,call]=mcp(dir,{action:'setup'});
  const def=list.result.tools.find(t=>t.name==='project_setup');assert.ok(def);assert.equal('conversation_id' in def.inputSchema.properties,false);
  assert.equal(call.result.isError,undefined);assert.ok(call.result.content[0].text.endsWith(core));assert.equal(read(dir,'CLAUDE.md'),'@.head/core.md\n');
});
