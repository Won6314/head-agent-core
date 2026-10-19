import {sessions} from './sessions.mjs';
import {clock} from './map-view.mjs';
import {locations} from './storage.mjs';
// The board: every work session with its open work branches and the conversations alive
// on them. `live` is the host's list of alive conversations (none without it). It shows
// no working/waiting state: the core keeps none.
export function board(project,options={}){
  const api=sessions(project,options),names=api.names(),data=api.tree();
  const byName=new Map(data.sessions.map(s=>[s.name,s]));
  return {timezone:locations(project).timezone,
    sessions:names.map(name=>byName.get(name)||{name,conversations:[],branches:api.view(name).branches.map(b=>({...b,conversations:[]}))}),
    loose:data.loose};
}
export function renderBoard(data,{all=false}={}){
  const time=clock(data.timezone),lines=[];let other=0;
  const when=at=>at?time(typeof at==='number'?new Date(at).toISOString():at):'';
  const row=(c,indent)=>lines.push(`${indent}└ ${c.title||c.conversation_id.slice(0,8)}  ${when(c.last_at)}`);
  for(const s of data.sessions){
    const live=s.conversations.length||s.branches.some(b=>b.conversations.length);
    if(!all&&!live&&!s.branches.length){other++;continue;}
    lines.push(s.name);
    for(const c of s.conversations)row(c,'  ');
    for(const b of s.branches){lines.push(`  ├ ${b.title}${b.next?`  다음: ${b.next}`:''}`);for(const c of b.conversations)row(c,'  │ ');}
  }
  if(data.loose?.length){lines.push('작업 세션 없음');for(const c of data.loose)row(c,'  ');}
  if(other)lines.push(`그 외 작업 세션 ${other}개`);return lines.join('\n');
}
