import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {sessions} from '../core/sessions.mjs';
import {withGraph} from '../core/graph.mjs';
import {parseHistory} from '../core/history.mjs';
import {branchHeader} from '../core/branch-format.mjs';
import {callTool,definitions,instructions,FORK_WRITE_REFUSED} from '../core/mcp.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT||os.tmpdir();
const fresh=()=>fs.mkdtempSync(path.join(root,'lifecycle-'));
const file=(dir,...parts)=>path.join(dir,'.head/sessions',...parts);
const read=(dir,...parts)=>fs.readFileSync(file(dir,...parts),'utf8');
const setup=()=>{const dir=fresh(),s=sessions(dir);s.create({name:'demo',context:'# demo\n\n방향',conversation_id:'a'});return {dir,s};};
const header=(dir,name)=>branchHeader(read(dir,'demo','work',name,'history.md'));

test('a conversation starts on main: no branch is opened on its own, and main takes saves without a recap',()=>{
  const {dir,s}=setup();
  assert.equal(s.connection('a').branch,null);assert.equal(fs.existsSync(file(dir,'demo','work')),false);
  assert.match(s.save({summary:'메인 기록',history:'본문',conversation_id:'a'}),/메인에 기록했습니다/);
  assert.match(s.save({summary:'메인 둘',history:'본문',next:'이어서',conversation_id:'a'}),/다음: 이어서/);
  assert.throws(()=>s.save({summary:'x',history:'y',recap:'정리',conversation_id:'a'}),/메인 기록에는 recap/);
  assert.equal(parseHistory(read(dir,'demo','history.md')).length,2);
});
test('a work branch is opened by name only; a save writes the body there and one index line on main',()=>{
  const {dir,s}=setup();
  assert.throws(()=>s.branch({action:'create',conversation_id:'a'}),/이름\(branch\)이 필요합니다/);
  assert.throws(()=>s.branch({action:'create',branch:'main',conversation_id:'a'}),/예약 이름/);
  const loaded=s.branch({action:'create',branch:'login-fix',conversation_id:'a'});
  assert.match(loaded,/\n이 대화의 작업 브랜치: login-fix\n[\s\S]*## 이 작업 브랜치의 최근 기록: login-fix\n\(아직 기록 없음\)$/);
  assert.throws(()=>s.branch({action:'create',branch:'login-fix',conversation_id:'b'}),/작업 세션에 연결되지 않았습니다/);
  s.load({name:'demo',conversation_id:'b'});
  assert.throws(()=>s.branch({action:'create',branch:'login-fix',conversation_id:'b'}),/이미 있습니다/);
  s.save({summary:'원인 찾음',history:'BODY-1',next:'고치기',conversation_id:'a'});
  assert.match(read(dir,'demo','work','login-fix','history.md'),/BODY-1/);
  const main=read(dir,'demo','history.md');assert.doesNotMatch(main,/BODY-1/);assert.match(main,/이름표: login-fix · 본문: work\/login-fix\/history.md/);
  assert.equal(header(dir,'login-fix').label,'login-fix');
});
test('only a next-less save closes a branch: it needs the recap, merges once into main and puts the conversation on main',()=>{
  const {dir,s}=setup();s.branch({action:'create',branch:'job',conversation_id:'a'});
  assert.throws(()=>s.save({summary:'x',history:'y',conversation_id:'a'}),/recap/);
  assert.throws(()=>s.save({summary:'x',history:'y',next:'n',recap:'r',conversation_id:'a'}),/recap을 받지 않습니다/);
  s.save({summary:'중간',history:'MID',next:'더',conversation_id:'a'});assert.equal(header(dir,'job').status,'열림');
  const out=s.save({summary:'끝냄',history:'END',recap:'RECAP-ALL',conversation_id:'a'});
  assert.match(out,/작업 브랜치를 닫아 메인에 합쳤습니다/);
  assert.equal(header(dir,'job').status,'끝남');assert.equal(header(dir,'job').recap,'RECAP-ALL');
  const merges=parseHistory(read(dir,'demo','history.md')).filter(e=>e.branch==='job');
  assert.equal(merges.length,1);assert.equal(merges[0].status,'끝남');assert.equal(merges[0].summary,'끝냄');assert.match(merges[0].body,/RECAP-ALL/);
  assert.equal(s.connection('a').branch,null);
  assert.match(s.save({summary:'다음 일',history:'x',conversation_id:'a'}),/메인에 기록했습니다/);
  assert.match(s.inspect({action:'map',conversation_id:'a'}),/합침 ← job · 끝남/);
});
test('leaving a branch, ending a conversation or many conversations on one branch close nothing',()=>{
  const {dir,s}=setup();s.branch({action:'create',branch:'one',conversation_id:'a'});s.save({summary:'one 1',history:'x',next:'n1',conversation_id:'a'});
  s.branch({action:'create',branch:'two',parent:'main',conversation_id:'a'});
  assert.equal(header(dir,'one').status,'열림');assert.equal(s.connection('a').branch,'two');
  // Another conversation may take up the same branch while the first one is still on it.
  s.load({name:'demo',conversation_id:'b'});s.branch({action:'attach',branch:'two',conversation_id:'b'});
  s.save({summary:'two by b',history:'x',next:'n',conversation_id:'b'});s.save({summary:'two by a',history:'y',next:'n',conversation_id:'a'});
  assert.deepEqual(withGraph(dir,g=>g.own('demo','two').map(r=>g.detail(r).summary)),['two by b','two by a']);
  const loaded=s.load({name:'demo',conversation_id:'c'});
  assert.match(loaded,/## 열린 작업 브랜치 \(2\)\n- two · 마지막 [^\n]+ · 다음: n\n- one · 마지막 [^\n]+ · 다음: n1/);
  assert.match(loaded,/이 대화의 작업 브랜치: 없음\(메인\)/);assert.doesNotMatch(loaded,/이 작업 브랜치의 최근 기록/);
  assert.equal(parseHistory(read(dir,'demo','history.md')).filter(e=>e.status!=='열림').length,0);
});
test('a closed branch sends its other conversations to main; attaching to it opens it again; abandon keeps the reason',()=>{
  const {dir,s}=setup();s.branch({action:'create',branch:'job',conversation_id:'a'});
  s.load({name:'demo',conversation_id:'b'});s.branch({action:'attach',branch:'job',conversation_id:'b'});
  s.save({summary:'done',history:'x',recap:'all',conversation_id:'a'});
  assert.match(s.save({summary:'after',history:'z',conversation_id:'b'}),/메인에 기록했습니다/);
  assert.match(s.branch({action:'attach',branch:'job',conversation_id:'b'}),/\n이 대화의 작업 브랜치: job\n[\s\S]*## 이 작업 브랜치의 최근 기록: job\n정리:\nall/);
  assert.equal(header(dir,'job').status,'열림');
  s.save({summary:'again',history:'w',recap:'all again',conversation_id:'b'});
  assert.equal(parseHistory(read(dir,'demo','history.md')).filter(e=>e.branch==='job').length,2);
  s.branch({action:'create',branch:'drop',conversation_id:'a'});s.save({summary:'try',history:'x',next:'n',conversation_id:'a'});
  assert.throws(()=>s.branch({action:'abandon',conversation_id:'a'}),/reason/);
  assert.match(s.branch({action:'abandon',reason:'사용자가 그만둠',conversation_id:'a'}),/중단했습니다/);
  assert.equal(header(dir,'drop').status,'중단');assert.equal(s.connection('a').branch,null);
  assert.match(read(dir,'demo','history.md'),/상태: 중단\n브랜치: drop\n기록: work\/drop\/history.md\n이유: 사용자가 그만둠/);
  assert.throws(()=>s.branch({action:'attach',branch:'drop',conversation_id:'a'}),/중단한 작업 브랜치/);
  assert.throws(()=>s.branch({action:'abandon',branch:'drop',reason:'again',conversation_id:'a'}),/이미 닫혀/);
});
test('0.6 records still read: an automatic branch keeps its label in the list, 멈춤 counts as open, attaching continues it',()=>{
  const {dir,s}=setup();const stem='branch-20261016T115436-7eea1c74';
  fs.mkdirSync(file(dir,'demo','work',stem),{recursive:true});
  fs.writeFileSync(file(dir,'demo','work',stem,'history.md'),`<!-- head-context branch:1 -->\n# ${stem}\n\n이름표: 옛 이름표\n시작: 2026-10-16T11:54:36.000Z\n갈래: demo/메인@없음\n갈래-ID: \n상태: 멈춤\n\n## 2026-10-17T00:00:00.000Z\n\n요약: 옛 일\n\n옛 본문\n\n다음: 옛 다음\n`);
  fs.appendFileSync(file(dir,'demo','history.md'),`\n\n## 2026-10-17T01:00:00.000Z\n\n요약: 옛 일\n상태: 멈춤\n브랜치: ${stem}\n기록: work/${stem}/history.md\n\n옛 정리\n`);
  const loaded=s.load({name:'demo',conversation_id:'x'});
  assert.match(loaded,/## 열린 작업 브랜치 \(1\)\n- 7eea 옛 이름표 · 마지막 [^\n]+ · 다음: 옛 다음/);
  assert.match(loaded,/합침 ← 7eea · 멈춤/);
  assert.match(s.branch({action:'attach',branch:stem,conversation_id:'x'}),/\n이 대화의 작업 브랜치: 7eea 옛 이름표\n[\s\S]*## 이 작업 브랜치의 최근 기록: 7eea 옛 이름표\n[\s\S]*옛 본문\n\n다음: 옛 다음$/);
  assert.equal(header(dir,stem).status,'열림');
});
test('to-dos belong to the work session: add, list, done, and the open ones ride with the work context',()=>{
  const {dir,s}=setup();s.branch({action:'create',branch:'job',conversation_id:'a'});
  const day=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  assert.match(s.todo({action:'add',text:'메일 "보내기" 확인',due:'2020-01-02',conversation_id:'a'}),new RegExp(`- \\[ \\] ${day} 기한 2020-01-02\\(목\\) "메일 '보내기' 확인"`));
  s.todo({action:'add',text:'둘째',conversation_id:'a'});s.todo({action:'add',text:'셋째',conversation_id:'a'});s.todo({action:'add',text:'넷째',conversation_id:'a'});
  assert.throws(()=>s.todo({action:'add',text:'x',due:'다음주',conversation_id:'a'}),/YYYY-MM-DD/);
  assert.match(read(dir,'demo','todo.md'),/둘째/);
  s.save({summary:'닫음',history:'x',recap:'r',conversation_id:'a'});
  const loaded=s.load({name:'demo',conversation_id:'b'});
  assert.match(loaded,/## 할 일 \(열린 4개, 기한 임박 1개\)\n- 기한 2020-01-02 · 메일 '보내기' 확인\n- 넷째\n- 셋째\n\(전체: session_todo list\)/);
  assert.match(s.todo({action:'done',match:'째',conversation_id:'b'}),/3개라 바꾸지 않았습니다/);
  assert.match(s.todo({action:'done',match:'둘째',conversation_id:'b'}),/끝냄: 둘째/);
  assert.match(read(dir,'demo','todo.md'),/- \[x\] [^\n]+ "둘째"/);
  assert.match(s.todo({action:'list',conversation_id:'b'}),/# 할 일: demo \(열린 3개\)/);
  // Lines written by the earlier tool read the same.
  fs.appendFileSync(file(dir,'demo','todo.md'),'- [ ] 2026-09-18 기한 2026-09-23(수) "옛 도구가 쓴 줄"\n');
  assert.match(s.todo({action:'list',name:'demo'}),/- 기한 2026-09-23 · 옛 도구가 쓴 줄/);
});
test('a fork or subagent (agent_id) may read but not write; the tool surface carries the rules',()=>{
  const {s}=setup();s.save({summary:'메인',history:'본문',conversation_id:'a'});
  for(const [name,args] of [['session_save',{summary:'x',history:'y'}],['session_branch',{action:'create',branch:'f'}],['session_load',{name:'demo'}],
    ['session_create',{name:'other',context:'c'}],['session_todo',{action:'add',text:'t'}],['session_todo',{action:'done',match:'t'}]])
    assert.throws(()=>callTool(s,name,{...args,agent_id:'fork-1'},'a'),new RegExp(FORK_WRITE_REFUSED.slice(0,20)));
  assert.match(callTool(s,'session_read',{action:'recent',agent_id:'fork-1'},'a'),/본문/);
  assert.match(callTool(s,'session_list',{agent_id:'fork-1'},'a'),/demo/);
  assert.match(callTool(s,'session_todo',{action:'list',agent_id:'fork-1'},'a'),/열린 할 일이 없습니다/);
  assert.equal(definitions.some(t=>t.name==='session_finish'),false);
  assert.throws(()=>callTool(s,'session_branch',{action:'create',branch:'x',label:'y'},'a'),/유효하지 않은 인자: label/);
  assert.throws(()=>callTool(s,'session_branch',{action:'main'},'a'),/유효하지 않은 인자: action/);
  for(const word of ['작업 세션','작업 브랜치','저장','기본 포크와 하위 에이전트는 저장하지 않습니다'])assert.match(instructions,new RegExp(word));
  assert.ok(instructions.startsWith('일을 시작할 때는 먼저 start-job 스킬을 불러옵니다.\n\n작업 세션\n'));
  const skill=fs.readFileSync(new URL('../skills/start-job/SKILL.md',import.meta.url),'utf8');
  assert.match(skill,/^---\nname: start-job\ndescription: 일을 시작하기 전에 불러온다\./);assert.doesNotMatch(skill,/disable-model-invocation|delegate-once|context_run|plan-run/);
  for(const step of ['## 1. 문제를 파악한다','## 2. 기존 자료를 먼저 찾는다','## 3. 문제·목표·조건을 맞춘다','## 4. 진행 방식을 고른다','subagent_type "fork"'])assert.ok(skill.includes(step),step);
  const core=fs.readFileSync(new URL('../instructions/HEAD_CORE.md',import.meta.url),'utf8');
  assert.match(core,/load the `start-job` skill first/);assert.doesNotMatch(core,/durable Run/);
  for(const old of ['자리','이름표','작업 주제','지금까지 요약','체크포인트'])assert.doesNotMatch(instructions,new RegExp(old));
  assert.match(instructions,/\n\n할 일\n- 무엇: 작업 세션에 남는 나중에 할 일입니다\. 작업 브랜치가 닫혀도 남습니다\.\n- 언제: [^\n]+session_todo add[^\n]+session_todo done/);
  assert.match(instructions,/\n\n다른 대화\n- 무엇: 이 프로젝트에서 살아 있는 대화와[^\n]+\n- 언제: [^\n]+session_conversations[^\n]+목록의 주소로 SendMessage를 씁니다\.$/);
  const save=definitions.find(t=>t.name==='session_save').description;
  assert.match(instructions,/- 작업 파일: 작업 세션 폴더의 work\/YYYY-MM\/YYYY-MM-DD-<이름>\.md[^\n]+work\/<작업명>\/[^\n]+결과 파일 경로를 이 규칙대로 정해 줍니다\./);
  for(const rule of ['근거 파일 링크와 그 내용','work\\/YYYY-MM\\/YYYY-MM-DD-<이름>\\.md','먼저 파일로 남기고 링크','실행 증거\\(ID·명령·로그\\)는 넣지 않습니다','같은 경계의 일은 모아 한 번에'])assert.match(save,new RegExp(rule));
});
