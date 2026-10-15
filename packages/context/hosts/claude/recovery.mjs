import fs from 'node:fs';
import {activity} from '../../core/state.mjs';
// Native SDK copies identify inherited records with forkedFrom. Inspect the
// first user/assistant record, not the conversation text or Herdr tab label.
// Returns the parent conversation ID when known, true for a fork of unknown parent, else false.
export function inheritedFork(project,input){
  const previous=activity(project,'claude',input.session_id);
  if(previous?.recovery_seen_at||previous?.updated_at)return false;
  const direct=input.forked_from||input.forkedFrom;if(direct)return typeof direct==='string'?direct:direct.sessionId||true;
  if(!input.transcript_path)return false;
  try{
    const fd=fs.openSync(input.transcript_path,'r'),data=Buffer.alloc(256*1024);
    let length;try{length=fs.readSync(fd,data,0,data.length,0);}finally{fs.closeSync(fd);}
    for(const line of data.subarray(0,length).toString().split('\n')){
      let row;try{row=JSON.parse(line);}catch{continue;}
      if(row.type==='user'||row.type==='assistant')return row.forkedFrom?row.forkedFrom.sessionId||true:false;
    }
  }catch{}
  return false;
}
