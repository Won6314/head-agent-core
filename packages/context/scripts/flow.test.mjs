import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sessions} from '../core/sessions.mjs';
import {withGraph} from '../core/graph.mjs';
import {parseHistory,mapSummary} from '../core/history.mjs';
import opencode from '../hosts/opencode/plugin.mjs';
import {callTool} from '../core/mcp.mjs';
import {spawnSync} from 'node:child_process';
const root=process.env.HEAD_CONTEXT_TEST_ROOT;
const fixture=()=>{const dir=fs.mkdtempSync(path.join(root,'flow-')),s=sessions(dir);s.create({name:'demo',context:'FLOW DIRECTION',conversation_id:'seed'});s.save({summary:'MAIN SUMMARY',history:'MAIN FULL BODY',next:'main cursor',conversation_id:'seed'});return {dir,s};};

test('map summary precedence: explicit then literal work label then body; graph has no label text',()=>{
  const {dir,s}=fixture(),file=path.join(dir,'.head/sessions/demo/history.md');
  fs.writeFileSync(file,'## 2020-01-01 work:LABEL_SECRET_42\n\nfirst body\n다음: x\n\n## 2020-01-02 work:ignored\n\n요약:explicit summary\nbody\n다음: x\n\n## 2020-01-03 run:not-work\n\n**body** fallback\n다음: x\n');
  const map=s.inspect({action:'map',conversation_id:'seed'});assert.match(map,/LABEL_SECRET_42/);assert.match(map,/explicit summary/);assert.match(map,/body fallback/);assert.doesNotMatch(map,/not-work|ignored/);
  const entries=parseHistory(fs.readFileSync(file,'utf8'));assert.deepEqual(entries.map(e=>mapSummary(e).source),['label','summary','body']);assert.equal(entries[0].summary,'first body');
  assert.ok(!JSON.stringify(withGraph(dir,g=>g.db.prepare('SELECT * FROM nodes').all())).includes('LABEL_SECRET_42'));
});
test('work context: data only — context.md, this branch as time+body with the newest next, open branches, to-dos, the map',()=>{
  const {dir,s}=fixture();s.branch({action:'create',branch:'job',conversation_id:'seed'});
  for(let i=0;i<6;i++)s.save({summary:'SUM-'+i,history:'BODY-'+i,next:'NEXT-'+i,conversation_id:'seed'});
  s.todo({action:'add',text:'할 일 하나',conversation_id:'seed'});
  const text=s.load({conversation_id:'seed'});
  assert.ok(text.startsWith('# 작업 세션: demo\nFLOW DIRECTION\n\n## 이 대화의 작업 브랜치: job\n'));
  assert.match(text,/### [0-9a-f]{5} \d\d-\d\d \d\d:\d\d SUM-3\nBODY-3\n\n### [^\n]+SUM-4\nBODY-4\n\n### [^\n]+SUM-5\nBODY-5\n\n다음: NEXT-5\n/);
  assert.doesNotMatch(text,/BODY-2|NEXT-4|요약:|demo\/main@|MAIN FULL BODY/);
  assert.match(text,/## 열린 작업 브랜치 \(1\)\n- job \(이 대화\) · 마지막 [^\n]+ · 다음: NEXT-5\n/);
  assert.match(text,/## 할 일 \(열린 1개\)\n- 할 일 하나\n/);
  assert.match(text,/## 흐름 \(최신이 위\)\n\| \* [0-9a-f]{5} [^\n]+ SUM-5 \(지금: job\)\n/);
  assert.match(text,/\|\/\n\* [0-9a-f]{5} [^\n]+ MAIN SUMMARY \(main\)$/);
  // No reading guide in the data: the meaning lives in the server instructions.
  assert.doesNotMatch(text,/읽는 법|이어 가거나|자리|이름표|남은 일/);
  assert.match(s.load({conversation_id:'seed',map_limit:3}),/그 앞 4개 — session_read map/);
  // A conversation on main gets no branch section and no bodies.
  const main=s.load({name:'demo',conversation_id:'other'});assert.doesNotMatch(main,/이 대화의 작업 브랜치|BODY-/);
});
test('Claude hook: work context in the hook when it fits; over the cap the model is told to call session_load, and nothing is left behind',()=>{
  const {dir,s}=fixture();callTool(s,'project_setup',{action:'never_ask',step:'setup'},undefined,dir); // the first-run guide is covered in first-run.test
  const hook=(id,source='startup')=>spawnSync(process.execPath,[path.resolve('scripts/hook.mjs')],{input:JSON.stringify({hook_event_name:'SessionStart',session_id:id,source,cwd:dir}),env:{...process.env,CLAUDE_PROJECT_DIR:dir,HEAD_CONTEXT_SESSION:'demo'},encoding:'utf8'});
  const small=hook('small');assert.equal(small.status,0);assert.equal(JSON.parse(small.stdout).hookSpecificOutput.additionalContext,s.load({conversation_id:'small'}));
  assert.equal(hook('small','resume').stdout,'');
  s.branch({action:'create',branch:'big',conversation_id:'seed'});
  for(let i=0;i<5;i++)s.save({summary:'BIG-'+i,history:'긴 본문 '.repeat(800),next:'더',conversation_id:'seed'});
  const big=hook('seed','compact');const context=JSON.parse(big.stdout).hookSpecificOutput.additionalContext;
  assert.match(context,/session_load를 불러/);assert.ok(big.stdout.length<10000);
  assert.match(context,/작업 세션: demo · 작업 브랜치: big/);
  assert.equal(fs.existsSync(path.join(dir,'.head/state/pending-load')),false);
});
test('OpenCode pushes the work context with the instructions and fills the tool ids; a native child may only read',async()=>{
  const {dir,s}=fixture();const before=process.env.HEAD_CONTEXT_SESSION;
  try{process.env.HEAD_CONTEXT_SESSION='demo';
    const hooks=await opencode.server({directory:dir,client:{session:{get:async({path})=>({data:{id:path.id,parentID:path.id==='ses_child'?'ses_parent':undefined}})}}});
    const out={system:[]};await hooks['experimental.chat.system.transform']({sessionID:'ses_parent'},out);
    assert.match(out.system.join('\n'),/작업 세션\n- 무엇/);assert.match(out.system.join('\n'),/FLOW DIRECTION/);
    const args={action:'map',agent_id:'forged'};await hooks['tool.execute.before']({sessionID:'ses_parent',tool:'head_context_session_read'},{args});
    assert.deepEqual(args,{action:'map',conversation_id:'ses_parent'});
    const child={summary:'x',history:'y'};await hooks['tool.execute.before']({sessionID:'ses_child',tool:'head_context_session_save'},{args:child});
    assert.deepEqual(child,{summary:'x',history:'y',conversation_id:'ses_parent',agent_id:'ses_child'});
    assert.throws(()=>callTool(sessions(dir,{host:'opencode'}),'session_save',{summary:'x',history:'y',agent_id:'ses_child'},'ses_parent'),/저장합니다/);
    const again={system:[]};await hooks['experimental.chat.system.transform']({sessionID:'ses_parent'},again);assert.match(again.system.join('\n'),/FLOW DIRECTION/);
  }finally{if(before===undefined)delete process.env.HEAD_CONTEXT_SESSION;else process.env.HEAD_CONTEXT_SESSION=before;}
});
