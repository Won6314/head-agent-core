import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
import {sessions} from '../core/sessions.mjs';
import {ownerOf,hostInfo,liveConversations,transcriptsOf} from '../hosts/claude/process.mjs';
import {ancestry,copiedFrom} from '../hosts/claude/recovery.mjs';
import {runStart} from './hook-run.mjs';
import {SUBAGENT_NOTICE} from '../core/mcp.mjs';
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
  const named=begin(s,st,'new2',{session_name:'demo'});assert.equal(named.stem,'main');assert.match(s.identity({conversation_id:'new2'}),/# 작업 세션: demo/);
  s.branch({action:'create',branch:'job',conversation_id:'new2'});
  const compact=begin(s,st,'new2',{source:'compact',lines:null});assert.equal(compact.stem,'job');assert.match(s.identity({conversation_id:'new2'}),/이 대화의 작업 브랜치: job/);
  assert.equal(begin(s,st,'new2',{source:'resume',lines:null}).stem,'job');
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
  assert.match(s.identity({conversation_id:'new'}),/이 대화의 작업 브랜치: work1/);
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
  assert.equal(side.session,'demo');assert.equal(side.stem,'pb');assert.equal(side.from.kind,'copy');
  s.branch({action:'create',branch:'side-work',conversation_id:'side'});
  const nested=[...copied,{type:'assistant',sessionId:'side'},{type:'user',sessionId:'grand'}];
  assert.equal(begin(s,st,'grand',{source:'resume',lines:nested}).stem,'side-work');
  assert.equal(s.connection('parent').branch,'pb'); // the parent is never moved
  assert.equal(copiedFrom(st.transcript('plain'),'plain'),null);
});
test('the start hook: a fork or subagent start is skipped, a tool call gets the conversation and the agent id',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'HOOK DIRECTION',conversation_id:'c'});
  const run=input=>spawnSync(process.execPath,[path.resolve('scripts/hook.mjs')],{input:JSON.stringify(input),env:{...process.env,CLAUDE_PROJECT_DIR:st.dir,HEAD_CONTEXT_SESSION:''},encoding:'utf8'});
  const env={env:{CLAUDE_PROJECT_DIR:st.dir}};
  assert.match(runStart({session_id:'c',source:'compact',cwd:st.dir},env).parts.session,/HOOK DIRECTION/);
  assert.equal(runStart({session_id:'c',agent_id:'a1',source:'startup',cwd:st.dir},env).text,'');
  assert.equal(runStart({session_id:'c',source:'resume',cwd:st.dir},env).text,''); // a resume already holds its context
  assert.match(run({hook_event_name:'PreCompact',session_id:'c',cwd:st.dir}).stdout,/^OVERRIDE FOR THIS SUMMARY[\s\S]*이전 대화는 요약하지 않는다\. 압축 직전의 최근 대화/);
  const plain=JSON.parse(run({hook_event_name:'PreToolUse',session_id:'c',tool_name:'mcp__plugin_head-context_context__session_save',tool_input:{summary:'s',agent_id:'forged'},cwd:st.dir}).stdout).hookSpecificOutput.updatedInput;
  assert.deepEqual(plain,{summary:'s',conversation_id:'c'});
  const fork=JSON.parse(run({hook_event_name:'PreToolUse',session_id:'c',agent_id:'abb2338b',agent_type:'fork',tool_name:'mcp__plugin_head-context_context__session_read',tool_input:{action:'map'},cwd:st.dir}).stdout).hookSpecificOutput.updatedInput;
  assert.deepEqual(fork,{action:'map',conversation_id:'c',agent_id:'abb2338b'});
  assert.equal(run({hook_event_name:'PreToolUse',session_id:'c',tool_name:'mcp__plugin_head-context_context__project_setup',tool_input:{action:'setup'},cwd:st.dir}).stdout,'');
  for(const e of ['Stop','SessionEnd','UserPromptSubmit'])assert.equal(run({hook_event_name:e,session_id:'c',cwd:st.dir}).stdout,'');
  for(const agent_type of ['fork','general-purpose']){
    const sub=JSON.parse(run({hook_event_name:'SubagentStart',session_id:'c',agent_id:'a9',agent_type,cwd:st.dir}).stdout).hookSpecificOutput;
    assert.equal(sub.hookEventName,'SubagentStart');assert.equal(sub.additionalContext,SUBAGENT_NOTICE);
  }
  assert.doesNotMatch(SUBAGENT_NOTICE,/포크|기본/);assert.match(SUBAGENT_NOTICE,/읽기만 됩니다/);
  const hooks=JSON.parse(fs.readFileSync(path.resolve('hooks/hooks.json'),'utf8')).hooks;assert.ok(hooks.SubagentStart);
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
  assert.match(out,/## demo\n- 메인\n  - 이름 앱 제목 desk · 보낼 곳 local_desk · 사람 · 마지막 [^\n]+\n    하는 일: [^\n]+\n- 작업 브랜치 job\n  - 이름 name-cli-on · 보낼 곳 name-cli-on · [^\n]*마지막 [^\n]+ \(이 대화\)\n    하는 일: 주제: job/);
  assert.match(out,/## 작업 세션 없음\n- 보낼 곳 \(모름\) · 사람/);
  assert.match(s.conversations({name:'demo'}),/## demo/);assert.doesNotMatch(s.conversations({name:'demo'}),/작업 세션 없음/);
  // After the branch closes its conversations show under the session.
  s.save({summary:'끝',history:'x',recap:'r',conversation_id:'cli-on'});
  assert.match(s.conversations({}),/## demo\n- 메인\n  - 이름 name-cli-on/);
});
test('a start is never blocked by a registry that is missing, empty or in another shape',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'D',conversation_id:'c'});
  fs.writeFileSync(path.join(st.registry,'1.json'),'not json');fs.writeFileSync(path.join(st.registry,'2.json'),'{"pid":"x"}');
  assert.doesNotThrow(()=>liveConversations(st.dir));assert.equal(begin(s,st,'c',{source:'compact'}).session,'demo');
  process.env.HEAD_CONTEXT_CLAUDE_SESSIONS=path.join(st.dir,'missing');assert.deepEqual(liveConversations(st.dir),[]);
});

// A record file the way Claude Code writes one, trimmed to what the recent part reads.
const said=(id,text,at)=>({type:'user',sessionId:id,timestamp:at,message:{role:'user',content:text}});
const shown=(id,text)=>({type:'assistant',sessionId:id,message:{role:'assistant',content:[{type:'text',text}]}});
const busy=id=>[{type:'assistant',sessionId:id,message:{role:'assistant',content:[{type:'thinking',thinking:'SECRET-THINKING'},{type:'tool_use',id:'t1',name:'Bash',input:{command:'SECRET-CMD'}}]}},
  {type:'user',sessionId:id,message:{role:'user',content:[{type:'tool_result',tool_use_id:'t1',content:'SECRET-RESULT'}]}}];
test('the three start parts: the work session always, the work context, and after a compact the last five exchanges as said',t=>{
  t.after(after);const st=stage(),s=api(st.dir);
  s.create({name:'demo',context:'# demo\n\nCONTEXT-HEAD '+'긴 목적 '.repeat(2000)+' CONTEXT-TAIL',conversation_id:'c'});
  s.branch({action:'create',branch:'job',conversation_id:'c'});s.save({summary:'job 1',history:'JOB-BODY',next:'job next',conversation_id:'c'});s.todo({action:'add',text:'TODO-ONE',conversation_id:'c'});
  const at=i=>`2026-10-19T0${i}:00:00.000Z`;
  const lines=[said('c','EARLY-WORDS',at(0)),shown('c','early answer')];
  for(let i=1;i<=7;i++)lines.push(said('c',`ASK-${i}`,at(i)),...busy('c'),shown('c',`ANSWER-${i}`));
  lines.push({type:'user',sessionId:'c',isMeta:true,message:{role:'user',content:'META-TEXT'}},said('c','<command-name>/model</command-name>',at(8)),said('c','<task-notification>NOTICE</task-notification>',at(8)),
    {type:'user',sessionId:'c',message:{role:'user',content:[{type:'text',text:'ASK-8'},{type:'text',text:'<system-reminder>REMINDER</system-reminder>'}]},timestamp:at(8)},
    {type:'attachment',sessionId:'c',timestamp:at(8),attachment:{type:'queued_command',prompt:'MIDTURN-WORDS',humanTurn:true,origin:{kind:'human'}}},
    {type:'attachment',sessionId:'c',timestamp:at(8),attachment:{type:'queued_command',prompt:'<task-notification>X</task-notification>'}},shown('c','ANSWER-8'),
    {type:'assistant',sessionId:'c',message:{role:'assistant',content:[{type:'tool_use',id:'q1',name:'AskUserQuestion',input:{}}]}},
    {type:'user',sessionId:'c',timestamp:at(9),message:{role:'user',content:[{type:'tool_result',tool_use_id:'q1',content:'The user answered: "어느 쪽?"="왼쪽". Read the answers carefully — they may request clarification.'}]}},shown('c','ANSWER-9'),
    {type:'system',subtype:'compact_boundary',sessionId:'c'},{type:'user',sessionId:'c',isCompactSummary:true,message:{role:'user',content:'SUMMARY-TEXT'}});
  const file=st.transcript('c',lines);
  const {parts}=runStart({session_id:'c',source:'compact',cwd:st.dir,transcript_path:file},{env:{CLAUDE_PROJECT_DIR:st.dir}});
  assert.ok(parts.session.length<=9000);assert.match(parts.session,/^# 작업 세션: demo\n# demo\n\nCONTEXT-HEAD/);
  assert.match(parts.session,/…\(context\.md 뒷부분 생략 — 전문: [^\n]+demo\/context\.md\)$/);assert.doesNotMatch(parts.session,/CONTEXT-TAIL/);
  assert.match(parts.context,/^## 열린 작업 브랜치 \(1\)\n[\s\S]*\n## 할 일 [\s\S]*\n## 흐름 [\s\S]*\n## 이 작업 브랜치의 최근 기록: job\n[\s\S]*JOB-BODY\n\n다음: job next$/);
  const r=parts.recent;
  assert.match(r,/^# 최근 대화 \(직전 주고받기 5번, 원문\)\n/);
  for(const kept of ['ASK-6','ANSWER-6','ASK-7','ASK-8','MIDTURN-WORDS','ANSWER-8','(질문 창 답) The user answered: "어느 쪽?"="왼쪽".','ANSWER-9'])assert.ok(r.includes(kept),kept);
  for(const gone of ['EARLY-WORDS','ASK-5','ANSWER-5','SECRET-','META-TEXT','/model','NOTICE','REMINDER','<task-notification>','Read the answers carefully','SUMMARY-TEXT'])assert.ok(!r.includes(gone),gone);
  assert.match(r,/## 5 · 사용자 [^\n]+\n\(질문 창 답\)[^\n]+\n\n## 5 · 답\nANSWER-9$/);
  // A fresh start and a resume put no recent exchanges back.
  assert.equal(runStart({session_id:'c',source:'startup',cwd:st.dir,transcript_path:file},{env:{CLAUDE_PROJECT_DIR:st.dir}}).parts.recent,'');
});
test('after /clear the recent exchanges come from the conversation /clear replaced; over the cap the oldest go first and the file is named',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'D',conversation_id:'old'});
  const lines=[];for(let i=1;i<=5;i++)lines.push(said('old',`OLD-ASK-${i} `+'말 '.repeat(1200),`2026-10-19T0${i}:00:00.000Z`),shown('old',`OLD-ANSWER-${i}`));
  const oldFile=st.transcript('old',lines);
  st.running(process.pid,'old');s.start({conversation_id:'old',info:{transcript_path:oldFile}});
  st.running(process.pid,'new');const newFile=st.transcript('new',[said('new','<command-name>/clear</command-name>','2026-10-19T09:00:00.000Z')]);
  const {parts}=runStart({session_id:'new',source:'clear',cwd:st.dir,transcript_path:newFile},{env:{CLAUDE_PROJECT_DIR:st.dir}});
  assert.match(parts.session,/# 작업 세션: demo/);assert.ok(parts.recent.length<=9000);
  assert.match(parts.recent,new RegExp(`^# 최근 대화 \\(직전 주고받기 [1-4]번, 원문\\)\\n앞의 [1-4]번은 상한 때문에 뺐습니다\\. 대화 기록 파일: ${oldFile.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  assert.match(parts.recent,/OLD-ASK-5[\s\S]*OLD-ANSWER-5$/);assert.doesNotMatch(parts.recent,/OLD-ASK-1 /);
});
test('one work session with several live conversations: each has its own inbox address, kind and what it is doing',t=>{
  t.after(after);const st=stage(),s=api(st.dir);
  const user=text=>({type:'user',message:{role:'user',content:text}});
  s.create({name:'demo',context:'D',conversation_id:'a'});s.load({name:'demo',conversation_id:'b'});s.load({name:'demo',conversation_id:'f'});
  s.branch({action:'create',branch:'기억기능-보강',conversation_id:'b'});
  // Same short name for a and b: only the socket tells them apart.
  st.running(process.pid,'a',{name:'head-2b',messagingSocketPath:'/run/x/a.sock'});
  st.running(process.ppid,'b',{name:'head-2b',messagingSocketPath:'/run/x/b.sock'});
  const copy=spawn(process.execPath,['-e','setTimeout(()=>{},60000)']);t.after(()=>copy.kill());
  st.running(copy.pid,'f',{name:'head-03',entrypoint:'sdk-cli',messagingSocketPath:'/run/x/f.sock'});
  st.transcript('a',[user('herdr에 새 pane 열어서 네가 해봐라'),user('<channel source="agent-task">다른 세션 메시지'),user('[동료 thinkingking · chat #622] 4번 5번 눈은 왜그러는거야'),{...user('This session is being continued from a previous conversation that ran out of context.'),isCompactSummary:true},user('This session is being continued from a previous conversation that ran out of context. 요약'),{type:'assistant'}]);
  st.transcript('b',[user('<pasted_content id="x">\n기억 기능 보강 계획을 세워 보자\n</pasted_content id="x">')]);
  st.transcript('f',[user('부모의 오래된 첫 말입니다 길게'),user('[forked] 처음 맡은 일'),user('[forked] 지금 맡은 일입니다\n자세히'),user('[quick_task completed] cqt-x 끝남 알림')]);
  const out=s.conversations({conversation_id:'a'});
  assert.match(out,/- 메인\n  - 이름 head-2b · 보낼 곳 uds:\/run\/x\/a\.sock · 사람 · [^\n]+\(이 대화\)\n    하는 일: 최근 지시: "herdr에 새 pane 열어서 네가 해봐라"/);
  assert.match(out,/- 작업 브랜치 기억기능-보강\n  - 이름 head-2b · 보낼 곳 uds:\/run\/x\/b\.sock · 사람[^\n]*\n    하는 일: 주제: 기억기능-보강 · 최근 지시: "기억 기능 보강 계획을 세워 보자"/);
  assert.match(out,/이름 head-03 · 보낼 곳 uds:\/run\/x\/f\.sock · 포크·워커[^\n]*\n    하는 일: 맡은 일: "지금 맡은 일입니다"\n/);
  assert.match(out,/보내기: SendMessage\(to: 보낼 곳\)/);
});
test('0.7.1: a copy run by a program sits once, under the live conversation that started it; summaries ride on main and branches',t=>{
  t.after(after);const st=stage(),s=api(st.dir);
  const user=text=>({type:'user',message:{role:'user',content:text}});
  s.create({name:'demo',context:'D',conversation_id:'a'});s.save({summary:'MAIN-OWN',history:'m',conversation_id:'a'});
  s.load({name:'demo',conversation_id:'b'});s.branch({action:'create',branch:'job',conversation_id:'b'});
  s.save({summary:'JOB-LAST',history:'j',next:'n',conversation_id:'b'}); // also leaves an index line on main
  st.running(process.pid,'a',{name:'head-a',messagingSocketPath:'/run/x/a.sock'});
  st.running(process.ppid,'b',{name:'head-b',messagingSocketPath:'/run/x/b.sock'});
  const k1=spawn(process.execPath,['-e','setTimeout(()=>{},60000)']),k2=spawn(process.execPath,['-e','setTimeout(()=>{},60000)']);t.after(()=>{k1.kill();k2.kill();});
  st.running(k1.pid,'f',{name:'head-f',entrypoint:'sdk-cli',messagingSocketPath:'/run/x/f.sock'});
  st.running(k2.pid,'o',{name:'head-o',entrypoint:'sdk-cli',messagingSocketPath:'/run/x/o.sock'});
  st.transcript('a',[user('사람이 시킨 말입니다 길게')]);st.transcript('b',[user('브랜치에서 시킨 말입니다')]);
  st.transcript('f',[user('[forked] 포크가 맡은 일입니다')]);st.transcript('o',[user('[forked] 부모가 없는 포크의 일')]);
  // The start hook names the parent; here the connection carries it as the hook would leave it.
  s.start({conversation_id:'f',origins:[{conversation_id:'a',kind:'parent'}],info:{entrypoint:'sdk-cli',parent:'a'}});
  s.start({conversation_id:'o',origins:[{conversation_id:'a',kind:'parent'}],info:{entrypoint:'sdk-cli',parent:'gone'}});
  const data=s.tree({name:'demo'}),demo=data.sessions[0];
  assert.equal(demo.main.last_summary,'MAIN-OWN');
  const job=demo.branches.find(b=>b.name==='job');assert.equal(job.last_summary,'JOB-LAST');assert.equal(job.conversations[0].conversation_id,'b');
  assert.match(job.conversations[0].doing,/주제: job · 최근 지시: "브랜치에서 시킨 말입니다"/);
  const top=demo.conversations.map(r=>r.conversation_id);assert.deepEqual(top,['a','o']); // f only under a; orphan copy after people
  const a=demo.conversations[0];assert.equal(a.kind,'person');assert.deepEqual(a.children.map(c=>c.conversation_id),['f']);
  assert.equal(a.children[0].kind,'copy');assert.equal(a.children[0].parent,'a');assert.match(a.children[0].doing,/^맡은 일: "포크가 맡은 일입니다"/);
  const out=s.conversations({conversation_id:'a'});
  assert.match(out,/  - 이름 head-a · [^\n]+\(이 대화\)\n    하는 일: 최근 지시: "사람이 시킨 말입니다 길게" · 마지막 저장: MAIN-OWN\n      - 이름 head-f · 보낼 곳 uds:\/run\/x\/f\.sock · 포크·워커[^\n]*\n        하는 일: 맡은 일: "포크가 맡은 일입니다"/);
  assert.equal(out.match(/head-f/g).length,1);
  assert.doesNotMatch(job.conversations[0].doing,/마지막 저장/); // a branch has its topic instead
});
test('0.7.1: an SDK copy names its parent in forkedFrom; HEAD_CONTEXT_PARENT comes first; the start hook keeps parent and entrypoint',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'D',conversation_id:'p'});
  s.branch({action:'create',branch:'work1',conversation_id:'p'});
  const file=st.transcript('k',[{type:'user',sessionId:'k',forkedFrom:{sessionId:'p',messageUuid:'u'}},{type:'user',sessionId:'k'}]);
  assert.equal(copiedFrom(file,'k'),'p');
  assert.deepEqual(ancestry(st.dir,{session_id:'k',transcript_path:file}),[{conversation_id:'p',kind:'copy'}]);
  runStart({session_id:'k',source:'resume',cwd:st.dir,transcript_path:file},{env:{CLAUDE_PROJECT_DIR:st.dir,CLAUDE_CODE_ENTRYPOINT:'sdk-cli'}});
  const c=s.connection('k');assert.equal(c.session,'demo');assert.equal(c.branch,'work1');assert.equal(c.parent,'p');assert.equal(c.entrypoint,'sdk-cli');
  // A worker started fresh: only the starter can say who its parent is.
  const fresh=st.transcript('w',[{type:'user',sessionId:'w'}]);
  runStart({session_id:'w',source:'startup',cwd:st.dir,transcript_path:fresh},{env:{CLAUDE_PROJECT_DIR:st.dir,CLAUDE_CODE_ENTRYPOINT:'sdk-cli',HEAD_CONTEXT_PARENT:'p'}});
  assert.equal(s.connection('w').parent,'p');assert.equal(s.connection('w').branch,'work1');
  // A person's conversation records no parent even when copied.
  const side=st.transcript('d',[{type:'user',sessionId:'d',forkedFrom:{sessionId:'p'}}]);
  runStart({session_id:'d',source:'resume',cwd:st.dir,transcript_path:side},{env:{CLAUDE_PROJECT_DIR:st.dir,CLAUDE_CODE_ENTRYPOINT:'cli'}});
  assert.equal(s.connection('d').parent,undefined);assert.equal(s.connection('d').session,'demo');
});
test('0.7.1: a conversation run by claude -p reads records but its writes are refused (real MCP process)',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'D',conversation_id:'p'});
  st.running(process.pid,'p');s.start({conversation_id:'k',origins:[{conversation_id:'p',kind:'parent'}]});
  const call=(entry,name,args)=>{const r=spawnSync(process.execPath,[path.resolve(path.dirname(new URL(import.meta.url).pathname),'../hosts/claude/mcp.mjs')],{env:{...process.env,CLAUDE_PROJECT_DIR:st.dir,CLAUDE_CODE_ENTRYPOINT:entry},input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{conversation_id:'k',...args}}})+'\n',encoding:'utf8'});return JSON.parse(r.stdout).result;};
  const refused=call('sdk-cli','session_save',{summary:'x',history:'y'});assert.equal(refused.isError,true);assert.match(refused.content[0].text,/읽기만 됩니다/);
  assert.equal(call('sdk-cli','session_todo',{action:'add',text:'t'}).isError,true);
  assert.equal(call('sdk-cli','session_list',{}).isError,undefined);
  assert.equal(call('sdk-cli','session_todo',{action:'list'}).isError,undefined);
  assert.equal(call('cli','session_save',{summary:'x',history:'y'}).isError,undefined);
  assert.equal(call('claude-vscode','session_save',{summary:'x2',history:'y'}).isError,undefined);
});
test('0.7.1: a branch save climbs back up in its links, and its files still resolve',t=>{
  t.after(after);const st=stage(),s=api(st.dir);s.create({name:'demo',context:'D',conversation_id:'c'});
  const w=path.join(st.dir,'.head/sessions/demo/work/2026-10');fs.mkdirSync(w,{recursive:true});fs.writeFileSync(path.join(w,'a.md'),'a');
  s.branch({action:'create',branch:'docs',conversation_id:'c'});
  s.save({summary:'one',history:'See [a](work/2026-10/a.md) and [web](https://x.y) and `work/2026-10/a.md`.',next:'n',conversation_id:'c'});
  const text=fs.readFileSync(path.join(st.dir,'.head/sessions/demo/work/docs/history.md'),'utf8');
  assert.match(text,/\[a\]\(\.\.\/\.\.\/work\/2026-10\/a\.md\)/);assert.match(text,/\[web\]\(https:\/\/x\.y\)/);
  assert.ok(fs.existsSync(path.resolve(path.join(st.dir,'.head/sessions/demo/work/docs'),'../../work/2026-10/a.md')));
  assert.equal(s.inspect({action:'files',branch:'docs',depth:1,conversation_id:'c'}),'# 파일: 작업 브랜치 docs (기록 1개)\n- work/2026-10/a.md');
});
