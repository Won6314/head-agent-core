import fs from 'node:fs';
import path from 'node:path';
import {locations,recordFile,atomicJSON,noSymlink} from '../../core/storage.mjs';
import {currentConversation} from './process.mjs';
// A load that does not fit the start hook is left here for this conversation's own MCP
// process to send as a claude/channel message. The hook and the server share no ID, so
// the hook writes the conversation and the server asks the host which conversation it
// belongs to (its parent process's entry in ~/.claude/sessions). Hosts without channels
// — the desktop app — never pick it up; there the hook tells the model to call session_load.
const dir=project=>path.join(locations(project).state,'pending-load');
export function requestLoad(project,conversation_id){atomicJSON(recordFile(locations(project).state,'pending-load',conversation_id,'claude'),{conversation_id,at:new Date().toISOString()});}
export function loadChannel(project,store,{delay=2000,conversationOf=currentConversation}={}){
  return {start(emit){
    const tick=()=>{
      let files;try{files=fs.readdirSync(noSymlink(dir(project))).filter(f=>f.startsWith('claude-')&&f.endsWith('.json'));}catch{return;}
      const mine=conversationOf();
      for(const f of files){
        const file=path.join(dir(project),f);
        try{
          const job=JSON.parse(fs.readFileSync(file,'utf8'));
          if(Date.now()-Date.parse(job.at)>600000){fs.unlinkSync(file);continue;}
          if(!mine||job.conversation_id!==mine)continue;
          fs.unlinkSync(file);
          const text=store.identity({conversation_id:job.conversation_id});
          if(text)emit(`# 작업 맥락 (응답 불필요)\n${text}`,{kind:'session_load'});
        }catch(error){console.error(`head-context: ${error.message}`);}
      }
    };
    // The client registers its channel handler only after `initialized`; a message sent
    // at once is dropped, and a claimed pending file would be lost with it.
    const run=()=>{tick();setInterval(tick,500).unref();};
    if(delay)setTimeout(run,delay).unref();else run();
  }};
}
