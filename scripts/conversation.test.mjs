import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {sessions} from '../core/sessions.mjs';
import {evidenceAlive,pidAlive} from '../core/liveness.mjs';
import {ownerOf,currentConversation,sessionEvidence,aliveConversation,registryDir} from '../hosts/claude/process.mjs';
import {ancestry,continuations,continuedInto,copyAncestors} from '../hosts/claude/recovery.mjs';
import {event as claudeEvent} from '../hosts/claude/state.mjs';
import {transition,activity} from '../core/state.mjs';
import {board} from '../core/board.mjs';
const root=process.env.HEAD_CONTEXT_TEST_ROOT||os.tmpdir();
// A fixture of the two things Claude Code writes down: one registry file per running
// conversation in ~/.claude/sessions, and one record file per conversation.
const stage=()=>{
  const dir=fs.mkdtempSync(path.join(root,'conversation-'));
  const registry=path.join(dir,'sessions'),records=path.join(dir,'records');
  fs.mkdirSync(registry);fs.mkdirSync(records);
  process.env.HEAD_CONTEXT_CLAUDE_SESSIONS=registry;
  const dead=spawnSync(process.execPath,['-e','0']).pid; // a pid that has already exited
  return {dir,registry,records,dead,
    running:(pid,id)=>fs.writeFileSync(path.join(registry,`${pid}.json`),JSON.stringify({pid,sessionId:id,cwd:dir,startedAt:Date.now(),status:'idle'})),
    stop:pid=>fs.rmSync(path.join(registry,`${pid}.json`),{force:true}),
    transcript:(id,lines=[])=>{const file=path.join(records,`${id}.jsonl`);fs.writeFileSync(file,lines.map(l=>JSON.stringify(l)).join('\n')+(lines.length?'\n':''));return file;},
    continues:(from,to)=>fs.appendFileSync(path.join(records,`${from}.jsonl`),JSON.stringify({type:'continued-in',timestamp:new Date().toISOString(),sessionId:from,continuedInSessionId:to})+'\n')};
};
const after=()=>delete process.env.HEAD_CONTEXT_CLAUDE_SESSIONS;
const seat=(s,id)=>s.connection(id).branch;
const begin=(s,stage,id,extra={})=>{
  const source=extra.source||(extra.forked_from?'fork':'startup');
  const file=stage.transcript(id,extra.lines||[{type:'user',sessionId:id}]);
  return s.start({conversation_id:id,source,session_name:extra.session_name,title:extra.title,
    origins:ancestry(stage.dir,{session_id:id,transcript_path:file,source,forked_from:extra.forked_from})});
};

test('liveness is the host registry plus the pid, with no process tree and no platform branch',t=>{
  t.after(after);
  const s=stage();
  s.running(process.pid,'alive-one');
  assert.equal(ownerOf('alive-one')?.pid,process.pid);
  assert.equal(aliveConversation('alive-one'),true);
  assert.equal(aliveConversation('never-existed'),false);
  const evidence=sessionEvidence('alive-one');
  assert.equal(evidence.session_id,'alive-one');assert.equal(evidence.registry,path.join(s.registry,`${process.pid}.json`));
  assert.equal(evidenceAlive({liveness:evidence}),true);
  // /clear gives the same process a new conversation: the old id is no longer alive.
  s.running(process.pid,'alive-two');
  assert.equal(evidenceAlive({liveness:evidence}),false);
  assert.equal(aliveConversation('alive-two'),true);
  // A registry entry whose process is gone, and a file that is not the shape we expect.
  s.running(s.dead,'dead-one');
  assert.equal(pidAlive(s.dead),false);assert.equal(aliveConversation('dead-one'),false);
  fs.writeFileSync(path.join(s.registry,'77.json'),'not json at all');
  fs.writeFileSync(path.join(s.registry,'notes.txt'),'ignored');
  assert.equal(ownerOf('alive-two')?.pid,process.pid);
  assert.equal(currentConversation(),null); // this test process's parent runs no conversation
  s.stop(process.pid);assert.equal(aliveConversation('alive-two'),false);
});
test('/clear carries the place over to the new conversation and ends the old one',t=>{
  t.after(after);
  const stageOne=stage(),store=sessions(stageOne.dir);
  stageOne.running(4242,'first');
  transition(stageOne.dir,{host:'claude',conversation_id:'first',status:'waiting',liveness:sessionEvidence('first')});
  store.create({name:'demo',context:'방향',conversation_id:'first',label:'첫 일'});
  store.save({summary:'한 일',history:'본문',next:'남은 일',conversation_id:'first'});
  const place=seat(store,'first');
  // The same process now reports a different conversation; the records say so, not the cache.
  stageOne.running(4242,'second');
  const links=ancestry(stageOne.dir,{session_id:'second',transcript_path:stageOne.transcript('second'),source:'clear'});
  assert.deepEqual(links,[{conversation_id:'first',kind:'clear'}]);
  const started=begin(store,stageOne,'second',{source:'clear'});
  assert.equal(started.session,'demo');assert.equal(started.stem,place);
  assert.match(started.text,/본문/); // /clear starts empty, so the identity is put back
  assert.equal(activity(stageOne.dir,'claude','first').status,'ended');
  assert.equal(seat(store,'second'),place);
  // One place, one branch: no second branch was made and nothing was merged into main.
  assert.equal(fs.readdirSync(path.join(stageOne.dir,'.head/sessions/demo/work')).length,1);
  assert.equal(fs.readFileSync(path.join(stageOne.dir,'.head/sessions/demo/history.md'),'utf8').match(/## /g).length,1);
  // The old conversation's end arrives after the handover. The registry has not caught up
  // with the new conversation yet, so its liveness is unknown — and unknown is not dead:
  // the place it was just handed stays open instead of being merged away.
  transition(stageOne.dir,{host:'claude',conversation_id:'second',status:'waiting',liveness:null});
  transition(stageOne.dir,{host:'claude',conversation_id:'first',status:'ended',liveness:null});
  assert.equal(store.closed({conversation_id:'first'}),0);
  assert.equal(fs.readFileSync(path.join(stageOne.dir,'.head/sessions/demo/history.md'),'utf8').match(/## /g).length,1);
  assert.equal(seat(store,'second'),place);
  // Once the new conversation really ends, the place merges once.
  transition(stageOne.dir,{host:'claude',conversation_id:'second',status:'ended',liveness:null});
  assert.equal(store.closed({conversation_id:'second'}),1);
  assert.equal(fs.readFileSync(path.join(stageOne.dir,'.head/sessions/demo/history.md'),'utf8').match(/## /g).length,2);
});
test('a continued-in chain is one place however long it is, and the records beat a stale cache',t=>{
  t.after(after);
  const s=stage(),store=sessions(s.dir);
  s.running(11,'a');
  transition(s.dir,{host:'claude',conversation_id:'a',status:'waiting',liveness:sessionEvidence('a')});
  store.create({name:'demo',context:'방향',conversation_id:'a',label:'이어지는 일'});
  store.save({summary:'한 일',history:'본문',next:'남은 일',conversation_id:'a'});
  const place=seat(store,'a');
  // a -> b -> c, and b was never connected: c still lands on a's place.
  s.transcript('a');s.continues('a','b');s.transcript('b');s.continues('b','c');
  assert.equal(continuedInto(path.join(s.records,'a.jsonl')),'b');
  assert.deepEqual([...continuations(s.records).entries()].sort(),[['b','a'],['c','b']]);
  const links=ancestry(s.dir,{session_id:'c',transcript_path:path.join(s.records,'c.jsonl')});
  assert.deepEqual(links,[{conversation_id:'b',kind:'continued'},{conversation_id:'a',kind:'continued'}]);
  s.running(12,'c');
  const started=begin(store,s,'c',{source:'resume'}); // a continuation arrives as a resumed copy
  assert.equal(started.stem,place);assert.equal(started.text,''); // the copy already carries the context
  assert.equal(activity(s.dir,'claude','a').status,'ended');
  // A restart of c re-derives the same place from the same records.
  assert.equal(begin(store,s,'c',{source:'resume'}).stem,place);
  assert.equal(fs.readdirSync(path.join(s.dir,'.head/sessions/demo/work')).length,1);
  // A cache that disagrees with the records loses: c is written onto a wrong branch by hand.
  store.branch({action:'create',branch:'wrong',label:'잘못 적힌 자리',conversation_id:'c'});
  assert.equal(seat(store,'c'),'wrong');
  assert.equal(begin(store,s,'c',{source:'resume'}).stem,place);
  assert.equal(seat(store,'c'),place);
});
test('forks nest without a depth limit: each one branches under the parent directly above it',t=>{
  t.after(after);
  const s=stage(),store=sessions(s.dir);
  s.running(21,'root');
  transition(s.dir,{host:'claude',conversation_id:'root',status:'waiting',liveness:sessionEvidence('root')});
  store.create({name:'demo',context:'방향',conversation_id:'root',label:'뿌리 일'});
  store.save({summary:'뿌리 저장',history:'뿌리 본문',next:'더',conversation_id:'root'});
  const rootSeat=seat(store,'root');
  // fork 1 of root, fork 2 of fork 1, fork 3 of fork 2 — the host names the parent above.
  const chain=[['f1','root'],['f2','f1'],['f3','f2']];
  for(const [child,parent] of chain){
    s.running(20+chain.findIndex(c=>c[0]===child)+2,child);
    transition(s.dir,{host:'claude',conversation_id:parent,status:'waiting',liveness:sessionEvidence(parent)});
    const started=begin(store,s,child,{forked_from:parent,title:`${child} 포크`});
    assert.equal(started.session,'demo');
    assert.equal(started.text,''); // a fork starts from a copy, so nothing is re-loaded
    assert.notEqual(seat(store,child),seat(store,parent));
    store.save({summary:`${child} 저장`,history:`${child} 본문`,next:'더',conversation_id:child});
  }
  const headers=store.read('demo').branches;
  const parentOf=name=>headers.find(b=>b.name===name).parent;
  assert.equal(parentOf(seat(store,'f1')),rootSeat);
  assert.equal(parentOf(seat(store,'f2')),seat(store,'f1'));
  assert.equal(parentOf(seat(store,'f3')),seat(store,'f2'));
  // The whole line of work is readable from the deepest fork.
  const deep=store.inspect({action:'recent',conversation_id:'f3',count:10});
  assert.match(deep,/뿌리 본문[\s\S]*f1 본문[\s\S]*f2 본문[\s\S]*f3 본문/);
  assert.match(store.inspect({action:'map',branch:seat(store,'f3'),conversation_id:'f3'}),/f3 저장/);
  // A restarted fork keeps its own branch instead of taking a new one each start.
  const before=seat(store,'f3');
  assert.equal(begin(store,s,'f3',{forked_from:'f2'}).stem,before);
  assert.equal(fs.readdirSync(path.join(s.dir,'.head/sessions/demo/work')).length,4);
  // Only the parent directly above is used: forkedFrom, which names the oldest ancestor,
  // is the last resort and never overrides a nearer parent.
  const links=ancestry(s.dir,{session_id:'f3',transcript_path:s.transcript('f3',[{type:'user',forkedFrom:{sessionId:'root'}}]),forked_from:'f2'});
  assert.deepEqual(links,[{conversation_id:'f2',kind:'fork'},{conversation_id:'root',kind:'fork'}]);
});
test('a fork with no parent named in its launch tells its ancestors from the record uuids it copied',t=>{
  t.after(after);
  const s=stage(),store=sessions(s.dir);
  // Three generations of copies: each one keeps the records it was copied from, uuids and all.
  const rows=id=>[{type:'user',sessionId:id,uuid:`u-${id}-1`},{type:'assistant',sessionId:id,uuid:`u-${id}-2`}];
  s.transcript('root',rows('root'));
  s.running(41,'root');transition(s.dir,{host:'claude',conversation_id:'root',status:'waiting',liveness:sessionEvidence('root')});
  store.create({name:'demo',context:'방향',conversation_id:'root',label:'뿌리'});
  store.save({summary:'뿌리 저장',history:'본문',next:'더',conversation_id:'root'});
  // The copy carries root's records under its own session id, then adds its own.
  const copied=(parent,id)=>[...rows(parent).map(r=>({...r,sessionId:id})),...rows(id)];
  s.transcript('child',copied('root','child'));
  const first=ancestry(s.dir,{session_id:'child',source:'fork',transcript_path:path.join(s.records,'child.jsonl')},{directory:s.records});
  assert.deepEqual(first,[{conversation_id:'root',kind:'fork'}]);
  s.running(42,'child');
  const started=store.start({conversation_id:'child',source:'fork',origins:first,title:'자식'});
  assert.equal(started.session,'demo');assert.notEqual(started.stem,seat(store,'root'));
  store.save({summary:'자식 저장',history:'본문',next:'더',conversation_id:'child'});
  s.transcript('grandchild',[...copied('root','grandchild'),...rows('child').map(r=>({...r,sessionId:'grandchild'})),...rows('grandchild')]);
  const second=ancestry(s.dir,{session_id:'grandchild',source:'fork',transcript_path:path.join(s.records,'grandchild.jsonl')},{directory:s.records});
  assert.deepEqual(second.map(l=>l.conversation_id),['child','root']); // nearest first
  s.running(43,'grandchild');
  const deep=store.start({conversation_id:'grandchild',source:'fork',origins:second,title:'손자'});
  assert.equal(store.read('demo').branches.find(b=>b.name===deep.stem).parent,seat(store,'child'));
  // Shared uuids alone cannot tell a parent from a child, so the question is only asked
  // of a start the host calls a fork or of a conversation that holds no place yet.
  assert.deepEqual(copyAncestors(s.records,'root',['child','grandchild']).sort(),['child','grandchild']);
  assert.deepEqual(ancestry(s.dir,{session_id:'root',source:'resume',transcript_path:path.join(s.records,'root.jsonl')},{directory:s.records}),[]);
  assert.equal(store.start({conversation_id:'root',source:'resume'}).stem,seat(store,'root'));
});
test('a subagent of a forked conversation is recorded under that conversation and its branch',t=>{
  t.after(after);
  const s=stage(),store=sessions(s.dir);
  s.running(31,'parent');
  transition(s.dir,{host:'claude',conversation_id:'parent',status:'waiting',liveness:sessionEvidence('parent')});
  store.create({name:'demo',context:'방향',conversation_id:'parent',label:'부모 일'});
  store.save({summary:'부모 저장',history:'본문',next:'더',conversation_id:'parent'});
  s.running(32,'fork');
  begin(store,s,'fork',{forked_from:'parent',title:'포크 일'});
  transition(s.dir,{host:'claude',conversation_id:'fork',status:'working',liveness:sessionEvidence('fork')});
  store.save({summary:'포크 저장',history:'본문',next:'더',conversation_id:'fork'});
  // The host's own subagent events, as the hook receives them.
  claudeEvent(s.dir,{hook_event_name:'SubagentStart',session_id:'fork',agent_id:'agent-1',agent_type:'explore'});
  const forkSeat=seat(store,'fork'),branches=board(s.dir)[0].branches;
  const own=branches.find(b=>b.name===forkSeat);
  assert.equal(own.conversations.length,1);
  assert.equal(own.conversations[0].running_subtasks,1);
  assert.equal(own.conversations[0].subtasks[0].name,'explore');
  assert.equal(own.status,'running');
  // The conversation that launched it keeps its own branch free of it.
  assert.equal(branches.find(b=>b.name===seat(store,'parent')).conversations[0].running_subtasks,0);
  // A subagent's own events never take the conversation's place or its current line.
  claudeEvent(s.dir,{hook_event_name:'UserPromptSubmit',session_id:'fork',agent_id:'agent-1',prompt:'하위 에이전트가 받은 아주 긴 지시'});
  assert.equal(activity(s.dir,'claude','fork').current,undefined);
  claudeEvent(s.dir,{hook_event_name:'SubagentStop',session_id:'fork',agent_id:'agent-1',agent_type:'explore'});
  assert.equal(board(s.dir)[0].branches.find(b=>b.name===forkSeat).conversations[0].running_subtasks,0);
});
test('a start is never blocked by a registry that is missing, empty or in another shape',t=>{
  t.after(after);
  const s=stage(),store=sessions(s.dir);
  store.create({name:'demo',context:'방향',conversation_id:'seed',label:'일'});
  process.env.HEAD_CONTEXT_CLAUDE_SESSIONS=path.join(s.dir,'no-such-directory');
  assert.deepEqual(ancestry(s.dir,{session_id:'x',source:'clear'}),[]);
  assert.match(begin(store,s,'x',{session_name:'demo'}).text,/방향/);
  process.env.HEAD_CONTEXT_CLAUDE_SESSIONS=s.registry;
  fs.writeFileSync(path.join(s.registry,'55.json'),JSON.stringify({unexpected:'shape'}));
  assert.equal(ownerOf('y'),null);
  assert.match(begin(store,s,'y',{session_name:'demo',source:'clear'}).text,/방향/);
  assert.equal(sessions(s.dir).connection('y').session,'demo');
});
