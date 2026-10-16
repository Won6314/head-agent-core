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
import {event as claudeEvent} from '../hosts/claude/state.mjs';
import opencode from '../hosts/opencode/plugin.mjs';
import {callTool} from '../core/mcp.mjs';
import {spawnSync} from 'node:child_process';
import {loadChannel} from '../hosts/claude/channel.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT;
// seed sits on its own branch, as every connected conversation does.
const fixture=()=>{const dir=fs.mkdtempSync(path.join(root,'flow-')),s=sessions(dir);s.create({name:'demo',context:'FLOW DIRECTION',conversation_id:'seed',label:'씨앗 일'});s.save({summary:'MAIN SUMMARY',history:'MAIN FULL BODY',next:'main cursor',conversation_id:'seed'});return {dir,s,seat:s.connection('seed').branch};};
const live=(dir,id,status='waiting',host='claude')=>transition(dir,{host,conversation_id:id,status,liveness:processEvidence()});
// A second place in the same session, left with pending work by a conversation of its own.
const branch=(dir,s)=>{live(dir,'peer');s.load({name:'demo',conversation_id:'peer',label:'브랜치 검토 주제'});
  s.save({summary:'BRANCH SUMMARY',history:'BRANCH FULL BODY',next:'branch cursor',conversation_id:'peer'});return s.connection('peer').branch;};

test('map summary precedence: explicit then literal work label then body; graph has no label text',()=>{
  const {dir,s}=fixture(),file=path.join(dir,'.head/sessions/demo/history.md');
  fs.writeFileSync(file,'## 2020-01-01 work:LABEL_SECRET_42\n\nfirst body\n다음: x\n\n## 2020-01-02 work:ignored\n\n요약:explicit summary\nbody\n다음: x\n\n## 2020-01-03 run:not-work\n\n**body** fallback\n다음: x\n');
  const map=s.inspect({action:'map',conversation_id:'seed'});assert.match(map,/LABEL_SECRET_42/);assert.match(map,/explicit summary/);assert.match(map,/body fallback/);assert.doesNotMatch(map,/not-work|ignored/);
  const entries=parseHistory(fs.readFileSync(file,'utf8'));assert.deepEqual(entries.map(e=>mapSummary(e).source),['label','summary','body']);assert.equal(entries[0].summary,'first body');
  assert.ok(!JSON.stringify(withGraph(dir,g=>g.db.prepare('SELECT * FROM nodes').all())).includes('LABEL_SECRET_42'));
});
test('start = load: a new conversation gets its own place, resume says nothing, /clear carries the place over',()=>{
  const a=fixture();const fresh=a.s.start({conversation_id:'fresh',session_name:'demo'});
  // A new conversation reads the direction and the main index, not another place's body.
  assert.match(fresh.text,/FLOW DIRECTION/);assert.match(fresh.text,/# 지난 기록 \(요약\)\n\* MAIN SUMMARY/);
  assert.doesNotMatch(fresh.text,/MAIN FULL BODY|시작 자리 물음|session_read|요약: /);
  assert.notEqual(fresh.stem,a.seat);assert.equal(fresh.text,a.s.load({conversation_id:'fresh'}));
  const b=fixture();const peer=branch(b.dir,b.s);
  // Pending work elsewhere is offered to take over, with the words to ask for it.
  live(b.dir,'peer','ended');const opened=b.s.start({conversation_id:'fresh',session_name:'demo'}).text;
  assert.match(opened,/# 남은 일 \(다른 자리에서 멈춘 일\)\n- '브랜치 검토 주제|BRANCH SUMMARY'/);
  assert.match(opened,/이어서 할까요/);assert.doesNotMatch(opened,/질문 도구|시작 자리 물음/);
  b.s.branch({action:'attach',branch:peer,conversation_id:'fresh'});
  assert.equal(b.s.start({conversation_id:'fresh',source:'resume'}).text,'');
  const compact=b.s.start({conversation_id:'fresh',source:'compact'}).text;
  assert.match(compact,new RegExp(`자리: 브랜치 ${peer} · 이름표: BRANCH SUMMARY`));
  assert.match(compact,/BRANCH FULL BODY/);assert.match(compact,/다음: branch cursor/);
  assert.doesNotMatch(compact.split('# 남은 일')[0],/다음: main cursor/); // another place's cursor is only offered as pending work
  const cleared=b.s.start({conversation_id:'after-clear',session_name:'no-such-session',source:'clear',
    origins:[{conversation_id:'fresh',kind:'clear'}]});
  assert.equal(cleared.session,'demo');assert.equal(b.s.connection('after-clear').branch,peer);assert.match(cleared.text,new RegExp(`자리: 브랜치 ${peer}`));
  assert.equal(b.s.start({conversation_id:'unknown',session_name:'no-such-session'}),null);
});
test('identity: the main index as summary lines, this place as time+body, only the newest cursor, merges stand out',()=>{
  const {dir,s,seat}=fixture();for(let i=0;i<12;i++)s.save({summary:'SUM-'+i,history:'BODY-'+i,next:'NEXT-'+i,conversation_id:'seed'});
  const text=s.load({conversation_id:'seed'});
  assert.match(text,/# 지난 기록 \(요약\)\n\* MAIN SUMMARY\n\* SUM-0\n/);assert.match(text,/\* SUM-6\n# 최근 기록/);
  assert.doesNotMatch(text,/BODY-6\b|SUM-7|NEXT-10|요약:|demo\/main@/);
  assert.match(text,/## \d{4}-[^\n]+\nBODY-7\n\n## [^\n]+\nBODY-8/);assert.match(text,/BODY-11\n\n다음: NEXT-11$/);
  assert.match(s.load({conversation_id:'seed',map_limit:3}),/그 앞 5개 — session_read map/);
  // A save with no next closes the cursor and keeps the recap at the top of the place.
  const file=path.join(dir,'.head/sessions/demo/work',seat,'history.md');
  s.save({summary:'DONE',history:'finished work',recap:'모두 끝났다',conversation_id:'seed'});
  const lastEntry=fs.readFileSync(file,'utf8').split('요약: DONE')[1];assert.doesNotMatch(lastEntry,/다음:|상태:/);
  assert.match(s.load({conversation_id:'seed'}),/finished work$/);
  // A finished place merges into main as one higher-level entry the map and load single out.
  s.finish({conversation_id:'seed'});
  const merged=s.load({conversation_id:'seed',history_count:1});
  assert.match(merged,new RegExp(`\\nM DONE ← 합쳐짐 ${seat}\\n`));
  assert.match(s.inspect({action:'map',conversation_id:'seed'}),new RegExp(`M [^\\n]+ ← 합쳐짐 ${seat}`));
});
test('Claude hook: identity in hook when it fits; over the cap the model is told to load it, and a channel host gets the same text',async()=>{
  const {dir,s}=fixture();callTool(s,'project_setup',{action:'never_ask',step:'setup'},undefined,dir); // identity alone; the first-run guide is covered in first-run.test
  const hook=(id,source='startup')=>spawnSync(process.execPath,[path.resolve('scripts/hook.mjs')],{input:JSON.stringify({hook_event_name:'SessionStart',session_id:id,source,cwd:dir}),env:{...process.env,CLAUDE_PROJECT_DIR:dir,HEAD_CONTEXT_SESSION:'demo'},encoding:'utf8'});
  const small=hook('small');assert.equal(small.status,0);assert.equal(JSON.parse(small.stdout).hookSpecificOutput.additionalContext,s.load({conversation_id:'small'}));
  assert.equal(hook('small','resume').stdout,'');
  for(let i=0;i<5;i++)s.save({summary:'BIG-'+i,history:'긴 본문 '.repeat(500),next:'더',conversation_id:'seed'});
  const big=hook('seed');const context=JSON.parse(big.stdout).hookSpecificOutput.additionalContext;
  assert.match(context,/session_load를 호출해/);assert.ok(big.stdout.length<10000);
  const pending=path.join(dir,'.head/state/pending-load/claude-seed.json');assert.ok(fs.existsSync(pending));
  // The channel is the same load, claimed by the MCP process the host says runs this conversation.
  const sent=[];loadChannel(dir,sessions(dir,{host:'claude'}),{delay:0,conversationOf:()=>'other-conversation'}).start(()=>sent.push(1));
  assert.equal(sent.length,0);assert.ok(fs.existsSync(pending));
  loadChannel(dir,sessions(dir,{host:'claude'}),{delay:0,conversationOf:()=>'seed'}).start((content,meta)=>sent.push({content,meta}));
  assert.equal(sent.length,1);assert.equal(sent[0].meta.kind,'session_load');assert.ok(sent[0].content.endsWith(s.load({conversation_id:'seed'})));assert.equal(fs.existsSync(pending),false);
});
test('a fork takes its parent session on a branch of its own and loads nothing; a later compact reloads',()=>{
  const {dir,s,seat}=fixture();
  const forked=s.start({conversation_id:'fork',origins:[{conversation_id:'seed',kind:'fork'}],source:'fork'});
  assert.equal(forked.text,'');assert.equal(s.connection('fork').session,'demo');
  assert.notEqual(forked.stem,seat);
  assert.equal(s.read('demo').branches.find(b=>b.name===forked.stem).parent,seat);
  // Starting again does not hand it a second branch, and a compact puts the identity back.
  assert.equal(s.start({conversation_id:'fork',origins:[{conversation_id:'seed',kind:'fork'}],source:'resume'}).stem,forked.stem);
  const compact=s.start({conversation_id:'fork',origins:[{conversation_id:'seed',kind:'fork'}],source:'compact'});
  assert.equal(compact.stem,forked.stem);assert.match(compact.text,/FLOW DIRECTION/);
  // An ancestor nobody knows is skipped for the nearest one that is known.
  s.save({summary:'FORK SAVE',history:'fork body',next:'더',conversation_id:'fork'});
  const deep=s.start({conversation_id:'deep',origins:[{conversation_id:'unknown',kind:'fork'},{conversation_id:'fork',kind:'fork'}],source:'fork'});
  assert.equal(deep.session,'demo');assert.equal(s.read('demo').branches.find(b=>b.name===deep.stem).parent,forked.stem);
});
test('moving away no longer asks anything: the place left behind is closed, an empty one dropped',()=>{
  const {dir,s,seat}=fixture();
  s.create({name:'other',context:'OTHER DIRECTION',conversation_id:'other-seed',label:'다른 주제'});
  const moved=s.load({name:'other',conversation_id:'seed'});
  assert.doesNotMatch(moved,/떠나기 전|끝낼까요, 열어둘까요/);
  assert.equal(s.connection('seed').session,'other');
  // The place it left had a save, so it merged into its own session's main.
  assert.match(fs.readFileSync(path.join(dir,'.head/sessions/demo/history.md'),'utf8'),new RegExp(`상태: 멈춤\\n브랜치: ${seat}`));
  const empty=s.connection('seed').branch;
  s.load({name:'demo',branch:seat,conversation_id:'seed'});
  assert.equal(fs.existsSync(path.join(dir,'.head/sessions/other/work',empty)),false);
  assert.equal(s.connection('seed').branch,seat);
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
  send('/tmp/long-path.txt 내용을 확인해줘');assert.match(activity(dir,'claude','seed').current,/long-path/);
});
test('board: a conversation under its own place, a nested place, a child under the conversation that owns it',()=>{
  const {dir,s,seat}=fixture();live(dir,'seed');userInstruction(dir,{host:'claude',conversation_id:'seed',text:'이 자리에서 사용자 문의를 처리해줘'});
  assert.match(renderBoard(board(dir)),/^demo {4}·/m);
  // The label follows the newest summary, so the line reads as the work, not a branch name.
  assert.match(renderBoard(board(dir)),/● MAIN SUMMARY \[.+\] · 진행 중 · 지금: 이 자리에서/);
  assert.doesNotMatch(JSON.stringify(board(dir)),/"works"/);
  s.branch({action:'create',label:'중첩 브랜치',conversation_id:'seed'});
  const nested=s.connection('seed').branch;live(dir,'seed','working');
  s.save({summary:'중첩 저장',history:'본문',next:'더',conversation_id:'seed'});
  report(dir,{host:'claude',parent_conversation_id:'seed',id:'worker',name:'워커 developer · 검증',status:'running'});
  const view=renderBoard(board(dir));
  assert.match(view,new RegExp(`○ 중첩 저장 \\[${nested}\\] · 진행 중`));
  assert.match(view,/↳ 워커 developer/);assert.doesNotMatch(view,/멈춘 작업|기록 없음/);
  // The place it left still has pending work, so the board keeps showing it with no conversation.
  assert.match(view,new RegExp(`· MAIN SUMMARY \\[${seat}\\] · 남은 일`));
  // Two live conversations in one session are two places, each on its own line.
  live(dir,'peer');s.load({name:'demo',conversation_id:'peer',label:'둘째 대화'});
  const lines=renderBoard(board(dir)).split('\n').filter(l=>/진행 중/.test(l));
  assert.equal(lines.length,2);
  s.create({name:'inactive',context:'D',conversation_id:'inactive'});
  assert.match(renderBoard(board(dir)),/그 외 세션 1개/);
});
test('OpenCode pushes the identity of the place on every request and follows a move',async()=>{
  const {dir,s,seat}=fixture();const env=process.env.HEAD_CONTEXT_SESSION;process.env.HEAD_CONTEXT_SESSION='demo';
  try{const store=sessions(dir,{host:'opencode'}),hooks=await opencode.server({directory:dir,client:{session:{get:async({path})=>({data:{id:path.id,parentID:path.id==='ses_fork'?'ses_root':undefined,title:path.id==='ses_root'?'오픈코드 일':'하위'}})}}});
    await hooks['chat.message']({sessionID:'ses_root'},{message:{role:'user'},parts:[{type:'text',text:'사용자 지시를 OpenCode 지금 줄로 적어줘'}]});
    const first={system:[]};await hooks['experimental.chat.system.transform']({sessionID:'ses_root'},first);
    const text=first.system.join('\n');
    assert.match(text,/FLOW DIRECTION/);assert.match(text,/# 지난 기록 \(요약\)\n\* MAIN SUMMARY/);assert.doesNotMatch(text,/시작 자리 물음/);
    // Its own place, not the place the Claude conversation is on.
    const own=store.connection('ses_root').branch;assert.ok(own&&own!==seat);
    assert.match(activity(dir,'opencode','ses_root').current,/OpenCode/);
    await hooks['chat.message']({sessionID:'ses_root'},{message:{role:'user'},parts:[{type:'text',text:'synthetic long content',synthetic:true}]});
    assert.match(activity(dir,'opencode','ses_root').current,/OpenCode/);
    store.save({summary:'오픈코드 저장',history:'OPENCODE BODY',next:'더',conversation_id:'ses_root'});
    const next={system:[]};await hooks['experimental.chat.system.transform']({sessionID:'ses_root'},next);
    assert.match(next.system.join('\n'),new RegExp(`자리: 브랜치 ${own}`));assert.match(next.system.join('\n'),/OPENCODE BODY/);
    // A native child conversation is a fork: its own branch under its parent's.
    await hooks['chat.message']({sessionID:'ses_fork'},{message:{role:'user'},parts:[{type:'text',text:'하위 대화의 긴 사용자 지시'}]});
    const child=store.connection('ses_fork');
    assert.equal(child,null); // a native child is a subtask of its parent, not a place of its own
    await hooks.dispose();
  }finally{if(env===undefined)delete process.env.HEAD_CONTEXT_SESSION;else process.env.HEAD_CONTEXT_SESSION=env;}
});
