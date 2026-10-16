import {sessions} from './sessions.mjs';
export {workStatus} from './work-view.mjs';
export function board(project,options={}){return sessions(project,options).views();}
// Each session is a title line; each live conversation under it is `└ ● state  work summary`,
// the summary being its stem's last save ('새 세션' before any).
export function renderBoard(data,{all=false}={}){
  const symbols={waiting:'●',running:'○',stopped:'·'},words={waiting:'대기',running:'작업 중',stopped:'멈춤'},lines=[];let other=0;
  const summaryOf=s=>typeof s==='string'&&s.trim()&&s!=='(체크포인트 없음)'&&s!=='(이름표 없음)'?s:'새 세션';
  const row=(c,summary)=>{lines.push(`  └ ${symbols[c.status]||'·'} ${words[c.status]||c.status}  ${summaryOf(summary)}`);
    for(const t of c.subtasks||[])if(t.active)lines.push(`      ↳ ${t.name}`);};
  for(const s of data){
    if(s.error){lines.push(`${s.name}: 읽기 실패 — ${s.error}`);continue;}
    const main=s.main.conversations.filter(c=>c.alive),live=s.branches.some(b=>b.conversations.some(c=>c.alive));
    if(!all&&!main.length&&!live&&!s.branches.length){other++;continue;}
    lines.push(s.name);
    for(const c of main)row(c,s.main.summary);
    for(const b of s.branches){const cs=b.conversations.filter(c=>c.alive);
      if(cs.length)for(const c of cs)row(c,b.summary);else lines.push(`  └ · ${b.lifecycle||''}  ${summaryOf(b.summary)}`);}
  }
  if(other)lines.push(`그 외 세션 ${other}개`);return lines.join('\n');
}
