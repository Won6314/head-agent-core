import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {runStart} from './hook-run.mjs';
import {sessions} from '../core/sessions.mjs';
import {callTool} from '../core/mcp.mjs';
import {CORE_SOURCE,SURVEY_SOURCE,firstRun,guide,refreshCore} from '../core/project.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT||os.tmpdir();
const fresh=()=>fs.mkdtempSync(path.join(root,'first-run-'));
const core=fs.readFileSync(CORE_SOURCE,'utf8');
const tool=(dir,args)=>callTool(sessions(dir),'setup',args,undefined,dir);
const read=(dir,f)=>fs.readFileSync(path.join(dir,f),'utf8');
const hook=(dir,{id='c1',source='startup',session}={})=>runStart({session_id:id,source,cwd:dir},{env:{CLAUDE_PROJECT_DIR:dir,HEAD_CONTEXT_SESSION:session||''}}).text;
// An unconnected conversation gets one line first; the first-run guide follows it.
const guidePart=s=>s.replace('이 대화는 아직 작업 세션에 연결되지 않았습니다.','').trim();
const mcp=(dir,args)=>{const r=spawnSync(process.execPath,[path.resolve('scripts/mcp.mjs')],{env:{...process.env,CLAUDE_PROJECT_DIR:dir},input:[{jsonrpc:'2.0',id:1,method:'tools/list'},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'setup',arguments:args}}].map(m=>JSON.stringify(m)).join('\n')+'\n',encoding:'utf8'});return r.stdout.trim().split('\n').map(l=>JSON.parse(l));};

test('fresh project: start hook asks setup on startup/clear only, setup writes the core copy, leaves CLAUDE.md alone and returns the core',()=>{
  const dir=fresh();
  assert.match(hook(dir),/초기설정 해도 될까요/);assert.match(hook(dir,{source:'clear'}),/초기설정 해도 될까요/);
  assert.equal(guidePart(hook(dir,{source:'resume'})),'');assert.equal(guidePart(hook(dir,{source:'compact'})),'');
  assert.equal(fs.existsSync(path.join(dir,'CLAUDE.md')),false);
  const out=tool(dir,{action:'setup'});
  assert.ok(out.includes(core.trimEnd()));assert.match(out,/\(HEAD Core 1\/1 — 초기설정이 돌려준 코어\)$/);assert.match(out,/새로 만들었습니다/);
  assert.equal(read(dir,'.head/core.md'),core);assert.equal(fs.existsSync(path.join(dir,'CLAUDE.md')),false);
  assert.deepEqual(firstRun(dir),{setup:'done',survey:null});
  assert.equal(guidePart(hook(dir)),'');assert.equal(guide(dir),'');
  tool(dir,{action:'setup'});assert.equal(fs.existsSync(path.join(dir,'CLAUDE.md')),false);
});
test('setup keeps an existing CLAUDE.md untouched and other config keys',()=>{
  const dir=fresh();fs.mkdirSync(path.join(dir,'.head'));
  fs.writeFileSync(path.join(dir,'.head/config.json'),JSON.stringify({sessions_dir:'sessions'}));
  fs.writeFileSync(path.join(dir,'CLAUDE.md'),'# Mine\n\nkeep this');
  assert.doesNotMatch(tool(dir,{action:'setup'}),/CLAUDE\.md/);
  assert.equal(read(dir,'CLAUDE.md'),'# Mine\n\nkeep this');
  assert.deepEqual(JSON.parse(read(dir,'.head/config.json')),{sessions_dir:'sessions',first_run:{setup:'done'}});
});
test('declining: never_ask stops the question; not recording asks again next start',()=>{
  const dir=fresh();
  assert.match(hook(dir),/다시는 묻지 않을까요/);assert.match(hook(dir,{id:'c2'}),/초기설정 해도 될까요/);
  assert.match(tool(dir,{action:'never_ask',step:'setup'}),/다시 묻지 않습니다/);
  assert.deepEqual(firstRun(dir),{setup:'never_ask',survey:null});assert.equal(guidePart(hook(dir,{id:'c3'})),'');
  assert.equal(fs.existsSync(path.join(dir,'CLAUDE.md')),false);assert.equal(fs.existsSync(path.join(dir,'.head/core.md')),false);
  assert.throws(()=>tool(dir,{action:'never_ask'}),/step/);assert.throws(()=>tool(dir,{action:'bogus'}),/유효하지 않은 인자: action/);
});
test('start refreshes .head/core.md from the plugin only after setup',()=>{
  const dir=fresh();hook(dir);assert.equal(fs.existsSync(path.join(dir,'.head/core.md')),false);assert.equal(refreshCore(dir),false);
  tool(dir,{action:'setup'});fs.writeFileSync(path.join(dir,'.head/core.md'),'OLD CORE');
  hook(dir,{source:'resume'});assert.equal(read(dir,'.head/core.md'),core);assert.equal(refreshCore(dir),false);
});
test('survey is asked only after setup and only when the plugin carries its procedure',()=>{
  const dir=fresh();tool(dir,{action:'setup'});assert.equal(fs.existsSync(SURVEY_SOURCE),false);assert.equal(guidePart(hook(dir)),'');
  fs.writeFileSync(SURVEY_SOURCE,'SURVEY PROCEDURE');
  try{
    assert.match(hook(dir),/프로젝트 조사해볼까요/);
    const other=fresh();assert.match(hook(other),/초기설정 해도 될까요/);assert.doesNotMatch(hook(other),/프로젝트 조사/);
    assert.match(tool(other,{action:'setup'}),/이어서 "프로젝트 조사해볼까요\?"/);
    tool(dir,{action:'survey_done'});assert.deepEqual(firstRun(dir),{setup:'done',survey:'done'});assert.equal(guidePart(hook(dir)),'');
    tool(other,{action:'never_ask',step:'survey'});assert.equal(guidePart(hook(other)),'');
  }finally{fs.rmSync(SURVEY_SOURCE,{force:true});}
});
test('guide rides with the work session part, also when the work context is over the cap',()=>{
  const dir=fresh(),s=sessions(dir);s.create({name:'demo',context:'FIRST RUN DIRECTION',conversation_id:'seed'});
  const small=hook(dir,{id:'small',session:'demo'});assert.match(small,/FIRST RUN DIRECTION/);assert.match(small,/초기설정 해도 될까요/);
  s.branch({action:'create',branch:'big',conversation_id:'seed'});
  for(let i=0;i<5;i++)s.save({summary:'BIG-'+i,history:'긴 본문 '.repeat(800),next:'더',conversation_id:'seed'});
  // The conversation on the branch with the big records is the one whose context runs over the cap.
  const {parts}=runStart({session_id:'seed',source:'startup',cwd:dir},{env:{CLAUDE_PROJECT_DIR:dir,HEAD_CONTEXT_SESSION:'demo'}});
  assert.match(parts.session,/FIRST RUN DIRECTION[\s\S]*이 대화의 작업 브랜치: big[\s\S]*초기설정 해도 될까요/);
  assert.match(parts.context,/## 이 작업 브랜치의 최근 기록: big/);assert.ok(parts.context.length<=9000);assert.equal(parts.recent,'');
});
test('setup turns the built-in fork on in the project settings, keeping what is there',()=>{
  const settings=dir=>JSON.parse(read(dir,'.claude/settings.json'));
  const one=fresh();assert.match(tool(one,{action:'setup'}),/env\.CLAUDE_CODE_FORK_SUBAGENT="1"\(기본 포크 켜기\): 새로 만들었습니다/);
  const market={'head-agent-core':{source:{source:'github',repo:'Won6314/head-agent-core'},autoUpdate:true}},plugins={'head-context@head-agent-core':true};
  assert.deepEqual(settings(one),{env:{CLAUDE_CODE_FORK_SUBAGENT:'1'},extraKnownMarketplaces:market,enabledPlugins:plugins});
  assert.match(tool(one,{action:'setup'}),/마켓 head-agent-core\(GitHub Won6314\/head-agent-core, 자동 업데이트\)와 enabledPlugins\."head-context@head-agent-core": 마켓은 이미 있어 그대로 두었습니다, 플러그인 켜기는 이미 있어\(true\) 그대로 두었습니다/);
  assert.match(tool(one,{action:'setup'}),/기본 포크 켜기\): 이미 있어 그대로 두었습니다/);
  const two=fresh();fs.mkdirSync(path.join(two,'.claude'));fs.writeFileSync(path.join(two,'.claude/settings.json'),JSON.stringify({permissions:{allow:['Bash(ls)']},env:{OTHER:'x'}}));
  assert.match(tool(two,{action:'setup'}),/기존 설정에 env 한 줄을 더했습니다/);
  assert.deepEqual(settings(two),{permissions:{allow:['Bash(ls)']},env:{OTHER:'x',CLAUDE_CODE_FORK_SUBAGENT:'1'},extraKnownMarketplaces:market,enabledPlugins:plugins});
  const three=fresh();fs.mkdirSync(path.join(three,'.claude'));fs.writeFileSync(path.join(three,'.claude/settings.json'),JSON.stringify({env:{CLAUDE_CODE_FORK_SUBAGENT:'0'}}));
  assert.match(tool(three,{action:'setup'}),/이미 다른 값\("0"\)이 있어 그대로/);assert.deepEqual(settings(three),{env:{CLAUDE_CODE_FORK_SUBAGENT:'0'},extraKnownMarketplaces:market,enabledPlugins:plugins});
  // A project that already names the marketplace (another source) or turned the plugin off keeps that.
  const five=fresh();fs.mkdirSync(path.join(five,'.claude'));fs.writeFileSync(path.join(five,'.claude/settings.json'),JSON.stringify({extraKnownMarketplaces:{'head-agent-core':{source:{source:'directory',path:'/x'}}},enabledPlugins:{'head-context@head-agent-core':false}}));
  assert.match(tool(five,{action:'setup'}),/마켓은 이미 있어 그대로 두었습니다, 플러그인 켜기는 이미 있어\(false\) 그대로 두었습니다/);
  assert.deepEqual(settings(five),{extraKnownMarketplaces:{'head-agent-core':{source:{source:'directory',path:'/x'}}},enabledPlugins:{'head-context@head-agent-core':false},env:{CLAUDE_CODE_FORK_SUBAGENT:'1'}});
  // `claude plugin marketplace add` leaves the GitHub entry without autoUpdate; setup adds it, an explicit false stays.
  const six=fresh();fs.mkdirSync(path.join(six,'.claude'));fs.writeFileSync(path.join(six,'.claude/settings.json'),JSON.stringify({extraKnownMarketplaces:{'head-agent-core':{source:{source:'github',repo:'Won6314/head-agent-core'}}},enabledPlugins:plugins}));
  assert.match(tool(six,{action:'setup'}),/마켓에 자동 업데이트를 더했습니다, 플러그인 켜기는 이미 있어\(true\) 그대로 두었습니다/);
  assert.deepEqual(settings(six),{extraKnownMarketplaces:market,enabledPlugins:plugins,env:{CLAUDE_CODE_FORK_SUBAGENT:'1'}});
  const seven=fresh();fs.mkdirSync(path.join(seven,'.claude'));fs.writeFileSync(path.join(seven,'.claude/settings.json'),JSON.stringify({extraKnownMarketplaces:{'head-agent-core':{source:{source:'github',repo:'Won6314/head-agent-core'},autoUpdate:false}}}));
  assert.match(tool(seven,{action:'setup'}),/마켓은 이미 있어 그대로 두었습니다/);assert.equal(settings(seven).extraKnownMarketplaces['head-agent-core'].autoUpdate,false);
  const four=fresh();fs.mkdirSync(path.join(four,'.claude'));fs.writeFileSync(path.join(four,'.claude/settings.json'),'{ broken');
  assert.match(tool(four,{action:'setup'}),/읽을 수 없는 JSON이라 고치지 않았습니다[^\n]*\n[^\n]*읽을 수 없는 JSON이라 고치지 않았습니다\. 자동 업데이트를 받으려면/);assert.equal(read(four,'.claude/settings.json'),'{ broken');assert.equal(firstRun(four).setup,'done');
});
test('real MCP process lists setup and runs it in CLAUDE_PROJECT_DIR',()=>{
  const dir=fresh(),[list,call]=mcp(dir,{action:'setup'});
  assert.deepEqual(fs.readdirSync(path.resolve('skills')),['start-job']); // one skill the model loads; none for the user to type
  assert.doesNotMatch(fs.readFileSync(path.resolve('skills/start-job/SKILL.md'),'utf8'),/disable-model-invocation|argument-hint/);
  const def=list.result.tools.find(t=>t.name==='setup');assert.ok(def);assert.equal('conversation_id' in def.inputSchema.properties,false);
  assert.equal(call.result.isError,undefined);assert.ok(call.result.content[0].text.includes(core.trimEnd()));assert.equal(fs.existsSync(path.join(dir,'CLAUDE.md')),false);
});

