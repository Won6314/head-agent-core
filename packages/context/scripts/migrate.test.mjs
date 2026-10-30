import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {sessions} from '../core/sessions.mjs';
import {migrate,describe} from '../core/migrate.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT||os.tmpdir();
const branch=(dir,name,{label,status='열림',parent='메인',save}={})=>{
  const f=path.join(dir,'.head/sessions/demo/work',name,'history.md');fs.mkdirSync(path.dirname(f),{recursive:true});
  fs.writeFileSync(f,`<!-- head-context branch:1 -->\n# ${name}\n\n이름표: ${label||name}\n시작: 2026-10-19T00:00:00.000Z\n갈래: demo/${parent}@없음\n갈래-ID: \n상태: ${status}\n${save?`\n## 2026-10-19T01:00:00.000Z\n\n요약: ${save}\n\n본문\n`:''}`);
};
test('0.6 → 0.7: old state files and empty automatic branches move under .head/state/_0.6, repeated (fork) labels keep one, a second run finds nothing',()=>{
  const dir=fs.mkdtempSync(path.join(root,'migrate-')),s=sessions(dir);s.create({name:'demo',context:'D',conversation_id:'c'});
  const state=path.join(dir,'.head/state');for(const k of ['activity','pending-load','subtasks']){fs.mkdirSync(path.join(state,k),{recursive:true});fs.writeFileSync(path.join(state,k,'claude-x.json'),'{}');}
  const empty='branch-20261019T112907-810396ac',kept='branch-20261019T100000-aaaa1111',parent='branch-20261019T090000-bbbb2222',paused='branch-20261019T080000-cccc3333';
  branch(dir,empty,{label:'코어 분리 (fork) (fork) (fork)'});
  branch(dir,kept,{label:'일 (fork) (fork)',save:'저장 있음'});
  branch(dir,parent,{label:'부모'});branch(dir,'child-work',{parent});
  branch(dir,paused,{status:'멈춤',label:'새 세션'});
  branch(dir,'named-empty',{label:'이름 있는 빈 브랜치'});
  fs.writeFileSync(path.join(state,'conversations','claude-on-empty.json'),JSON.stringify({host:'claude',conversation_id:'on-empty',session:'demo',branch:empty}));
  const dry=migrate(dir);
  assert.deepEqual(dry.state,[{kind:'activity',count:1},{kind:'pending-load',count:1}]);
  assert.deepEqual(dry.branches.map(b=>b.branch).sort(),[empty,paused].sort()); // not the one others were opened from, not a named one
  assert.deepEqual(dry.labels,[{session:'demo',branch:kept,from:'일 (fork) (fork)',to:'일 (fork)'}]);assert.equal(dry.connections,1);
  assert.ok(fs.existsSync(path.join(state,'activity')));assert.match(describe(dry),/미리 보기/); // a dry run changes nothing
  migrate(dir,{apply:true});
  assert.deepEqual(fs.readdirSync(state).sort(),['_0.6','conversations','subtasks']);
  assert.ok(fs.existsSync(path.join(state,'_0.6/branches/demo',empty,'history.md')));assert.equal(fs.existsSync(path.join(dir,'.head/sessions/demo/work',empty)),false);
  assert.match(fs.readFileSync(path.join(dir,'.head/sessions/demo/work',kept,'history.md'),'utf8'),/^이름표: 일 \(fork\)$/m);
  assert.equal(JSON.parse(fs.readFileSync(path.join(state,'conversations/claude-on-empty.json'),'utf8')).branch,null);
  assert.equal(s.connection('on-empty').branch,null);
  const again=migrate(dir);assert.deepEqual([again.state,again.branches,again.labels,again.connections],[[],[],[],0]);
  assert.match(s.load({name:'demo',conversation_id:'c'}),/## 열린 작업 브랜치 \(4\)/); // kept, parent, child-work, named-empty
});
