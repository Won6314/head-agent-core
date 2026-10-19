import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {sessions} from '../core/sessions.mjs';
import {withGraph} from '../core/graph.mjs';
import {transition} from '../core/state.mjs';
import {processEvidence} from '../core/liveness.mjs';
import {branchHeader} from '../core/branch-format.mjs';
import {lifecycleOf,LIVE,TODO,STANDBY,DONE,ABANDONED} from '../core/lifecycle.mjs';
import {board,renderBoard} from '../core/board.mjs';
import {callTool} from '../core/mcp.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT||os.tmpdir();
const fresh=()=>fs.mkdtempSync(path.join(root,'lifecycle-'));
const live=(dir,id)=>transition(dir,{host:'claude',conversation_id:id,status:'waiting',liveness:processEvidence()});
const gone=(dir,id)=>transition(dir,{host:'claude',conversation_id:id,status:'ended',liveness:null});
const file=(dir,...parts)=>path.join(dir,'.head/sessions',...parts);
const read=(dir,...parts)=>fs.readFileSync(file(dir,...parts),'utf8');
const seat=(s,id)=>s.connection(id).branch;

test('every conversation gets its own branch; a save writes the body there and one index line on main',()=>{
  const dir=fresh(),s=sessions(dir);
  live(dir,'c1');s.create({name:'demo',context:'# demo\n\n할 일 CLI를 만든다.',conversation_id:'c1',label:'할 일 CLI 만들자'});
  const one=seat(s,'c1');assert.ok(one&&one!=='main');
  assert.match(read(dir,'demo/work',one,'history.md'),/^<!-- head-context branch:1 -->\n# .+\n\n이름표: 할 일 CLI 만들자\n/);
  s.save({summary:'설계 정함',history:'런타임과 저장 방식. work/design.md',next:'명령 구현',conversation_id:'c1'});
  assert.match(read(dir,'demo/work',one,'history.md'),/요약: 설계 정함\n\n런타임과 저장 방식/);
  const index=read(dir,'demo/history.md');
  assert.match(index,/## \d{4}[^\n]+\n\n요약: 설계 정함\n이름표: 설계 정함 · 본문: work\/.+\/history\.md\n/);
  assert.equal(index.trim().split('\n').length,4);
  assert.doesNotMatch(index,/런타임과 저장 방식/);
  // The label follows the newest summary, so no one has to name a branch.
  assert.equal(branchHeader(read(dir,'demo/work',one,'history.md')).label,'설계 정함');
  // A second conversation on the same topic works beside the first, not inside its file.
  live(dir,'c2');const identity=s.load({name:'demo',conversation_id:'c2',label:'문서 정리'});
  const two=seat(s,'c2');assert.notEqual(two,one);
  assert.match(identity,/# 기록 지도 \(최신이 위\)\n\* [0-9a-f]{5} \d\d-\d\d \d\d:\d\d 설계 정함/);assert.match(identity,/자리: 브랜치 .+ · 이름표: 문서 정리/);
  assert.throws(()=>s.load({name:'demo',branch:one,conversation_id:'c2'}),/살아 있는 대화가 붙어 있습니다/);
  // Reloading the same place keeps it (compact, /clear, an explicit session_load).
  s.load({conversation_id:'c2'});assert.equal(seat(s,'c2'),two);
});
test('a next-less save demands the recap and puts it at the top of the branch; a save with a next refuses one',()=>{
  const dir=fresh(),s=sessions(dir);live(dir,'c1');
  s.create({name:'demo',context:'방향',conversation_id:'c1',label:'일'});
  const stem=seat(s,'c1');
  assert.throws(()=>s.save({summary:'끝',history:'본문',conversation_id:'c1'}),/recap\(지금까지 요약\)이 필요합니다/);
  assert.throws(()=>s.save({summary:'계속',history:'본문',next:'더',recap:'요약',conversation_id:'c1'}),/다음이 있는 저장에는 recap을 받지 않습니다/);
  s.save({summary:'1단계',history:'첫 본문',next:'2단계',conversation_id:'c1'});
  s.save({summary:'2단계 끝',history:'둘째 본문',recap:'1단계와 2단계를 모두 했다.',conversation_id:'c1'});
  const text=read(dir,'demo/work',stem,'history.md');
  assert.match(text,/상태: 열림\n\n## 지금까지 요약\n\n1단계와 2단계를 모두 했다\.\n/);
  assert.ok(text.indexOf('## 지금까지 요약')<text.indexOf('요약: 1단계'));
  s.save({summary:'3단계 끝',history:'셋째',recap:'세 단계 모두 끝났다.',conversation_id:'c1'});
  const after=read(dir,'demo/work',stem,'history.md');
  assert.equal(branchHeader(after).recap,'세 단계 모두 끝났다.');
  assert.doesNotMatch(after,/1단계와 2단계를 모두 했다/);
  assert.equal(after.match(/## 지금까지 요약/g).length,1);
  assert.match(s.load({conversation_id:'c1'}),/# 지금까지 요약 \(이 자리\)\n세 단계 모두 끝났다\./);
});
test('status is computed from liveness, the last next and the standby window',()=>{
  const now=Date.parse('2026-10-16T00:00:00.000Z'),day=86400000;
  const open=next=>({status:'열림',entries:[{summary:'s',next,timestamp:new Date(now-2*day).toISOString()}]});
  assert.equal(lifecycleOf({...open('더'),alive:true,now}),LIVE);
  assert.equal(lifecycleOf({...open('더'),now}),TODO);
  assert.equal(lifecycleOf({...open(''),now}),DONE);
  assert.equal(lifecycleOf({...open('더'),now,standbyDays:1}),STANDBY);
  assert.equal(lifecycleOf({status:'중단',entries:[],now}),ABANDONED);
  assert.equal(lifecycleOf({status:'열림',entries:[],now}),DONE);
});
test('a conversation that ends merges its branch into main: 끝남 carries the recap, 멈춤 the pending work',()=>{
  const dir=fresh(),s=sessions(dir);
  live(dir,'done');s.create({name:'demo',context:'방향',conversation_id:'done',label:'끝낼 일'});
  const closed=seat(s,'done');
  s.save({summary:'마지막',history:'본문',recap:'이 자리에서 한 일 전체.',conversation_id:'done'});
  gone(dir,'done');assert.equal(s.closed({conversation_id:'done'}),1);
  const main=read(dir,'demo/history.md');
  assert.match(main,/요약: 마지막\n상태: 끝남\n브랜치: .+\n기록: work\/.+\/history\.md\n\n이 자리에서 한 일 전체\./);
  assert.equal(branchHeader(read(dir,'demo/work',closed,'history.md')).status,'끝남');
  assert.equal(s.closed({conversation_id:'done'}),0); // already closed: nothing more is written
  live(dir,'stop');s.load({name:'demo',conversation_id:'stop',label:'멈출 일'});
  const paused=seat(s,'stop');
  s.save({summary:'절반',history:'본문1',recap:'절반까지 했다.',conversation_id:'stop'});
  s.save({summary:'조금 더',history:'본문2',next:'남은 절반',conversation_id:'stop'});
  gone(dir,'stop');s.closed({conversation_id:'stop'});
  const stopped=read(dir,'demo/history.md').split('## ').at(-1);
  assert.match(stopped,/상태: 멈춤/);assert.match(stopped,/절반까지 했다\./);
  assert.match(stopped,/이어서 한 일:\n- 조금 더/);assert.match(stopped,/마지막 다음: 남은 절반/);
  assert.equal(branchHeader(read(dir,'demo/work',paused,'history.md')).status,'멈춤');
  // The merge entry keeps the old marker lines, so the graph still draws a merge edge.
  const map=s.inspect({action:'map',name:'demo'});
  assert.equal((map.match(/ 합침 ← /g)||[]).length,2);
  // Resuming reopens the branch, and the next close adds one more merge entry.
  live(dir,'again');s.load({name:'demo',conversation_id:'again',label:'다시'});s.branch({action:'attach',branch:paused,conversation_id:'again'});
  assert.equal(branchHeader(read(dir,'demo/work',paused,'history.md')).status,'열림');
  s.save({summary:'남은 절반 끝',history:'본문3',recap:'전부 끝났다.',conversation_id:'again'});
  gone(dir,'again');s.closed({conversation_id:'again'});
  const entries=withGraph(dir,g=>g.recent('demo','main',0)).filter(e=>e.branch===paused);
  assert.deepEqual(entries.map(e=>e.status),['멈춤','끝남']);
});
test('an empty branch is dropped when it is left or when its conversation ends',()=>{
  const dir=fresh(),s=sessions(dir);
  live(dir,'c1');s.create({name:'demo',context:'방향',conversation_id:'c1',label:'일'});
  s.save({summary:'한 일',history:'본문',next:'남은 일',conversation_id:'c1'});
  const kept=seat(s,'c1');
  gone(dir,'c1');
  live(dir,'c2');s.load({name:'demo',conversation_id:'c2',label:'빈 자리'});
  const empty=seat(s,'c2'),before=read(dir,'demo/history.md').match(/## /g).length;
  // Taking over the pending work throws away the empty branch it was handed.
  s.branch({action:'attach',branch:kept,conversation_id:'c2'});
  assert.equal(fs.existsSync(file(dir,'demo/work',empty)),false);
  assert.equal(seat(s,'c2'),kept);
  assert.equal(read(dir,'demo/history.md').match(/## /g).length,before); // no merge entry for an empty branch
  live(dir,'c3');s.load({name:'demo',conversation_id:'c3',label:'또 빈 자리'});
  const alsoEmpty=seat(s,'c3');gone(dir,'c3');s.closed({conversation_id:'c3'});
  assert.equal(fs.existsSync(file(dir,'demo/work',alsoEmpty)),false);
});
test('late cleanup closes on the next read; standby drops out of pending work, the board and the list but stays readable',()=>{
  const dir=fresh(),s=sessions(dir);
  live(dir,'c1');s.create({name:'demo',context:'방향',conversation_id:'c1',label:'일'});
  s.save({summary:'절반',history:'본문',next:'남은 절반',conversation_id:'c1'});
  const stem=seat(s,'c1');
  gone(dir,'c1'); // ended without its end hook
  assert.match(s.list(),/남은 일 1개/); // reading the list closes it
  assert.equal(branchHeader(read(dir,'demo/work',stem,'history.md')).status,'멈춤');
  live(dir,'c2');assert.match(s.load({name:'demo',conversation_id:'c2',label:'다음 대화'}),/# 남은 일 \(다른 자리에서 멈춘 일\)\n- '절반' · 다음: 남은 절반/);
  assert.equal(board(dir)[0].branches.filter(b=>b.name===stem)[0].lifecycle,'남은 일');
  assert.match(renderBoard(board(dir),{all:true}),/남은 일/);
  gone(dir,'c2');
  fs.writeFileSync(path.join(dir,'.head/config.json'),JSON.stringify({standby_days:0}));
  const old=sessions(dir);
  assert.doesNotMatch(old.list(),/남은 일/);
  assert.equal(old.views()[0].branches.length,0);
  live(dir,'c3');assert.doesNotMatch(old.load({name:'demo',conversation_id:'c3',label:'셋째'}),/# 남은 일/);
  // Nothing was deleted: the record is still there and the user can pull it back out.
  assert.match(old.inspect({action:'recent',name:'demo',branch:stem,count:5}),/본문/);
  live(dir,'c4');assert.match(old.load({name:'demo',branch:stem,conversation_id:'c4'}),new RegExp(`자리: 브랜치 ${stem}`));
  assert.equal(branchHeader(read(dir,'demo/work',stem,'history.md')).status,'열림');
});
test('session_finish closes the place now and gives the conversation a fresh one; abandon keeps the reason',()=>{
  const dir=fresh(),s=sessions(dir);
  live(dir,'c1');s.create({name:'demo',context:'방향',conversation_id:'c1',label:'일'});
  const first=seat(s,'c1');
  s.save({summary:'한 일',history:'본문',recap:'다 했다.',conversation_id:'c1'});
  const message=s.finish({conversation_id:'c1'});
  assert.match(message,/메인에 정리 항목 1개/);
  const second=seat(s,'c1');assert.notEqual(second,first);
  assert.equal(branchHeader(read(dir,'demo/work',first,'history.md')).status,'끝남');
  assert.match(read(dir,'demo/history.md'),/상태: 끝남/);
  assert.throws(()=>s.finish({conversation_id:'c1',branch:'main'}),/메인은 색인이라 닫지 않습니다/);
  s.save({summary:'중단할 일',history:'본문',next:'계속',conversation_id:'c1'});
  assert.throws(()=>s.branch({action:'abandon',branch:second,conversation_id:'c1'}),/reason/);
  s.branch({action:'abandon',branch:second,reason:'사용자가 방향을 바꿨다.',conversation_id:'c1'});
  assert.match(read(dir,'demo/history.md'),/상태: 중단[\s\S]+이유: 사용자가 방향을 바꿨다\./);
  assert.equal(branchHeader(read(dir,'demo/work',second,'history.md')).status,'중단');
  // The conversation goes on in a third place; the abandoned one takes nothing more.
  const third=seat(s,'c1');assert.ok(third!==second&&third!==first);
  s.save({summary:'새 일',history:'본문',next:'계속',conversation_id:'c1'});
  assert.doesNotMatch(read(dir,'demo/work',second,'history.md'),/새 일/);
  assert.throws(()=>s.load({branch:second,conversation_id:'c1'}),/중단/);
});
test('the end of a conversation closes its place, except the end /clear writes on the way to the next one',()=>{
  const dir=fresh(),s=sessions(dir);
  live(dir,'c1');s.create({name:'demo',context:'방향',conversation_id:'c1',label:'일'});
  s.save({summary:'한 일',history:'본문',next:'남은 일',conversation_id:'c1'});
  const stem=seat(s,'c1'),main=()=>read(dir,'demo/history.md').match(/## /g).length;
  const end=(id,reason)=>{const r=spawnSync(process.execPath,[path.resolve('scripts/hook.mjs')],
    {input:JSON.stringify({hook_event_name:'SessionEnd',session_id:id,reason,cwd:dir}),env:{...process.env,CLAUDE_PROJECT_DIR:dir},encoding:'utf8'});
    assert.equal(r.status,0);assert.equal(r.stderr,'');};
  end('c1','clear'); // the place is handed to the conversation /clear is about to start
  assert.equal(main(),1);
  assert.equal(branchHeader(read(dir,'demo/work',stem,'history.md')).status,'열림');
  end('c1','prompt_input_exit');
  assert.equal(main(),2);
  assert.match(read(dir,'demo/history.md'),/상태: 멈춤/);
});
test('the tool surface carries the new rules and refuses the removed arguments',()=>{
  const dir=fresh(),s=sessions(dir);live(dir,'c1');
  callTool(s,'session_create',{name:'demo',context:'방향'},'c1');
  assert.throws(()=>callTool(s,'session_branch',{action:'main'},'c1'),/유효하지 않은 인자: action/);
  assert.throws(()=>callTool(s,'session_load',{keep_open:true},'c1'),/유효하지 않은 인자: keep_open/);
  assert.throws(()=>callTool(s,'session_branch',{action:'create',topic:'x'},'c1'),/유효하지 않은 인자: topic/);
  assert.throws(()=>callTool(s,'session_save',{summary:'s',history:'h'},'c1'),/recap/);
  assert.match(callTool(s,'session_save',{summary:'s',history:'h',recap:'전부'},'c1'),/메인에 색인 한 줄/);
  assert.match(callTool(s,'session_branch',{action:'create',label:'따로 할 일'},'c1'),/이름표: 따로 할 일/);
});
