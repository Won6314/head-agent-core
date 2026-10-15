import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sessions} from '../core/sessions.mjs';
import {withGraph} from '../core/graph.mjs';
import {parseHistory,mapSummary} from '../core/history.mjs';
import {transition,userInstruction,activity,report} from '../core/state.mjs';
import {processEvidence} from '../core/liveness.mjs';
import {board,renderBoard} from '../core/board.mjs';
import {inheritedFork} from '../hosts/claude/recovery.mjs';
import {event as claudeEvent} from '../hosts/claude/state.mjs';
import opencode from '../hosts/opencode/plugin.mjs';
import {callTool} from '../core/mcp.mjs';
import {spawnSync} from 'node:child_process';
import {loadChannel} from '../hosts/claude/channel.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT;
const fixture=()=>{const dir=fs.mkdtempSync(path.join(root,'flow-')),s=sessions(dir);s.create({name:'demo',context:'FLOW DIRECTION',conversation_id:'seed'});s.save({summary:'MAIN SUMMARY',history:'MAIN FULL BODY',next:'main cursor',conversation_id:'seed'});return {dir,s};};
const live=(dir,id,status='waiting',host='claude')=>transition(dir,{host,conversation_id:id,status,liveness:processEvidence()});
const branch=s=>{s.branch({action:'create',branch:'review',topic:'브랜치 검토 주제',conversation_id:'seed'});s.save({summary:'BRANCH SUMMARY',history:'BRANCH FULL BODY',next:'branch cursor',conversation_id:'seed'});s.branch({action:'main',keep_open:true,conversation_id:'seed'});};

test('map summary precedence: explicit then literal work label then body; graph has no label text',()=>{
  const {dir,s}=fixture(),file=path.join(dir,'.head/sessions/demo/history.md');
  fs.writeFileSync(file,'## 2020-01-01 work:LABEL_SECRET_42\n\nfirst body\n다음: x\n\n## 2020-01-02 work:ignored\n\n요약:explicit summary\nbody\n다음: x\n\n## 2020-01-03 run:not-work\n\n**body** fallback\n다음: x\n');
  const map=s.inspect({action:'map',conversation_id:'seed'});assert.match(map,/LABEL_SECRET_42/);assert.match(map,/explicit summary/);assert.match(map,/body fallback/);assert.doesNotMatch(map,/not-work|ignored/);
  const entries=parseHistory(fs.readFileSync(file,'utf8'));assert.deepEqual(entries.map(e=>mapSummary(e).source),['label','summary','body']);assert.equal(entries[0].summary,'first body');
  assert.ok(!JSON.stringify(withGraph(dir,g=>g.db.prepare('SELECT * FROM nodes').all())).includes('LABEL_SECRET_42'));
});
test('start = load: startup/clear/compact return the session_load identity, resume returns nothing, no forced question',()=>{
  const a=fixture();const plain=a.s.start({conversation_id:'fresh',session_name:'demo'}).text;
  assert.match(plain,/FLOW DIRECTION/);assert.match(plain,/MAIN FULL BODY/);assert.match(plain,/다음: main cursor/);assert.doesNotMatch(plain,/시작 자리 물음|session_read|요약: /);
  assert.equal(plain,a.s.load({conversation_id:'fresh'}));
  const b=fixture();branch(b.s);const opened=b.s.start({conversation_id:'fresh',session_name:'demo'}).text;
  assert.match(opened,/# 열린 브랜치\nreview · 주제: 브랜치 검토 주제 · 마지막 체크포인트: \d/);assert.doesNotMatch(opened,/질문 도구|시작 자리 물음/);
  b.s.branch({action:'attach',branch:'review',conversation_id:'fresh'});
  assert.equal(b.s.start({conversation_id:'fresh',source:'resume'}).text,'');
  const compact=b.s.start({conversation_id:'fresh',source:'compact'}).text;assert.match(compact,/자리: 브랜치 review · 주제: 브랜치 검토 주제/);assert.match(compact,/MAIN FULL BODY[\s\S]+BRANCH FULL BODY/);assert.match(compact,/다음: branch cursor/);assert.doesNotMatch(compact,/다음: main cursor/);
  const cleared=b.s.start({conversation_id:'after-clear',session_name:'no-such-session',from_conversation_id:'fresh',source:'clear'});
  assert.equal(cleared.session,'demo');assert.equal(b.s.connection('after-clear').branch,'review');assert.match(cleared.text,/자리: 브랜치 review/);
  assert.equal(b.s.start({conversation_id:'unknown',session_name:'no-such-session'}),null);
});
test('identity: older entries are summary lines only, last five are time+body, only newest cursor; next optional; merge stands out',()=>{
  const {dir,s}=fixture();for(let i=0;i<12;i++)s.save({summary:'SUM-'+i,history:'BODY-'+i,next:'NEXT-'+i,conversation_id:'seed'});
  const text=s.load({conversation_id:'seed'});
  assert.match(text,/# 지난 기록 \(요약\)\n\* MAIN SUMMARY\n\* SUM-0\n/);assert.match(text,/\* SUM-6\n# 최근 기록/);assert.doesNotMatch(text,/BODY-6\b|SUM-7|NEXT-10|요약:|demo\/main@/);
  assert.match(text,/## \d{4}-[^\n]+\nBODY-7\n\n## [^\n]+\nBODY-8/);assert.match(text,/BODY-11\n\n다음: NEXT-11$/);
  assert.match(s.load({conversation_id:'seed',map_limit:3}),/그 앞 5개 — session_read map/);
  const file=path.join(dir,'.head/sessions/demo/history.md');s.save({summary:'DONE',history:'finished work',conversation_id:'seed'});
  const lastEntry=fs.readFileSync(file,'utf8').split('요약: DONE')[1];assert.doesNotMatch(lastEntry,/다음:|상태:/);assert.match(s.load({conversation_id:'seed'}),/finished work$/);
  s.branch({action:'create',branch:'side',topic:'동시 작업',conversation_id:'seed'});s.save({summary:'side work',history:'side body',conversation_id:'seed'});s.finish({summary:'SIDE RESULT',history:'merged side',conversation_id:'seed'});
  assert.match(s.load({conversation_id:'seed'}),/## [^\n]+\n브랜치 side 끝남 · 기록: work\/side\/history.md\nmerged side$/);
  s.save({summary:'after',history:'after body',conversation_id:'seed'});assert.match(s.load({conversation_id:'seed',history_count:1}),/\nM SIDE RESULT ← 합쳐짐 side\n/);
});
test('Claude hook: identity in hook when it fits; over the cap the conversation MCP sends the same load as a channel message',async()=>{
  const {dir,s}=fixture();callTool(s,'project_setup',{action:'never_ask',step:'setup'},undefined,dir); // identity alone; the first-run guide is covered in first-run.test
  const hook=(id,source='startup')=>spawnSync(process.execPath,[path.resolve('scripts/hook.mjs')],{input:JSON.stringify({hook_event_name:'SessionStart',session_id:id,source,cwd:dir}),env:{...process.env,CLAUDE_PROJECT_DIR:dir,HEAD_CONTEXT_SESSION:'demo'},encoding:'utf8'});
  const small=hook('small');assert.equal(small.status,0);assert.equal(JSON.parse(small.stdout).hookSpecificOutput.additionalContext,s.load({conversation_id:'small'}));
  assert.equal(hook('small','resume').stdout,'');
  for(let i=0;i<5;i++)s.save({summary:'BIG-'+i,history:'긴 본문 '.repeat(500),conversation_id:'seed'});
  const big=hook('big');const context=JSON.parse(big.stdout).hookSpecificOutput.additionalContext;assert.match(context,/채널 메시지로 이어서/);assert.ok(big.stdout.length<10000);
  const pending=path.join(dir,'.head/state/pending-load/claude-big.json');assert.ok(fs.existsSync(pending));
  const sent=[];loadChannel(dir,sessions(dir,{host:'claude'}),{delay:0}).start((content,meta)=>sent.push({content,meta}));
  assert.equal(sent.length,1);assert.equal(sent[0].meta.kind,'session_load');assert.ok(sent[0].content.endsWith(s.load({conversation_id:'big'})));assert.equal(fs.existsSync(pending),false);
});
test('inherited native fork binds to its parent session and loads nothing; compact reloads',()=>{
  const {dir,s}=fixture(),transcript=path.join(dir,'fork.jsonl');
  fs.writeFileSync(transcript,JSON.stringify({type:'user',forkedFrom:{sessionId:'seed'},message:{content:'old context'}})+'\n');
  assert.equal(inheritedFork(dir,{session_id:'fork',transcript_path:transcript}),'seed');
  const context=s.start({conversation_id:'fork',from_conversation_id:'seed',source:'resume',inherited_context:true});assert.equal(context.text,'');assert.equal(s.connection('fork').session,'demo');
  assert.equal(inheritedFork(dir,{session_id:'fork',transcript_path:transcript}),false);
  transition(dir,{host:'claude',conversation_id:'legacy-fork',status:'ended',liveness:null});assert.equal(inheritedFork(dir,{session_id:'legacy-fork',transcript_path:transcript}),false);
  assert.equal(s.start({conversation_id:'fork',source:'resume'}).text,'');assert.match(s.start({conversation_id:'fork',source:'compact'}).text,/FLOW DIRECTION/);
});
test('leaving branch asks before moving; acknowledge keep or finish, never ask on same/read-only branch or create split',()=>{
  const {s}=fixture();branch(s);s.branch({action:'attach',branch:'review',conversation_id:'seed'});
  const warning=s.branch({action:'main',conversation_id:'seed'});assert.match(warning,/끝낼까요, 열어둘까요/);assert.equal(s.connection('seed').branch,'review');
  assert.doesNotMatch(s.load({conversation_id:'seed'}),/떠나기 전/);
  const ack=callTool(s,'session_branch',{action:'main',keep_open:true},'seed');assert.doesNotMatch(ack,/떠나기 전/);assert.equal(s.connection('seed').branch,null);
  s.branch({action:'attach',branch:'review',conversation_id:'seed'});s.branch({action:'create',branch:'child',topic:'child',conversation_id:'seed'});assert.equal(s.connection('seed').branch,'child');
  assert.match(s.branch({action:'attach',branch:'review',conversation_id:'seed'}),/떠나기 전/);assert.equal(s.connection('seed').branch,'child');
  s.create({name:'other',context:'other',conversation_id:'other'});assert.match(s.load({name:'other',conversation_id:'seed'}),/떠나기 전/);assert.equal(s.connection('seed').session,'demo');
  s.finish({summary:'child done',history:'done',conversation_id:'seed'});assert.doesNotMatch(s.load({name:'other',conversation_id:'seed'}),/떠나기 전/);
});
test('host-owned current line: first Unicode line, 80 cap, short/slash/synthetic/results ignored, transitions preserve',()=>{
  const {dir}=fixture();const send=(text,is_user=true)=>userInstruction(dir,{host:'claude',conversation_id:'seed',text,is_user});
  live(dir,'seed');send('이 사용자 지시의 첫 줄을 현재 위치로 보여줘\nsecond line');assert.equal(activity(dir,'claude','seed').current,'이 사용자 지시의 첫 줄을 현재 위치로 보여줘');
  const previous=activity(dir,'claude','seed').current;
  for(const text of ['네','짧은답12345','/compact','[quick_task completed] long worker notification','[다른 세션 HEAD의 전달사항 · 발신: other]'])send(text);
  send('long synthetic internal message',false);assert.equal(activity(dir,'claude','seed').current,previous);
  send('😀'.repeat(100));assert.equal(Array.from(activity(dir,'claude','seed').current).length,80);
  transition(dir,{host:'claude',conversation_id:'seed',status:'blocked'});assert.equal(Array.from(activity(dir,'claude','seed').current).length,80);
  claudeEvent(dir,{hook_event_name:'UserPromptSubmit',session_id:'seed',prompt:'시스템이 넣은 아주 긴 입력',is_meta:true});assert.equal(Array.from(activity(dir,'claude','seed').current).length,80);
  send('/home/jywon/long-path.txt 내용을 확인해줘');assert.match(activity(dir,'claude','seed').current,/long-path/);
});
test('board: main only, branch, nested, stopped open, child under owning conversation, multiple main, json no works',()=>{
  const {dir,s}=fixture();live(dir,'seed');userInstruction(dir,{host:'claude',conversation_id:'seed',text:'메인에서 사용자 문의를 처리해줘'});
  assert.match(renderBoard(board(dir)),/^demo    ● 지금: 메인/);assert.doesNotMatch(JSON.stringify(board(dir)),/"works"|"stopped":/);
  branch(s);s.branch({action:'attach',branch:'review',conversation_id:'seed'});s.branch({action:'create',branch:'nested',topic:'중첩 브랜치',conversation_id:'seed'});
  live(dir,'seed','working');assert.match(renderBoard(board(dir)),/    ○ 중첩 브랜치 \[nested\]/);
  report(dir,{host:'claude',parent_conversation_id:'seed',id:'worker',name:'워커 developer · 검증',status:'running'});
  const view=renderBoard(board(dir));assert.match(view,/  · 브랜치 검토 주제 \[review\]/);assert.match(view,/    ○ 중첩 브랜치 \[nested\]/);assert.match(view,/      ↳ 워커 developer/);assert.doesNotMatch(view,/멈춘 작업|기록 없음/);
  s.branch({action:'main',keep_open:true,conversation_id:'seed'});s.load({name:'demo',conversation_id:'peer'});live(dir,'peer');assert.match(renderBoard(board(dir)),/메인 대화 2개/);assert.match(renderBoard(board(dir)),/claude:seed/);
  s.create({name:'inactive',context:'D',conversation_id:'inactive'});assert.match(renderBoard(board(dir)),/그 외 세션 1개/);
});
test('OpenCode pushes the session identity on every request, follows branch moves and explicit fork binding',async()=>{
  const {dir,s}=fixture();branch(s);const env=process.env.HEAD_CONTEXT_SESSION;process.env.HEAD_CONTEXT_SESSION='demo';
  try{const store=sessions(dir,{host:'opencode'}),hooks=await opencode.server({directory:dir,client:{session:{get:async({path})=>({data:{id:path.id,parentID:path.id==='ses_fork'?'ses_root':undefined}})}}});
    await hooks['chat.message']({sessionID:'ses_root'},{message:{role:'user'},parts:[{type:'text',text:'사용자 지시를 OpenCode 지금 줄로 적어줘'}]});const first={system:[]};await hooks['experimental.chat.system.transform']({sessionID:'ses_root'},first);
    assert.match(first.system.join('\n'),/MAIN FULL BODY/);assert.match(first.system.join('\n'),/# 열린 브랜치\nreview/);assert.doesNotMatch(first.system.join('\n'),/시작 자리 물음/);
    assert.match(activity(dir,'opencode','ses_root').current,/OpenCode/);
    await hooks['chat.message']({sessionID:'ses_root'},{message:{role:'user'},parts:[{type:'text',text:'synthetic long content',synthetic:true}]});assert.match(activity(dir,'opencode','ses_root').current,/OpenCode/);
    store.load({branch:'review',conversation_id:'ses_root'});const next={system:[]};await hooks['experimental.chat.system.transform']({sessionID:'ses_root'},next);assert.match(next.system.join('\n'),/자리: 브랜치 review/);assert.match(next.system.join('\n'),/BRANCH FULL BODY/);
    store.load({name:'demo',branch:'review',conversation_id:'ses_fork'});const fork={system:[]};await hooks['experimental.chat.system.transform']({sessionID:'ses_fork'},fork);assert.match(fork.system.join('\n'),/자리: 브랜치 review/);await hooks.dispose();
  }finally{if(env===undefined)delete process.env.HEAD_CONTEXT_SESSION;else process.env.HEAD_CONTEXT_SESSION=env;}
});
