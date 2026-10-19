import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {sessions} from '../core/sessions.mjs';
import {ownerOf,hostInfo,liveConversations,transcriptsOf} from '../hosts/claude/process.mjs';
import {ancestry,copiedFrom} from '../hosts/claude/recovery.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT||os.tmpdir();
// A fixture of what Claude Code writes down: one registry file per running conversation
// (~/.claude/sessions), one record file per conversation (~/.claude/projects/<folder>),
// and for the desktop app its own record per conversation.
const stage=()=>{
  const dir=fs.mkdtempSync(path.join(root,'conversation-'));
  const registry=path.join(dir,'_registry'),projects=path.join(dir,'_projects'),desktop=path.join(dir,'_desktop','acct','org');
  fs.mkdirSync(registry);fs.mkdirSync(desktop,{recursive:true});
  Object.assign(process.env,{HEAD_CONTEXT_CLAUDE_SESSIONS:registry,HEAD_CONTEXT_CLAUDE_PROJECTS:projects,HEAD_CONTEXT_DESKTOP_SESSIONS:path.join(dir,'_desktop')});
  const records=transcriptsOf(dir);fs.mkdirSync(records,{recursive:true});
  const dead=spawnSync(process.execPath,['-e','0']).pid; // a pid that has already exited
  return {dir,registry,records,dead,
    running:(pid,id,extra={})=>fs.writeFileSync(path.join(registry,`${pid}.json`),JSON.stringify({pid,sessionId:id,cwd:dir,startedAt:Date.now(),entrypoint:'cli',name:'name-'+id,...extra})),
    stop:pid=>fs.rmSync(path.join(registry,`${pid}.json`),{force:true}),
    transcript:(id,lines=[{type:'user',sessionId:id,entrypoint:'cli'}],ageDays=0)=>{const file=path.join(records,`${id}.jsonl`);fs.writeFileSync(file,lines.map(l=>JSON.stringify(l)).join('\n')+'\n');const t=new Date(Date.now()-ageDays*86400000);fs.utimesSync(file,t,t);return file;},
    app:(id,host,extra={})=>fs.writeFileSync(path.join(desktop,`${host}.json`),JSON.stringify({cliSessionId:id,title:'앱 제목 '+id,...extra})),
    continues:(from,to)=>fs.appendFileSync(path.join(records,`${from}.jsonl`),JSON.stringify({type:'continued-in',sessionId:from,continuedInSessionId:to})+'\n')};
};
const after=()=>{for(const k of ['HEAD_CONTEXT_CLAUDE_SESSIONS','HEAD_CONTEXT_CLAUDE_PROJECTS','HEAD_CONTEXT_DESKTOP_SESSIONS'])delete process.env[k];};
const api=dir=>sessions(dir,{host:'claude',hostInfo,live:known=>liveConversations(dir,known)});
const begin=(s,st,id,{source='startup',lines,session_name}={})=>{
  const file=lines===null?path.join(st.records,`${id}.jsonl`):st.transcript(id,lines);
  const input={session_id:id,transcript_path:file,source};
  return s.start({conversation_id:id,source,session_name,origins:s.connection(id)?[]:ancestry(st.dir,input),info:{transcript_path:file}});
};

test('a new conversation is not placed on its own; a named session puts it on main; a known one keeps its place',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'D',conversation_id:'seed'});
  assert.equal(begin(s,st,'new1'),null);assert.equal(s.connection('new1'),null);
  const named=begin(s,st,'new2',{session_name:'demo'});assert.equal(named.stem,'main');assert.match(named.text,/# 작업 세션: demo/);
  s.branch({action:'create',branch:'job',conversation_id:'new2'});
  const compact=begin(s,st,'new2',{source:'compact',lines:null});assert.equal(compact.stem,'job');assert.match(compact.text,/이 대화의 작업 브랜치: job/);
  assert.equal(begin(s,st,'new2',{source:'resume',lines:null}).text,'');
  assert.equal(fs.readdirSync(path.join(st.dir,'.head/sessions/demo/work')).length,1);
});
test('the host is remembered on the connection: app id, pid, title, entrypoint',t=>{
  t.after(after);const st=stage(),s=api(st.dir);
  st.running(process.pid,'conv',{entrypoint:'claude-desktop',hostSessionId:'local_abc',name:'사이드바 제목'});
  s.create({name:'demo',context:'D',conversation_id:'conv'});
  assert.deepEqual(ownerOf('conv').hostSessionId,'local_abc');
  const c=s.connection('conv');assert.equal(c.host_session_id,'local_abc');assert.equal(c.pid,process.pid);assert.equal(c.title,'사이드바 제목');assert.equal(c.entrypoint,'claude-desktop');
});
test('/clear takes the place of the conversation the same process (or desktop app id) ran before',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'D',conversation_id:'old'});
  st.running(process.pid,'old');s.load({name:'demo',conversation_id:'old'});s.branch({action:'create',branch:'work1',conversation_id:'old'});
  st.running(process.pid,'new');
  const started=begin(s,st,'new',{source:'clear'});assert.equal(started.session,'demo');assert.equal(started.stem,'work1');
  assert.match(started.text,/이 대화의 작업 브랜치: work1/);
  // The desktop app keeps its app id across /clear while the pid may change.
  st.stop(process.pid);st.running(st.dead,'d-old',{hostSessionId:'local_same'});s.load({name:'demo',branch:'main',conversation_id:'d-old'});
  st.stop(st.dead);st.running(process.pid,'d-new',{hostSessionId:'local_same'});
  assert.equal(begin(s,st,'d-new',{source:'clear'}).stem,'main');
  assert.equal(begin(s,st,'other',{source:'startup'}),null); // not a /clear: nothing is carried over
});
test('a continued-in chain is one place however long it is',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'D',conversation_id:'a'});
  s.branch({action:'create',branch:'long',conversation_id:'a'});st.transcript('a');st.transcript('b');
  st.continues('a','b');st.continues('b','c');
  const started=begin(s,st,'c');assert.equal(started.stem,'long');assert.deepEqual(ancestry(st.dir,{session_id:'c',transcript_path:path.join(st.records,'c.jsonl')}).map(l=>l.kind),['continued','continued']);
});
test("a copy made by the host (side session fork) takes its parent's session and branch; a fork of a fork takes the nearest",t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'D',conversation_id:'parent'});
  s.branch({action:'create',branch:'pb',conversation_id:'parent'});
  const copied=[{type:'user',sessionId:'parent'},{type:'assistant',sessionId:'parent'},{type:'user',sessionId:'side'}];
  assert.equal(copiedFrom(st.transcript('side',copied),'side'),'parent');
  const side=begin(s,st,'side',{source:'resume',lines:copied});
  assert.equal(side.session,'demo');assert.equal(side.stem,'pb');assert.equal(side.text,''); // it already holds the context
  s.branch({action:'create',branch:'side-work',conversation_id:'side'});
  const nested=[...copied,{type:'assistant',sessionId:'side'},{type:'user',sessionId:'grand'}];
  assert.equal(begin(s,st,'grand',{source:'resume',lines:nested}).stem,'side-work');
  assert.equal(s.connection('parent').branch,'pb'); // the parent is never moved
  assert.equal(copiedFrom(st.transcript('plain'),'plain'),null);
});
test('the start hook: a fork or subagent start is skipped, a tool call gets the conversation and the agent id',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'HOOK DIRECTION',conversation_id:'c'});
  const run=input=>spawnSync(process.execPath,[path.resolve('scripts/hook.mjs')],{input:JSON.stringify(input),env:{...process.env,CLAUDE_PROJECT_DIR:st.dir,HEAD_CONTEXT_SESSION:''},encoding:'utf8'});
  const start=run({hook_event_name:'SessionStart',session_id:'c',source:'compact',cwd:st.dir});assert.equal(start.stderr,'');assert.match(start.stdout,/HOOK DIRECTION/);
  assert.equal(run({hook_event_name:'SessionStart',session_id:'c',agent_id:'a1',source:'startup',cwd:st.dir}).stdout,'');
  const plain=JSON.parse(run({hook_event_name:'PreToolUse',session_id:'c',tool_name:'mcp__plugin_head-context_context__session_save',tool_input:{summary:'s',agent_id:'forged'},cwd:st.dir}).stdout).hookSpecificOutput.updatedInput;
  assert.deepEqual(plain,{summary:'s',conversation_id:'c'});
  const fork=JSON.parse(run({hook_event_name:'PreToolUse',session_id:'c',agent_id:'abb2338b',agent_type:'fork',tool_name:'mcp__plugin_head-context_context__session_read',tool_input:{action:'map'},cwd:st.dir}).stdout).hookSpecificOutput.updatedInput;
  assert.deepEqual(fork,{action:'map',conversation_id:'c',agent_id:'abb2338b'});
  assert.equal(run({hook_event_name:'PreToolUse',session_id:'c',tool_name:'mcp__plugin_head-context_context__project_setup',tool_input:{action:'setup'},cwd:st.dir}).stdout,'');
  for(const e of ['Stop','SessionEnd','UserPromptSubmit'])assert.equal(run({hook_event_name:e,session_id:'c',cwd:st.dir}).stdout,'');
  assert.deepEqual(fs.readdirSync(path.join(st.dir,'.head/state')),['conversations']); // no activity, no subtasks
});
test('alive conversations: a running process anywhere, a desktop conversation active within 7 days; listed under session and branch',t=>{
  t.after(after);const st=stage(),s=api(st.dir);
  s.create({name:'demo',context:'D',conversation_id:'cli-on'});s.branch({action:'create',branch:'job',conversation_id:'cli-on'});
  st.running(process.pid,'cli-on');st.transcript('cli-on');
  s.load({name:'demo',conversation_id:'cli-off'});st.transcript('cli-off'); // CLI, no process: gone
  st.running(st.dead,'cli-dead');st.transcript('cli-dead'); // registry left behind by a crash
  const desk=[{type:'user',sessionId:'desk',entrypoint:'claude-desktop'}];
  s.load({name:'demo',conversation_id:'desk'});st.transcript('desk',desk,2);st.app('desk','local_desk');
  st.transcript('desk-old',[{type:'user',sessionId:'desk-old',entrypoint:'claude-desktop'}],8);st.app('desk-old','local_old');
  st.transcript('desk-loose',[{type:'user',sessionId:'desk-loose',entrypoint:'claude-desktop'}],1);
  st.transcript('desk-archived',[{type:'user',sessionId:'desk-archived',entrypoint:'claude-desktop'}],1);st.app('desk-archived','local_arch',{isArchived:true});
  st.running(process.pid+100000,'elsewhere',{cwd:'/'}); // another folder
  const ids=liveConversations(st.dir).map(c=>c.conversation_id).sort();
  assert.deepEqual(ids,['cli-on','desk','desk-loose']);
  const out=s.conversations({conversation_id:'cli-on'});
  assert.match(out,/## demo\n- 대화 "앱 제목 desk" · 주소: local_desk · 마지막 [^\n]+\n- 작업 브랜치 job\n  - 대화 "name-cli-on" · 주소: name-cli-on · 마지막 [^\n]+ \(이 대화\)/);
  assert.match(out,/## 작업 세션 없음\n- 대화 "desk-loo" · 주소: \(모름\)/);
  assert.match(s.conversations({name:'demo'}),/## demo/);assert.doesNotMatch(s.conversations({name:'demo'}),/작업 세션 없음/);
  // After the branch closes its conversations show under the session.
  s.save({summary:'끝',history:'x',recap:'r',conversation_id:'cli-on'});
  assert.match(s.conversations({}),/## demo\n- 대화 "name-cli-on"/);
});
test('a start is never blocked by a registry that is missing, empty or in another shape',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'D',conversation_id:'c'});
  fs.writeFileSync(path.join(st.registry,'1.json'),'not json');fs.writeFileSync(path.join(st.registry,'2.json'),'{"pid":"x"}');
  assert.doesNotThrow(()=>liveConversations(st.dir));assert.equal(begin(s,st,'c',{source:'compact'}).session,'demo');
  process.env.HEAD_CONTEXT_CLAUDE_SESSIONS=path.join(st.dir,'missing');assert.deepEqual(liveConversations(st.dir),[]);
});
