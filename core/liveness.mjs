import fs from 'node:fs';
import os from 'node:os';
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
export function readJSON(file){try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'?value:null;}catch{return null;}}
const bootId=()=>{try{return fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();}catch{return null;}};
function startTime(pid){
  if(process.platform!=='linux')return null;
  try{const stat=fs.readFileSync(`/proc/${pid}/stat`,'utf8');return stat.slice(stat.lastIndexOf(')')+2).split(' ')[19]||null;}catch{return null;}
}
// Linux-only refinement: the same pid with a different start time is a different process.
const sameStart=(pid,start)=>!start||process.platform!=='linux'||startTime(pid)===start;
export function processEvidence(pid=process.pid){
  const boot=bootId(),start=startTime(pid);
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
    const registry=readJSON(evidence.registry);
    return Boolean(registry&&registry.sessionId===evidence.session_id)&&pidAlive(pid);
  }
  // A plain process, including the linux-process evidence earlier versions wrote.
  return pidAlive(pid)&&sameStart(pid,evidence.start);
}
