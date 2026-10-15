import fs from 'node:fs';
import path from 'node:path';
import {locations,recordFile,records,atomicJSON,noSymlink} from '../../core/storage.mjs';
import {parentPid} from '../../core/liveness.mjs';
// A load that does not fit the start hook is handed to this conversation's own MCP
// process, which sends it as a claude/channel message. The hook and the MCP server
// share no ID, so the hook records its process ancestors and the server matches its ppid.
export function ancestors(pid=process.pid,depth=15){const out=[];for(let p=pid;p&&p>1&&out.length<depth;p=parentPid(p))out.push(p);return out;}
const dir=project=>path.join(locations(project).state,'pending-load');
export function requestLoad(project,conversation_id){atomicJSON(recordFile(locations(project).state,'pending-load',conversation_id,'claude'),{conversation_id,ancestors:ancestors(),at:new Date().toISOString()});}
// The conversation this process was in before /clear: same host process, latest activity.
export function previousConversation(project,conversation_id){
  const mine=new Set(ancestors()),state=locations(project).state;
  const bound=new Set(records(path.join(state,'conversations')).filter(c=>c.host==='claude'&&c.session).map(c=>c.conversation_id));
  return records(path.join(state,'activity')).filter(a=>a.host==='claude'&&a.conversation_id!==conversation_id&&bound.has(a.conversation_id)&&mine.has(a.liveness?.pid))
    .sort((a,b)=>String(b.updated_at||b.recovery_seen_at||'').localeCompare(String(a.updated_at||a.recovery_seen_at||'')))[0]?.conversation_id||null;
}
export function loadChannel(project,store,{delay=2000}={}){
  return {start(emit){
    const tick=()=>{
      let files;try{files=fs.readdirSync(noSymlink(dir(project))).filter(f=>f.startsWith('claude-')&&f.endsWith('.json'));}catch{return;}
      for(const f of files){
        const file=path.join(dir(project),f);
        try{
          const job=JSON.parse(fs.readFileSync(file,'utf8'));
          if(Date.now()-Date.parse(job.at)>600000){fs.unlinkSync(file);continue;}
          if(!job.ancestors?.includes(process.ppid))continue;
          fs.unlinkSync(file);
          const text=store.identity({conversation_id:job.conversation_id});
          if(text)emit(`# 세션 로드 (응답 불필요)\n${text}`,{kind:'session_load'});
        }catch(error){console.error(`head-context: ${error.message}`);}
      }
    };
    // The client registers its channel handler only after `initialized`; a message sent
    // at once is dropped, and a claimed pending file would be lost with it.
    const run=()=>{tick();setInterval(tick,500).unref();};
    if(delay)setTimeout(run,delay).unref();else run();
  }};
}
