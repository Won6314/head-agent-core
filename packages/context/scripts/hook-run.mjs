// Test helper: run the start hook the way the host does — one process per part — and
// return each part's text (or '') and all of them joined in hooks.json order.
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=path.resolve(path.dirname(new URL(import.meta.url).pathname),'hook.mjs');
export const PARTS=['session','context','recent'];
export function runHook(input,{env={},part,args}={}){
  const r=spawnSync(process.execPath,[script,...(args||(part?[part]:[]))],{input:JSON.stringify(input),env:{...process.env,HEAD_CONTEXT_SESSION:'',CLAUDE_CODE_ENTRYPOINT:'',HEAD_CONTEXT_PARENT:'',...env},encoding:'utf8'});
  assert.equal(r.status,0);assert.equal(r.stderr,'');return r.stdout;
}
export function runStart(input,{env={}}={}){
  const parts={};
  for(const part of PARTS){const out=runHook({hook_event_name:'SessionStart',...input},{env,part});parts[part]=out?JSON.parse(out).hookSpecificOutput.additionalContext:'';}
  return {parts,text:PARTS.map(p=>parts[p]).filter(Boolean).join('\n\n')};
}
