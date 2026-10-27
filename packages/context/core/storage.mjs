import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function validName(value) {
  if(typeof value!=='string'||!/^[A-Za-z0-9가-힣._-]+$/.test(value)||value.includes('..')||value==='.')throw new Error('이름은 영문·숫자·한글·._-만 허용하며 ..와 경로 구분자는 금지합니다.');return value;
}
export function optionalRead(file){try{return fs.readFileSync(file,'utf8');}catch(e){if(e.code==='ENOENT')return '';throw e;}}
// Resolve only the trusted project boundary, never .head or a record path: resolving
// those would hide the very links noSymlink must reject. Host cwd stays unchanged.
export function projectRoot(project){if(!project||!path.isAbsolute(project))throw new Error('절대 프로젝트 경로가 필요합니다.');return fs.realpathSync(project);}
export function noSymlink(file){for(let p=path.resolve(file);;p=path.dirname(p)){if(fs.lstatSync(p,{throwIfNoEntry:false})?.isSymbolicLink())throw new Error(`심볼릭 링크는 허용하지 않습니다: ${p}`);if(path.dirname(p)===p)break;}return file;}
export function atomicText(file,text){noSymlink(file);fs.mkdirSync(path.dirname(file),{recursive:true});const temp=`${file}.${randomUUID()}.tmp`;try{fs.writeFileSync(temp,text,{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
export const atomicJSON=(file,value)=>atomicText(file,JSON.stringify(value,null,2)+'\n');
export function locations(project){
  const actual=projectRoot(project),root=noSymlink(path.join(actual,'.head'));
  const config=JSON.parse(optionalRead(noSymlink(path.join(root,'config.json')))||'{}');
  if(config.sessions_dir!==undefined&&(typeof config.sessions_dir!=='string'||!config.sessions_dir))throw new Error('sessions_dir는 비어 있지 않은 경로여야 합니다.');
  if(config.standby_days!==undefined&&(typeof config.standby_days!=='number'||!(config.standby_days>=0)))throw new Error('standby_days는 0 이상의 숫자여야 합니다.');
  if(config.timezone!==undefined){try{if(typeof config.timezone!=='string')throw 0;new Intl.DateTimeFormat('en',{timeZone:config.timezone});}catch{throw new Error('timezone은 IANA 시간대 이름이어야 합니다 (예: Asia/Seoul).');}}
  // An absolute sessions_dir may spell the host's original project path, or a
  // sibling under the same shortcut. Resolve only their shared project ancestor;
  // never the record folder or a path component below that trusted boundary.
  let topics=path.resolve(actual,config.sessions_dir||'.head/sessions');
  if(config.sessions_dir&&path.isAbsolute(config.sessions_dir)){
    let ancestor=path.resolve(project),relative=path.relative(ancestor,topics);
    while(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)){
      const parent=path.dirname(ancestor);if(parent===ancestor)break;
      ancestor=parent;relative=path.relative(ancestor,topics);
    }
    topics=path.resolve(projectRoot(ancestor),relative);
  }
  return {root,topics:noSymlink(topics),state:path.join(root,'state'),standbyDays:config.standby_days,timezone:config.timezone};
}
export function recordFile(state,kind,id,host){if(typeof host!=='string'||!/^[a-z][a-z0-9]*$/.test(host))throw new Error('호스트 이름이 유효하지 않습니다.');if(typeof id!=='string'||!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('대화 ID가 유효하지 않습니다.');return noSymlink(path.join(state,kind,`${host}-${id}.json`));}
// The folder is checked whole once; each file in it only for itself.
const ownFile=file=>{if(fs.lstatSync(file,{throwIfNoEntry:false})?.isSymbolicLink())throw new Error(`심볼릭 링크는 허용하지 않습니다: ${file}`);return file;};
export function records(dir){noSymlink(dir);if(!fs.existsSync(dir))return [];return fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>{const v=JSON.parse(fs.readFileSync(ownFile(path.join(dir,f)),'utf8'));return {...v,host:v.host||f.match(/^([a-z][a-z0-9]*)-/)?.[1],liveness:v.liveness||v.process||null};});}
export const readError=e=>String(e.message).replace(/[\r\n]+/g,' ');
export function line(value,label){if(typeof value!=='string'||!value.trim()||/[\r\n]/.test(value))throw new Error(`${label}는 비어 있지 않은 한 줄이어야 합니다.`);return value.trim();}
// The lock is a directory holding its owner's pid. A lock whose owner has died
// (a killed hook, a restarted server mid-read) is moved aside and removed, so it
// can never hold every later writer and reader off for good.
const alivePid=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
function lockOwner(lock){try{return Number(fs.readFileSync(path.join(lock,'owner'),'utf8'))||null;}catch{return null;}}
function clearStale(lock){
  let age;try{age=Date.now()-fs.statSync(lock).mtimeMs;}catch{return true;}
  const owner=lockOwner(lock);
  // Without an owner file the holder may be between mkdir and writing it.
  if(owner?alivePid(owner):age<30000)return false;
  const aside=`${lock}.stale-${process.pid}-${Date.now()}`;
  try{fs.renameSync(lock,aside);}catch{return true;}
  // Another process may have replaced the dead lock in between; give it back.
  if(lockOwner(aside)!==owner){try{fs.renameSync(aside,lock);}catch{}return false;}
  fs.rmSync(aside,{recursive:true,force:true});return true;
}
export function locked(file,fn){noSymlink(file);const lock=file+'.lock',until=Date.now()+10000;while(true){try{fs.mkdirSync(lock);try{fs.writeFileSync(path.join(lock,'owner'),String(process.pid));}catch{}break;}catch(e){if(e.code!=='EEXIST')throw e;if(clearStale(lock))continue;if(Date.now()>until)throw new Error(`잠금을 얻지 못했습니다: ${file}`);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);}}try{return fn();}finally{fs.rmSync(lock,{recursive:true,force:true});}}
// A checkpoint is time, summary, body and an optional next line. Only branch
// close/abandon entries carry the tool-written marker lines (status/branch/record/reason)
// that the graph turns into merge edges and the map shows as one higher-level event, and
// only a main-line index entry carries the tool-written 이름표/본문 line.
export function entry({summary,history='',next,status,branch,record,reason,index,timestamp=new Date().toISOString()}){
  summary=line(summary,'summary');
  if(next!==undefined&&next!==null&&next!==''&&(typeof next!=='string'||/[\r\n]/.test(next)))throw new Error('next는 한 줄이어야 합니다.');
  next=typeof next==='string'?next.trim():'';
  if(typeof history!=='string'||/^##[ \t]+\d{4}-\d{2}-\d{2}|^(요약:|상태:|다음:|브랜치:|기록:|이유:|이름표:)/m.test(history))throw new Error('본문에 기록 제목 또는 예약 줄을 넣을 수 없습니다.');
  // The main line keeps one index line per save: the label and the file holding the body.
  const marker=`${status?`상태: ${status}\n${branch?`브랜치: ${validName(branch)}\n`:''}${record?`기록: ${record}\n`:''}${reason?`이유: ${line(reason,'reason')}\n`:''}`:''}${index?`이름표: ${line(index.label,'label')} · 본문: ${index.record}\n`:''}`;
  return `\n\n## ${timestamp}\n\n요약: ${summary}\n${marker}\n${history.trim()}\n${next?`\n다음: ${next}\n`:''}\n`;
}
