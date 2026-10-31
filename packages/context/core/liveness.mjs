import fs from 'node:fs';
import os from 'node:os';
import {readLoose} from './storage.mjs';
import {isLinux,processStart} from './platform.mjs';
// Liveness from what the host wrote down, not from the process tree. Two evidence
// shapes, both checked with Node built-ins only (Mac·Windows·Linux alike):
//   {registry, session_id, pid} — the host keeps one small file per running
//     conversation. Alive = that file still names this conversation and the pid answers.
//   {pid, start?} — a plain process (a host without such a registry). Alive = the pid
//     answers; on Linux the recorded start time must still match (auxiliary check only).
// Absent or unreadable evidence is never live.
export function pidAlive(pid){
  if(!Number.isInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}
}
const bootId=()=>{try{return fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();}catch{return null;}}; // no /proc (not Linux): no boot id
// Linux-only refinement: the same pid with a different start time is a different process.
const sameStart=(pid,start)=>!start||!isLinux||processStart(pid)===start;
export function processEvidence(pid=process.pid){
  const boot=bootId(),start=processStart(pid);
  return {type:'process',pid:Number(pid),...(start?{start}:{}),...(boot?{boot_id:boot}:{}),machine:os.hostname()};
}
export function evidenceAlive(record){
  const evidence=record?.liveness||record?.process;
  if(!evidence||!evidence.pid)return false;
  if(evidence.machine&&evidence.machine!==os.hostname())return false;
  const boot=bootId();
  if(evidence.boot_id&&boot&&evidence.boot_id!==boot)return false;
  const pid=Number(evidence.pid);
  if(evidence.registry&&evidence.session_id){
    const registry=readLoose(evidence.registry);
    return Boolean(registry&&registry.sessionId===evidence.session_id)&&pidAlive(pid);
  }
  // A plain process, including the linux-process evidence earlier versions wrote.
  return pidAlive(pid)&&sameStart(pid,evidence.start);
}
