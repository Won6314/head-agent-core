import {mapSummary,contentBody} from './history.mjs';
import {renderMap,clock,shortStem} from './map-view.mjs';
import {isOpen} from './lifecycle.mjs';
import {todoLine,dueSoon} from './todo.mjs';
export const RECENT_COUNT=3;
export const SUMMARY_LIMIT=30;
export const TODO_COUNT=3;
export const HOOK_BUDGET=9000; // characters of one hook output; the host cuts each output at 10,000 (measured on 2.1.303).
const marker=e=>e.branch?`브랜치 ${e.branch} ${e.status}${e.reason?` · 이유: ${e.reason}`:''}${e.record?` · 기록: ${e.record}`:''}`:'';
const cut=(text,n)=>{const a=Array.from(String(text));return a.length>n?a.slice(0,n).join('')+'…':String(text);};
// How a work branch is named to a reader: its own name, or for an automatic 0.6 name
// the short form the map uses plus the label it carried.
export function branchTitle(b){
  const short=shortStem(b.name);
  return short===b.name?b.name:`${short} ${b.label||''}`.trim();
}
// The open work branches of a session, newest activity first, each with its last save.
export function openBranches(g,name){
  return g.branches(name).filter(b=>isOpen(b.status)).map(b=>{
    const last=g.own(name,b.name).at(-1),e=last?g.detail(last):null;
    return {...b,title:branchTitle(b),last_at:e?.timestamp||b.started||'',next:e?.next||'',saves:Boolean(e)};
  }).sort((a,b)=>String(b.last_at).localeCompare(String(a.last_at)));
}
// What a conversation receives about its work session comes in two parts, so that the
// part that must arrive never shares a cap with the part that may be long:
//   sessionPart — the work session's name, context.md whole, and the work branch this
//     conversation is on.
//   contextPart — the open work branches and their next, the open to-dos, the record map
//     (git-shaped), and this conversation's branch: its recap and newest saves.
// Data only — what the parts mean is in the server instructions. session_load returns
// both, the start hook sends them as separate outputs.
export function sessionPart(g,{name,stem}){
  const s=g.session(name),b=stem==='main'?null:g.header(name,stem);
  return [`# 작업 세션: ${name}`,s.context.trim(),'',`이 대화의 작업 브랜치: ${b?`${branchTitle({name:stem,...b})}${isOpen(b.status)?'':` (${b.status})`}`:'없음(메인)'}`].join('\n');
}
export function contextPart(g,{name,stem,count=RECENT_COUNT,limit=SUMMARY_LIMIT,todos=[],today=''}){
  const time=clock(g.timezone),lines=[];
  const open=openBranches(g,name);
  if(open.length){
    lines.push(`## 열린 작업 브랜치 (${open.length})`);
    for(const b of open)lines.push(`- ${b.title}${b.name===stem?' (이 대화)':''} · 마지막 ${b.saves?time(b.last_at):'저장 없음'}${b.next?` · 다음: ${b.next}`:''}`);
  }
  if(todos.length){
    const soon=todos.filter(t=>dueSoon(t,today)),rest=todos.filter(t=>!dueSoon(t,today)).slice(0,Math.max(0,TODO_COUNT-soon.length));
    lines.push(...(lines.length?['']:[]),`## 할 일 (열린 ${todos.length}개${soon.length?`, 기한 임박 ${soon.length}개`:''})`,...[...soon,...rest].map(t=>cut(todoLine(t),120)));
    if(todos.length>soon.length+rest.length)lines.push('(전체: session_todo list)');
  }
  const {lines:map,omitted}=renderMap(g,name,{limit,current:stem});
  if(map.length){
    lines.push(...(lines.length?['']:[]),'## 흐름 (최신이 위)',...map);
    if(omitted)lines.push(`그 앞 ${omitted}개 — session_read map`);
  }
  if(stem!=='main'){
    const b=g.header(name,stem),own=g.own(name,stem),recent=count===0?[]:own.slice(-count),ids=g.shortIds(name);
    lines.push(...(lines.length?['']:[]),`## 이 작업 브랜치의 최근 기록: ${branchTitle({name:stem,...b})}`);
    if(b.recap)lines.push('정리:',b.recap);
    if(!recent.length)lines.push('(아직 기록 없음)');
    recent.forEach((row,i)=>{
      const e=g.detail(row),last=i===recent.length-1;
      lines.push('',`### ${ids.get(row.id)} ${time(row.stamp)} ${mapSummary(e).text}`,...(marker(e)?[marker(e)]:[]),contentBody(e)||'(본문 없음)',...(last&&e.next?['',`다음: ${e.next}`]:[]));
    });
  }
  return lines.join('\n');
}
export function identity(g,options){return [sessionPart(g,options),contextPart(g,options)].filter(Boolean).join('\n\n');}
// Work session list (session_list): name, the first sentence of context.md, the newest
// main summary, and how many work branches are open; most recently recorded first.
export const UNCONNECTED='이 대화는 아직 작업 세션에 연결되지 않았습니다.';
export function topicLine(context){
  const line=context.split('\n').map(l=>l.trim()).find(l=>l&&!l.startsWith('#'))||'';
  return cut(line.replace(/^[-*>]\s*/,'').split(/(?<=[.!?。])\s/)[0],100);
}
export function topicList(g){
  const rows=g.names().map(name=>{
    const last=g.own(name,'main').at(-1),e=last?g.detail(last):null;
    return {name,line:topicLine(g.session(name).context),recent:e?cut(mapSummary(e).text,80):'',open:openBranches(g,name).length,rank:Date.parse(e?.timestamp)||0};
  }).sort((a,b)=>b.rank-a.rank||a.name.localeCompare(b.name));
  if(!rows.length)return '아직 작업 세션이 없습니다.';
  return ['# 작업 세션 목록 (최근 기록 순)',...rows.map(r=>`- ${r.name} — ${r.line||'(첫 문장 없음)'}${r.recent?` (최근: ${r.recent})`:''}${r.open?` (열린 작업 브랜치 ${r.open}개)`:''}`)].join('\n');
}
