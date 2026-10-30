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
// Data only — what the parts mean is in the server instructions. load returns
// both, the start hook sends them as separate outputs.
export function sessionPart(g,{name,stem,conversation=true}){
  const s=g.session(name),b=stem==='main'?null:g.header(name,stem);
  const lines=[`# 작업 세션: ${name}`,s.context.trim()];
  if(conversation)lines.push('',`이 대화의 작업 브랜치: ${b?`${branchTitle({name:stem,...b})}${isOpen(b.status)?'':` (${b.status})`}`:'없음(메인)'}`);
  return lines.join('\n');
}
// Saves shown with their body. bodyChars cuts a body to its first characters and points
// at the whole one (read entry); 0 leaves the body out. The newest next stays.
function saves(g,name,rows,{bodyChars=null}={}){
  const time=clock(g.timezone),ids=g.shortIds(name),lines=[];
  rows.forEach((row,i)=>{
    const e=g.detail(row),last=i===rows.length-1,id=ids.get(row.id),body=contentBody(e)||'(본문 없음)';
    const shown=bodyChars===null||body.length<=bodyChars?body:`${bodyChars?body.slice(0,bodyChars)+' …':''}(전문: read entry ${id})`;
    lines.push('',`### ${id} ${time(row.stamp)} ${mapSummary(e).text}`,...(marker(e)?[marker(e)]:[]),shown,...(last&&e.next?['',`다음: ${e.next}`]:[]));
  });
  return lines;
}
// The newest saves of a whole session, whatever line they are on. A branch save also
// leaves an index line on main; the save itself stands for it.
function sessionSaves(g,name,count){
  const branches=new Set(g.branches(name).map(b=>b.name));
  return g.checkpoints(name).filter(r=>{if(r.stem!=='main'||!branches.size)return true;const m=/^work\/([^/]+)\/history\.md$/.exec(g.detail(r).source||'');return !(m&&branches.has(m[1]));}).slice(-count);
}
export function contextPart(g,{name,stem,count=RECENT_COUNT,limit=SUMMARY_LIMIT,todos=[],today='',bodyChars=null,overview=false}){
  const time=clock(g.timezone),lines=[];
  const open=openBranches(g,name);
  if(open.length){
    lines.push(`## 열린 작업 브랜치 (${open.length})`);
    for(const b of open)lines.push(`- ${b.title}${!overview&&b.name===stem?' (이 대화)':''} · 마지막 ${b.saves?time(b.last_at):'저장 없음'}${b.next?` · 다음: ${b.next}`:''}`);
  }
  if(todos.length){
    const soon=todos.filter(t=>dueSoon(t,today)),rest=todos.filter(t=>!dueSoon(t,today)).slice(0,Math.max(0,TODO_COUNT-soon.length));
    lines.push(...(lines.length?['']:[]),`## 할 일 (열린 ${todos.length}개${soon.length?`, 기한 임박 ${soon.length}개`:''})`,...[...soon,...rest].map(t=>cut(todoLine(t),120)));
    if(todos.length>soon.length+rest.length)lines.push('(전체: todo list)');
  }
  const {lines:map,omitted}=renderMap(g,name,{limit,current:overview?undefined:stem});
  if(map.length){
    lines.push(...(lines.length?['']:[]),'## 흐름 (최신이 위)',...map);
    if(omitted)lines.push(`그 앞 ${omitted}개 — read map`);
  }
  if(overview){
    const rows=count===0?[]:sessionSaves(g,name,count);
    if(rows.length)lines.push('',`## 최근 기록 (작업 세션 전체, ${rows.length}개)`,...saves(g,name,rows,{bodyChars}));
  } else if(stem!=='main'){
    const b=g.header(name,stem),own=g.own(name,stem),recent=count===0?[]:own.slice(-count);
    lines.push(...(lines.length?['']:[]),`## 이 작업 브랜치의 최근 기록: ${branchTitle({name:stem,...b})}`);
    if(b.recap)lines.push('정리:',bodyChars!==null&&b.recap.length>bodyChars?`${b.recap.slice(0,bodyChars)} …`:b.recap);
    if(!recent.length)lines.push('(아직 기록 없음)');
    lines.push(...saves(g,name,recent,{bodyChars}));
  }
  return lines.join('\n');
}
// The work context cut down to fit one hook output, in this order: fewer newest saves
// (3, 2, 1), then each body to its first part with a pointer to the whole, then the map
// to 15 lines. The open work branches, the to-dos and the last next always stay.
export const FIT_STEPS=[{count:3},{count:2},{count:1},{count:1,bodyChars:1500},{count:1,bodyChars:500},{count:1,bodyChars:500,limit:15},{count:1,bodyChars:0,limit:15},{count:1,bodyChars:0,limit:5}];
export function fittedContext(g,options,budget){
  let text='';
  for(const step of FIT_STEPS){text=contextPart(g,{...options,...step});if(text.length<=budget)return text;}
  return text.slice(0,Math.max(0,budget-60))+'\n…(상한에서 잘렸습니다. 전부는 load)';
}
export function identity(g,options){return [sessionPart(g,options),contextPart(g,options)].filter(Boolean).join('\n\n');}
// A work session read without connecting: the same work context, newest saves of the
// whole session, nothing about a conversation.
export function overview(g,options){return [sessionPart(g,{...options,stem:'main',conversation:false}),contextPart(g,{...options,stem:'main',overview:true})].filter(Boolean).join('\n\n');}
// Work session list (list): name, the first sentence of context.md, the newest
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
