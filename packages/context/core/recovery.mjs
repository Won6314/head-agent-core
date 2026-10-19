import {mapSummary,contentBody} from './history.mjs';
import {renderMap,clock} from './map-view.mjs';
export const RECENT_COUNT=5;
export const SUMMARY_LIMIT=30;
export const HOOK_BUDGET=9000; // JSON string length; leaves room within host's 10,000-char limit.
const marker=e=>e.branch?`브랜치 ${e.branch} ${e.status}${e.reason?` · 이유: ${e.reason}`:''}${e.record?` · 기록: ${e.record}`:''}`:'';
// Pending work on other branches of this session: what a new conversation can take over.
// The core does not move the conversation; it hands the model the words to ask with.
export function pendingLines(pending){
  if(!pending?.length)return [];
  return ['# 남은 일 (다른 자리에서 멈춘 일)',
    ...pending.map(p=>`- '${p.label}' · 다음: ${p.next||'(없음)'} · 이어받기: session_branch(action="attach", branch="${p.branch}")`),
    '사용자에게 한 번만 물으세요: "○○의 \'이름표\' 이어서 할까요?" 예라면 그 이어받기를 호출하고, 아니면 지금 자리에서 계속하세요.'];
}
// Session identity: direction, the session's record map (git-shaped, newest on top,
// every line of the session including this place's recent saves), this branch's recap,
// its last `count` records as short ID + time + body with the newest cursor, and the
// pending work other places left behind.
export function identity(g,{name,stem,count=RECENT_COUNT,limit=SUMMARY_LIMIT,recap='',pending=[]}){
  const s=g.session(name),b=stem==='main'?null:g.header(name,stem);
  const own=g.own(name,stem),recent=count===0?[]:own.slice(-count);
  const {lines:map,omitted,name:short}=renderMap(g,name,{limit,current:stem});
  const lines=[`세션: ${name}`,`자리: ${stem==='main'?'메인(색인)':`브랜치 ${stem} (지도: ${short(stem)}) · 이름표: ${b.label}`}`,'# context.md',s.context.trim()];
  if(map.length){
    lines.push('# 기록 지도 (최신이 위)',...map);
    if(omitted)lines.push(`그 앞 ${omitted}개 — session_read map으로 봅니다.`);
  }
  if(recap)lines.push('# 지금까지 요약 (이 자리)',recap);
  if(recent.length){
    const ids=g.shortIds(name),time=clock(g.timezone);
    lines.push('# 최근 기록');
    recent.forEach((row,i)=>{
      const e=g.detail(row),last=i===recent.length-1;
      lines.push('',`## ${ids.get(row.id)} ${time(row.stamp)}`,...(marker(e)?[marker(e)]:[]),contentBody(e)||'(본문 없음)',...(last&&e.next?['',`다음: ${e.next}`]:[]));
    });
  } else lines.push('# 최근 기록','(체크포인트 없음)');
  lines.push(...pendingLines(pending));
  return lines.join('\n');
}
// Topic list (session_list): name, the first sentence of context.md (the topic itself),
// and the newest checkpoint summary, most recently recorded first.
export const UNCONNECTED='이 대화는 아직 작업 주제에 연결되지 않았습니다.';
const cut=(text,n)=>{const a=Array.from(text);return a.length>n?a.slice(0,n).join('')+'…':text;};
export function topicLine(context){
  const line=context.split('\n').map(l=>l.trim()).find(l=>l&&!l.startsWith('#'))||'';
  return cut(line.replace(/^[-*>]\s*/,'').split(/(?<=[.!?。])\s/)[0],100);
}
export function topicList(g,pendingCount=()=>0){
  const rows=g.names().map(name=>{
    const last=g.own(name,'main').at(-1),e=last?g.detail(last):null;
    return {name,line:topicLine(g.session(name).context),recent:e?cut(mapSummary(e).text,80):'',pending:pendingCount(name),rank:Date.parse(e?.timestamp)||0};
  }).sort((a,b)=>b.rank-a.rank||a.name.localeCompare(b.name));
  if(!rows.length)return '아직 작업 주제가 없습니다.';
  return ['# 작업 주제 목록 (최근 기록 순)',...rows.map(r=>`- ${r.name} — ${r.line||'(첫 문장 없음)'}${r.recent?` (최근: ${r.recent})`:''}${r.pending?` (남은 일 ${r.pending}개)`:''}`)].join('\n');
}
