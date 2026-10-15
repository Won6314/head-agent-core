import {sessions} from './sessions.mjs';
export {workStatus} from './work-view.mjs';
export function board(project,options={}){return sessions(project,options).views();}
export function renderBoard(data,{all=false}={}){
  const symbols={waiting:'●',running:'○',stopped:'·'},lines=[];let other=0;
  const detail=(cs,summary)=>{const current=cs.find(c=>c.alive&&c.current)?.current;return current?`지금: ${current}`:`최근: ${summary}`;};
  const children=(cs,indent)=>{for(const c of cs)for(const t of c.subtasks)if(t.active)lines.push(`${indent}↳ ${t.name}`);};
  for(const s of data){
    if(s.error){lines.push(`${s.name}: 읽기 실패 — ${s.error}`);continue;}
    const main=s.main.conversations.filter(c=>c.alive),live=s.branches.some(b=>b.conversations.some(c=>c.alive));
    if(!all&&!main.length&&!live&&!s.branches.length){other++;continue;}
    lines.push(`${s.name}    ${symbols[s.main.status]} ${main.length>1?`메인 대화 ${main.length}개`:detail(main,s.main.summary)}`);
    if(main.length>1)for(const c of main){lines.push(`  ${symbols[c.status]} ${c.host}:${c.conversation_id} · ${detail([c],s.main.summary)}`);children([c],'    ');}
    else children(main,'    ');
    const shown=new Set();
    const show=(b,depth)=>{
      if(shown.has(b.name))return;shown.add(b.name);const indent='  '.repeat(depth),cs=b.conversations.filter(c=>c.alive);
      lines.push(`${indent}${symbols[b.status]} ${b.topic||b.name} [${b.name}] · ${detail(cs,b.summary)}`);children(cs,indent+'  ');
      for(const child of s.branches.filter(x=>x.parent===b.name))show(child,depth+1);
    };
    for(const b of s.branches.filter(b=>b.parent==='main'||!s.branches.some(p=>p.name===b.parent)))show(b,1);
    for(const b of s.branches)show(b,1);
  }
  if(other)lines.push(`그 외 세션 ${other}개`);return lines.join('\n');
}
