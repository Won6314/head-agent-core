import {mapSummary,contentBody} from './history.mjs';
export const RECENT_COUNT=5;
export const SUMMARY_LIMIT=30;
export const HOOK_BUDGET=9000; // JSON string length; leaves room within host's 10,000-char limit.
export function openBranchLines(branches,g,name){
  return branches.filter(b=>b.status==='열림').map(b=>{
    const own=g.own(name,b.name).at(-1);
    return {rank:Date.parse(own?.stamp||b.started)||0,text:`${b.name} · 주제: ${b.topic} · 마지막 체크포인트: ${own?.stamp||'없음'}`};
  }).sort((a,b)=>b.rank-a.rank||a.text.localeCompare(b.text)).map(row=>row.text);
}
// A finished/abandoned branch is a higher-level event than an ordinary checkpoint.
const mergeOf=(g,row)=>g.db.prepare("SELECT src FROM edges WHERE dst=? AND kind='merge'").get(row.id)?.src.split('/').at(-1);
const marker=e=>e.branch?`브랜치 ${e.branch} ${e.status}${e.reason?` · 이유: ${e.reason}`:''}${e.record?` · 기록: ${e.record}`:''}`:'';
// Session identity: direction, open branches, older checkpoints as summary lines only,
// the last `count` checkpoints as time + body, and the newest one's cursor.
export function identity(g,{name,stem,count=RECENT_COUNT,limit=SUMMARY_LIMIT}){
  const s=g.session(name),b=stem==='main'?null:g.header(name,stem),rows=g.lineage(name,stem);
  const recent=count===0?[]:rows.slice(-count),older=rows.slice(0,rows.length-recent.length),shown=limit===0?older:older.slice(-limit);
  const open=openBranchLines(g.branches(name),g,name);
  const lines=[`세션: ${name}`,`자리: ${stem==='main'?'메인':`브랜치 ${stem} · 주제: ${b.topic}`}`,'# context.md',s.context.trim()];
  if(open.length)lines.push('# 열린 브랜치',...open);
  if(older.length){
    lines.push('# 지난 기록 (요약)');
    if(shown.length<older.length)lines.push(`그 앞 ${older.length-shown.length}개 — session_read map으로 봅니다.`);
    for(const row of shown){const e=g.detail(row),merged=mergeOf(g,row);lines.push(`${merged?'M':'*'} ${mapSummary(e).text}${merged?` ← 합쳐짐 ${merged}`:''}`);}
  }
  if(recent.length){
    lines.push('# 최근 기록');
    recent.forEach((row,i)=>{
      const e=g.detail(row),last=i===recent.length-1;
      lines.push('',`## ${e.timestamp}`,...(marker(e)?[marker(e)]:[]),contentBody(e)||'(본문 없음)',...(last&&e.next?['',`다음: ${e.next}`]:[]));
    });
  } else lines.push('# 최근 기록','(체크포인트 없음)');
  return lines.join('\n');
}
export function leaveGuide(branch,target){
  return `# 브랜치를 떠나기 전 물음\n현재 브랜치 '${branch}'에서 ${target}로 이동하려 합니다. 연결은 아직 바꾸지 않았습니다.\n호스트 질문 도구로 “끝낼까요, 열어둘까요”를 한 번 물으세요.\n끝낸다면 정리 항목을 대화에 보여주고 session_finish한 뒤 이동하세요. 열어두기로 답했다면 같은 이동 호출에 keep_open=true를 넣으세요. 새 브랜치 만들기는 부모를 유지한 갈라짐이므로 이 물음 없이 진행합니다.`;
}
