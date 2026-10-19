import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sessions} from '../core/sessions.mjs';
import {withGraph} from '../core/graph.mjs';
import {callTool,definitions} from '../core/mcp.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT;
test('exact anchor survives a later duplicate legacy timestamp and index rebuild',()=>{
  const dir=fs.mkdtempSync(path.join(root,'duplicates-')),s=sessions(dir);
  s.create({name:'demo',context:'direction',conversation_id:'c'});const base=path.join(dir,'.head/sessions/demo'),file=path.join(base,'history.md');
  const stamp='2026-10-13T00:00:00.000Z',entry=name=>`## ${stamp} work:old\n\n요약: ${name}\n\n${name}\n\n다음: next\n\n`;
  fs.writeFileSync(file,entry('first')+entry('second'));s.branch({action:'create',branch:'frozen',parent:'메인',conversation_id:'c'});
  assert.match(fs.readFileSync(path.join(base,'work/frozen/history.md'),'utf8'),/갈래-ID: demo\/main@2026-10-13T00:00:00.000Z#2/);
  fs.appendFileSync(file,entry('late duplicate'));const inherited=()=>withGraph(dir,g=>g.recent('demo','frozen',0).map(e=>e.summary));
  assert.deepEqual(inherited(),['first','second']);fs.unlinkSync(path.join(dir,'.head/index.sqlite'));assert.deepEqual(inherited(),['first','second']);
});
test('broken session is reported while valid sources continue; archive/work artifacts are not branches',()=>{
  const dir=fs.mkdtempSync(path.join(root,'bad-source-')),s=sessions(dir);s.create({name:'good',context:'D',conversation_id:'c'});
  fs.mkdirSync(path.join(dir,'.head/sessions/broken/context.md'),{recursive:true});fs.mkdirSync(path.join(dir,'.head/sessions/_archive'),{recursive:true});fs.writeFileSync(path.join(dir,'.head/sessions/_archive/context.md'),'archived');
  fs.mkdirSync(path.join(dir,'.head/sessions/good/work/artifact'),{recursive:true});fs.writeFileSync(path.join(dir,'.head/sessions/good/work/artifact/history.md'),'An unrelated artifact, not a branch.');
  const data=withGraph(dir,g=>({names:g.names(),errors:g.errors,branches:g.branches('good')}));assert.deepEqual(data.names,['good']);
  assert.deepEqual(data.branches.map(b=>b.name),[]); // the artifact folder is not a branch, and no branch is opened on its own
  assert.equal(data.errors[0].name,'broken');assert.match(s.list(),/broken: 읽기 실패/);
});
test('session_create requires a purpose: missing/blank context is refused before any folder exists, for MCP and direct callers',()=>{
  const dir=fs.mkdtempSync(path.join(root,'purpose-')),s=sessions(dir),topics=path.join(dir,'.head/sessions'),reason=/방향\(context\)이 필요합니다\. 목적 없는 작업 세션은 만들지 않습니다/;
  const absent=name=>{assert.equal(fs.existsSync(path.join(topics,name)),false);assert.equal(s.connection('c'),null);};
  assert.throws(()=>s.create({name:'none',conversation_id:'c'}),reason);absent('none');
  assert.throws(()=>s.create({name:'empty',context:'',conversation_id:'c'}),reason);absent('empty');
  assert.throws(()=>s.create({name:'blank',context:' \n\t ',conversation_id:'c'}),reason);absent('blank');
  assert.throws(()=>s.create({name:'typed',context:7,conversation_id:'c'}),/context는 문자열이어야 합니다/);absent('typed');
  assert.throws(()=>callTool(s,'session_create',{name:'mcp-none'},'c'),reason);absent('mcp-none');
  assert.throws(()=>callTool(s,'session_create',{name:'mcp-blank',context:'   '},'c'),reason);absent('mcp-blank');
  assert.deepEqual(withGraph(dir,g=>g.names()),[]);
  assert.deepEqual(definitions.find(t=>t.name==='session_create').inputSchema.required,['name','context']);
  assert.match(callTool(s,'session_create',{name:'real',context:'  PURPOSE-LINE  '},'c'),/PURPOSE-LINE/);
  assert.equal(fs.readFileSync(path.join(topics,'real/context.md'),'utf8'),'  PURPOSE-LINE  ');assert.equal(s.connection('c').session,'real');
  assert.match(s.create({name:'real',context:'again',conversation_id:'c2'}),/이미 있습니다/);
});
