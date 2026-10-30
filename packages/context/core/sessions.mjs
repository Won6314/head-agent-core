import {kindOf,kindKey} from './instruction.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {parseHistory} from './history.mjs';
import {identity,overview,sessionPart,fittedContext,topicList,openBranches,RECENT_COUNT,SUMMARY_LIMIT} from './recovery.mjs';
import {withGraph} from './graph.mjs';
import {clock} from './map-view.mjs';
import {branchPath,branchText,branchHeader,withStatus,withRecap} from './branch-format.mjs';
import {mergeArgs,isOpen,OPEN,CLOSED,ABANDONED} from './lifecycle.mjs';
import {openTodos,addTodo,doneTodo,todoLine,today} from './todo.mjs';
import {validName,optionalRead,noSymlink,locations,recordFile,atomicJSON,atomicText,records,locked,entry,line} from './storage.mjs';
export * from './storage.mjs';

export const CONTEXT_REQUIRED='방향(context)이 필요합니다. 목적 없는 작업 세션은 만들지 않습니다. 사용자와 이 작업 세션의 목적을 정한 뒤 그 내용을 context로 주세요. 작업 세션은 만들어지지 않았습니다.';
export const RECAP_REQUIRED='다음이 없는 저장은 작업 브랜치를 닫습니다. 이 작업 브랜치에서 한 일 전체를 정리해 recap으로 주세요. 이어 갈 일이 남았다면 next를 주세요.';
export const RECAP_REFUSED='다음이 있는 저장에는 recap을 받지 않습니다. 정리는 작업 브랜치를 닫는 저장(다음 없음)에만 씁니다.';
export const NOT_CONNECTED='이 대화는 아직 작업 세션에 연결되지 않았습니다. 먼저 작업 세션을 불러오거나 만드세요.';
const MAIN=['main','메인'];
// What each conversation is doing, for choosing where a message goes: a copy's task,
// the work branch's name (its topic), the last thing a person said to it, and on main
// (which has no topic) main's last save. A copy with a task carries its parent's words
// as its own history, so only its task is shown.
export function doing(c,branch,last){
  const clip=(t,n=80)=>{const a=Array.from(String(t).replace(/\s+/g,' ').trim());return a.length>n?`${a.slice(0,n).join('')}…`:a.join('');};
  const parts=[c.task&&`맡은 일: "${clip(c.task)}"`,branch&&`주제: ${branch}`,c.said&&!(c.task&&c.kind==='copy')&&`최근 지시: "${clip(c.said)}"`,last&&`마지막 저장: ${clip(last)}`].filter(Boolean);
  return parts.join(' · ')||'(아직 지시 없음)';
}
// A save's links are written from the work session folder (work/2026-10/…). A branch's
// saves live two folders down (work/<branch>/history.md), so its relative links get the
// way back up, and a person opening the branch file can follow them.
export function fromBranch(text){
  return String(text).replace(/(\]\()(\s*)([^)\s]+)/g,(m,open,space,target)=>{
    if(/^(?:[a-z][a-z0-9+.-]*:|\/|#|~)/i.test(target))return m;
    return `${open}${space}../../${target.replace(/^\.\//,'')}`;
  });
}
// The last save a stem made itself: on main, not the index line a branch save leaves
// there nor the entry a closing branch merges in.
function lastOwn(g,session,stem){
  const rows=g.own(session,stem);
  for(let i=rows.length-1;i>=0&&i>=rows.length-200;i--){const e=g.detail(rows[i]);if(stem!=='main'||(!e.record&&!e.source))return e;}
  return null;
}
// Host hooks, both optional:
//   hostInfo(conversation_id) — what the host knows about one conversation right now
//     ({host_session_id, pid, title, entrypoint, ...}); kept on the connection so the
//     conversation can be addressed when its process is gone.
//   live(known) — the conversations alive now ([{conversation_id, title, address,
//     last_at}]); `known` is the connection records, for what only they remember.
//   peers — the other apps' conversations of this project ([{host, live}], live as above),
//     listed beside this host's own: one list for Claude Code and Codex alike.
export function sessions(project,{host='claude',hostInfo=()=>({}),live=()=>[],peers=[],now=()=>Date.now()}={}){
  const {topics,state,timezone}=locations(project);
  const directory=name=>{validName(name);if(name.startsWith('_'))throw new Error('보관 폴더는 작업 세션이 아닙니다.');return noSymlink(path.join(topics,name));};
  const connection=id=>id?JSON.parse(optionalRead(recordFile(state,'conversations',id,host))||'null'):null;
  // The work branch a conversation saves to: the one it is attached to while that one
  // exists and is open. A closed or dropped branch sends its conversations back to main.
  const effective=(bound,g)=>{
    const candidate=bound?.branch;if(!candidate)return 'main';
    const header=g.header(bound.session,candidate);
    return header&&isOpen(header.status)?candidate:'main';
  };
  const bind=(name,stem,id,extra={})=>{
    if(!id)throw new Error('conversation_id가 필요합니다 (호스트 연결이 채웁니다).');
    const previous=connection(id)||{};let info={};
    try{info=hostInfo(id)||{};}catch{}
    const clean=Object.fromEntries(Object.entries({...info,...extra}).filter(([,v])=>v!==undefined&&v!==null&&v!==''));
    atomicJSON(recordFile(state,'conversations',id,host),{...previous,...clean,host,conversation_id:id,session:name,branch:stem==='main'?null:stem,bound_at:new Date(now()).toISOString()});
  };
  const resolve=(id,g)=>{const bound=connection(id);if(!bound?.session||!g.names().includes(bound.session))throw new Error(NOT_CONNECTED);return {...bound,stem:effective(bound,g)};};
  const uniqueEntry=(file,args)=>{
    const used=new Set(parseHistory(optionalRead(file)).map(e=>e.timestamp));let time=now();while(used.has(new Date(time).toISOString()))time++;
    return entry({...args,timestamp:new Date(time).toISOString()});
  };
  // A branch that saved nothing has nothing to inherit, so a branch opened off it points
  // at what it was opened from instead.
  const inheritable=(g,session,parent)=>{
    for(let stem=parent,depth=0;stem&&stem!=='main'&&depth<32;depth++){
      const header=g.header(session,stem);if(!header)return 'main';
      if(g.own(session,stem).length)return stem;
      stem=header.parent;
    }
    return 'main';
  };
  const openBranch=(g,session,stem,parent='main')=>{
    if(parent!=='main'&&!g.header(session,parent))throw new Error('부모 작업 브랜치가 없습니다.');
    parent=inheritable(g,session,parent);
    const dir=directory(session),file=branchPath(dir,stem),parentFile=parent==='main'?path.join(dir,'history.md'):branchPath(dir,parent);
    const last=g.recent(session,parent,1).at(-1);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    try{locked(parentFile,()=>fs.writeFileSync(noSymlink(file),branchText({name:stem,label:stem,session,parent,anchor:last?.timestamp||null,anchorId:last?.id||'',started:new Date(now()).toISOString()}),{flag:'wx'}));}
    catch(e){if(e.code==='EEXIST')throw new Error(`작업 브랜치 '${stem}'이 이미 있습니다. 이어 가려면 attach하세요.`);throw e;}
    return stem;
  };
  const setStatus=(session,stem,status)=>{const file=branchPath(directory(session),stem);locked(file,()=>{const text=optionalRead(file),header=branchHeader(text);if(header&&header.status!==status)atomicText(file,withStatus(text,status));});};
  const todos=name=>openTodos(directory(name));
  const work=(g,name,stem,{count=RECENT_COUNT,limit=SUMMARY_LIMIT}={})=>identity(g,{name,stem,count,limit,todos:todos(name),today:today(timezone,now())});
  // Load = choose the work session and the work branch this conversation works on, and
  // return the work context. Without a branch the conversation keeps the branch it had in
  // this session, or works on main. Nothing else is closed or moved.
  const load=({name,branch,history_count=RECENT_COUNT,map_limit=SUMMARY_LIMIT,conversation_id}={})=>{
    if(!Number.isInteger(history_count)||history_count<0)throw new Error('history_count는 0 이상의 정수입니다.');
    const placed=withGraph(project,g=>{
      const previous=connection(conversation_id),selected=name||previous?.session;
      if(!selected)throw new Error('작업 세션 이름이 필요합니다.');g.session(selected);
      let stem;
      if(branch===undefined||branch==='')stem=previous?.session===selected?effective(previous,g):'main';
      else if(MAIN.includes(branch))stem='main';
      else{
        validName(branch);const header=g.header(selected,branch);
        if(!header)throw new Error(`작업 브랜치 '${branch}'이 없습니다. 새로 열려면 branch create입니다.`);
        if(header.status===ABANDONED)throw new Error('중단한 작업 브랜치입니다. 기록은 read로 읽으세요.');
        stem=branch;
      }
      bind(selected,stem,conversation_id);
      return {session:selected,stem};
    });
    // Attaching to a closed branch opens it again; its next closing save merges once more.
    if(placed.stem!=='main')setStatus(placed.session,placed.stem,OPEN);
    return withGraph(project,g=>work(g,placed.session,placed.stem,{count:history_count,limit:map_limit}));
  };
  // Closing: the branch leaves exactly one entry on main and keeps its own file.
  const closeBranch=(session,stem,{status=CLOSED,reason}={})=>{
    const dir=directory(session),file=branchPath(dir,stem),main=path.join(dir,'history.md');
    const info=withGraph(project,g=>{const header=g.header(session,stem);return header?{...header,entries:g.own(session,stem).map(r=>g.detail(r))}:null;});
    if(!info)throw new Error('작업 브랜치가 없습니다.');
    if(!isOpen(info.status))return false;
    const args=status===ABANDONED?{summary:info.entries.at(-1)?.summary||stem,history:info.recap||'중단했습니다.',status,branch:stem,record:`work/${stem}/history.md`,reason}
      :mergeArgs({branch:stem,recap:info.recap,entries:info.entries});
    entry(args); // Validate before touching either file.
    locked(file,()=>{
      const text=optionalRead(file);if(!isOpen(branchHeader(text)?.status))return;
      locked(main,()=>fs.appendFileSync(main,uniqueEntry(main,args)));
      atomicText(file,withStatus(text,status));
    });
    withGraph(project,g=>g.branches(session));return true;
  };
  const save=({summary,history,next,recap,conversation_id})=>{
    if(typeof history!=='string'||!history.trim())throw new Error('history(본문)가 필요합니다.');
    const bound=withGraph(project,g=>resolve(conversation_id,g)),dir=directory(bound.session);
    entry({summary,history,next});
    if(bound.stem==='main'){
      if(recap!==undefined&&String(recap).trim())throw new Error('메인 기록에는 recap을 받지 않습니다. 정리는 작업 브랜치를 닫는 저장에만 씁니다.');
      const main=path.join(dir,'history.md');
      locked(main,()=>fs.appendFileSync(main,uniqueEntry(main,{summary,history,next})));
      withGraph(project,g=>g.recent(bound.session,'main',1));
      return `작업 세션 '${bound.session}' 메인에 기록했습니다.\n요약: ${summary}${next?`\n다음: ${next}`:''}`;
    }
    if(next&&recap!==undefined&&String(recap).trim())throw new Error(RECAP_REFUSED);
    if(!next&&(recap===undefined||!String(recap).trim()))throw new Error(RECAP_REQUIRED);
    const file=branchPath(dir,bound.stem),main=path.join(dir,'history.md'),record=`work/${bound.stem}/history.md`;
    locked(file,()=>{
      const text=optionalRead(file),header=branchHeader(text);
      if(!header)throw new Error('작업 브랜치 파일을 읽지 못했습니다.');
      const updated=next?text:withRecap(text,recap);
      if(updated!==text)atomicText(file,updated);
      fs.appendFileSync(file,uniqueEntry(file,{summary,history:fromBranch(history),next}));
      locked(main,()=>fs.appendFileSync(main,uniqueEntry(main,{summary,index:{label:header.label||bound.stem,record}})));
    });
    withGraph(project,g=>g.recent(bound.session,bound.stem,1));
    if(next)return `작업 세션 '${bound.session}' 작업 브랜치 '${bound.stem}'에 기록했습니다.\n요약: ${summary}\n다음: ${next}`;
    closeBranch(bound.session,bound.stem);bind(bound.session,'main',conversation_id);
    return `작업 세션 '${bound.session}' 작업 브랜치 '${bound.stem}'에 기록하고, 다음이 없어 작업 브랜치를 닫아 메인에 합쳤습니다.\n요약: ${summary}\n이 대화는 이제 메인에 기록합니다.`;
  };
  const abandon=({branch,reason,conversation_id})=>{
    line(reason,'reason');
    const bound=withGraph(project,g=>resolve(conversation_id,g)),name=branch||(bound.stem==='main'?null:bound.stem);
    if(!name||MAIN.includes(name))throw new Error('중단할 작업 브랜치를 주세요. 메인은 중단하지 않습니다.');
    validName(name);
    if(!closeBranch(bound.session,name,{status:ABANDONED,reason}))throw new Error(`작업 브랜치 '${name}'은 이미 닫혀 있습니다.`);
    if(bound.branch===name)bind(bound.session,'main',conversation_id);
    return `작업 브랜치 '${name}'을 중단했습니다. 메인에 중단 항목 1개와 기록: work/${name}/history.md.`;
  };
  // Alive conversations under their work session and work branch. What "alive" means is
  // the host's: a running process, or where processes come and go on their own (the
  // desktop app), recent activity. The core keeps no state about it.
  // A copy run by a program (a fork or worker, kind 'copy') whose parent is alive is shown
  // once, under that parent (children), not again on its own line.
  const tree=({name}={})=>withGraph(project,g=>{
    const all=records(path.join(state,'conversations'));
    const titles=new Map();
    // A conversation its starter marked as a person's (HEAD_CONTEXT_PERSON) is one, whatever
    // runs it (a headless claude -p behind a phone app).
    const rows=[{host,live},...peers].flatMap(source=>{
      const known=new Map(all.filter(c=>c.host===source.host).map(c=>[c.conversation_id,c]));
      let list=[];try{list=source.live(known)||[];}catch{list=[];}
      return list.map(c=>{const bound=known.get(c.conversation_id),inSession=bound?.session&&g.names().includes(bound.session);
        const kind=bound?.person?'person':kindKey(c.entrypoint||bound?.entrypoint);
        return {...c,host:source.host,kind,parent:kind==='copy'?(c.parent||bound?.parent||null):null,session:inSession?bound.session:null,stem:inSession?effective(bound,g):'main',children:[]};});
    });
    const byId=new Map(rows.map(r=>[r.conversation_id,r]));
    // Nest copies under a live parent; a loop or a missing parent leaves the copy where it is.
    const top=[];
    for(const r of rows){
      let p=r.parent&&byId.get(r.parent),guard=0;
      for(let a=p;a&&guard<32;a=a.parent&&byId.get(a.parent),guard++)if(a===r){p=null;break;}
      if(p&&p!==r)p.children.push(r);else top.push(r);
    }
    // People first, then copies whose parent is gone; newest first within each.
    top.sort((a,b)=>(a.kind==='copy')-(b.kind==='copy'));
    if(name)g.session(name);
    const names=name?[name]:[...new Set(rows.filter(r=>r.session).map(r=>r.session))].sort();
    const out={timezone:g.timezone,sessions:names.map(s=>{const mine=top.filter(r=>r.session===s);
      const main=lastOwn(g,s,'main');
      const branches=openBranches(g,s).map(b=>{titles.set(`${s}\0${b.name}`,b.title);const e=lastOwn(g,s,b.name);
        return {name:b.name,title:b.title,next:b.next,last_at:b.last_at,last_summary:e?.summary||null,conversations:mine.filter(r=>r.stem===b.name)};});
      return {name:s,main:{last_summary:main?.summary||null,last_at:main?.timestamp||null},conversations:mine.filter(r=>r.stem==='main'),branches};}),
      loose:name?[]:top.filter(r=>!r.session)};
    const fill=(r,last)=>{r.doing=doing(r,r.stem!=='main'?titles.get(`${r.session}\0${r.stem}`):undefined,r.kind==='copy'?null:last);r.children.forEach(k=>fill(k));};
    for(const s of out.sessions){s.conversations.forEach(r=>fill(r,s.main.last_summary));for(const b of s.branches)b.conversations.forEach(r=>fill(r));}
    out.loose.forEach(r=>fill(r));
    return out;
  });
  // Where to send, as the calling app's send tool takes it: a Claude conversation's inbox
  // (uds:…) for Claude's SendMessage, claude:<id> for Codex's send; a Codex conversation is
  // codex:<id> for both.
  const addressOf=c=>{
    if(c.host==='codex')return `codex:${c.conversation_id}`;
    if(c.host==='claude'&&host==='codex')return `claude:${c.conversation_id}`;
    return c.address||'(모름)';
  };
  const APP={claude:'Claude',codex:'Codex'};
  const conversations=({name,conversation_id}={})=>{
    const data=tree({name}),time=clock(data.timezone);
    // One conversation and, indented under it, the copies it started.
    const show=(c,pad='  ')=>{
      const head=[c.title&&`이름 ${c.title}`,`보낼 곳 ${addressOf(c)}`,APP[c.host]||c.host,c.kind==='person'?'사람':kindOf(c.entrypoint),c.last_at&&`마지막 ${time(new Date(c.last_at).toISOString())}`,host!==c.host&&c.reachable===false&&'지금은 받지 못함(실행 중이 아님)'].filter(Boolean).join(' · ');
      return [`${pad}- ${head}${c.conversation_id===conversation_id?' (이 대화)':''}`,`${pad||'  '}  하는 일: ${c.doing}`,...(c.children||[]).flatMap(k=>show(k,`${pad}    `))];
    };
    const how=host==='codex'?'send(threadId: 보낼 곳, prompt)':'SendMessage(to: 보낼 곳)';
    const lines=['# 살아 있는 대화 (작업 세션 → 작업 브랜치 → 대화)',`보내기: ${how}. 이름은 여러 대화가 같을 수 있어 보낼 곳을 그대로 씁니다. 보낼 곳은 대화가 다시 시작하면 바뀌므로 방금 읽은 이 목록의 것을 씁니다.`];
    for(const s of data.sessions){
      const has=s.conversations.length||s.branches.some(b=>b.conversations.length);
      lines.push('',`## ${s.name}`);
      if(s.conversations.length)lines.push('- 메인',...s.conversations.flatMap(r=>show(r)));
      for(const b of s.branches)if(b.conversations.length)lines.push(`- 작업 브랜치 ${b.title}`,...b.conversations.flatMap(r=>show(r)));
      if(!has)lines.push('(살아 있는 대화 없음)');
    }
    if(data.loose.length)lines.push('','## 작업 세션 없음',...data.loose.flatMap(r=>show(r,'')));
    if(lines.length===2)lines.push('','(살아 있는 대화 없음)');
    return lines.join('\n');
  };
  const todo=({action,text,due,match,name,conversation_id})=>{
    const target=name||withGraph(project,g=>resolve(conversation_id,g)).session,dir=directory(target);
    withGraph(project,g=>g.session(target));
    if(action==='add')return `작업 세션 '${target}' 할 일에 더했습니다.\n${addTodo(dir,{text,due,timeZone:timezone,now:now()})}`;
    if(action==='done'){
      const r=doneTodo(dir,match);
      if(r.changed)return `끝냄: ${r.hits[0].text}`;
      return r.hits.length?[`맞는 열린 할 일이 ${r.hits.length}개라 바꾸지 않았습니다. match를 좁혀 주세요.`,...r.hits.map(todoLine)].join('\n'):'맞는 열린 할 일이 없습니다.';
    }
    if(action==='list'){const open=openTodos(dir);return open.length?[`# 할 일: ${target} (열린 ${open.length}개)`,...open.map(todoLine)].join('\n'):`작업 세션 '${target}'에 열린 할 일이 없습니다.`;}
    throw new Error('action은 add/list/done입니다.');
  };
  const locate=({conversation_id,session_name,origins=[]})=>{
    return withGraph(project,g=>{
      const names=g.names(),cached=connection(conversation_id);let place=null;
      if(cached?.session&&names.includes(cached.session))place={session:cached.session,branch:cached.branch};
      else for(const link of origins){const bound=connection(link.conversation_id);if(bound?.session&&names.includes(bound.session)){place={session:bound.session,branch:bound.branch,from:link};break;}}
      if(!place&&session_name&&names.includes(session_name))place={session:session_name,branch:null};
      return place&&{session:place.session,stem:effective(place,g),from:place.from||null};
    });
  };
  // Facts about a conversation that are not its place (a person's mark), kept on its
  // connection file whether or not it works in a session.
  const note=(id,info)=>{if(!id)return;const previous=connection(id)||{};atomicJSON(recordFile(state,'conversations',id,host),{...previous,...info,host,conversation_id:id});};
  return {
    connection,load,save,todo,conversations,tree,note,
    names:()=>withGraph(project,g=>g.names()),
    list:()=>withGraph(project,g=>[topicList(g),...g.errors.map(e=>`${e.name}: 읽기 실패 — ${e.error}`)].join('\n')),
    // One work session's open branches, for adapters outside the core.
    view:name=>withGraph(project,g=>({name,branches:openBranches(g,name).map(b=>({name:b.name,title:b.title,next:b.next,last_at:b.last_at}))})),
    create({name,context,conversation_id}){
      // 목적 없는 작업 세션은 만들지 않는다: 방향이 없거나 공백뿐이면 폴더를 만들기 전에 거절한다.
      if(context!==undefined&&typeof context!=='string')throw new Error('context는 문자열이어야 합니다.');
      if(context===undefined||!context.trim())throw new Error(CONTEXT_REQUIRED);
      const dir=directory(name);fs.mkdirSync(topics,{recursive:true});
      try{fs.mkdirSync(dir);}catch(e){if(e.code==='EEXIST')return `작업 세션 '${name}'이 이미 있습니다. 덮어쓰지 않았습니다.`;throw e;}
      fs.writeFileSync(path.join(dir,'context.md'),context,{flag:'wx'});return load({name,conversation_id});
    },
    branch({action,branch,parent,conversation_id,reason}){
      if(action==='attach'){if(!branch)throw new Error('branch가 필요합니다.');return load({branch,conversation_id});}
      if(action==='abandon')return abandon({branch,reason,conversation_id});
      if(action!=='create')throw new Error('action은 create/attach/abandon입니다.');
      if(!branch)throw new Error('작업 브랜치 이름(branch)이 필요합니다. 그 일을 나타내는 짧은 이름을 주세요.');
      validName(branch);if(MAIN.includes(branch))throw new Error('main/메인은 메인의 예약 이름입니다.');
      withGraph(project,g=>{
        const bound=resolve(conversation_id,g),from=parent===undefined?bound.stem:MAIN.includes(parent)?'main':parent;
        if(from!=='main'){validName(from);if(!g.header(bound.session,from))throw new Error('부모 작업 브랜치가 없습니다.');}
        openBranch(g,bound.session,branch,from);
      });
      return load({branch,conversation_id});
    },
    inspect({action='map',name,branch,limit=30,count=5,id,file,query,depth=2,conversation_id}){
      return withGraph(project,g=>{
        const previous=connection(conversation_id),selected=name||previous?.session;
        if(action==='entry'){if(!id)throw new Error('id가 필요합니다.');return g.entry(id,selected).body;}
        if(action==='find'){if(!file&&!query)throw new Error('find에는 file 또는 query가 필요합니다.');return g.find({file,query,session:name||(!path.isAbsolute(file||'')?previous?.session:undefined),limit}).map(e=>`${e.id} · ${e.summary}`).join('\n')||'(없음)';}
        if(!selected)throw new Error('작업 세션 이름이 필요합니다.');
        if(action==='map')return g.map(selected,branch,limit);
        if(action==='files')return g.files(selected,{id,branch,depth});
        if(action==='overview'){g.session(selected);return overview(g,{name:selected,todos:openTodos(directory(selected)),today:today(timezone,now())});}
        if(action==='recent'){const stem=branch||(!name&&previous?effective(previous,g):'main');return g.recent(selected,stem,count).map(e=>e.body).join('\n\n')||'(기록 없음)';}
        throw new Error('action은 overview/map/recent/entry/find/files입니다.');
      });
    },
    // Current work context of a connected conversation, without changing the connection.
    identity({conversation_id}){const bound=connection(conversation_id);if(!bound?.session)return '';return withGraph(project,g=>g.names().includes(bound.session)?work(g,bound.session,effective(bound,g)):'');},
    // Start hook, run at every start (startup, resume, /clear, compact). A conversation
    // the core already knows keeps its place. A new one takes the place of the first
    // ancestor that holds one (`origins`, nearest first: the conversation it continues,
    // the one /clear replaced, the one it was copied from) — session and branch whole —
    // or the session named for it, on main. Nothing is opened or closed here.
    // Where a conversation works, without changing anything: a conversation the core
    // already knows keeps its place. A new one takes the place of the first ancestor that
    // holds one (`origins`, nearest first: the conversation it continues, the one /clear
    // replaced, the one it was copied from) — session and branch whole — or the session
    // named for it, on main. Several start hooks may ask at once; the answer is the same.
    locate,
    // Start hook: give the conversation its place (nothing is opened or closed here).
    start({conversation_id,session_name,origins=[],info={}}){
      const place=locate({conversation_id,session_name,origins});if(!place)return null;
      bind(place.session,place.stem,conversation_id,info);return place;
    },
    // The two parts of the work context for a place as the start hook sends them: the
    // work context already cut down to `budget`, and the file that holds context.md.
    parts({session,stem},{budget=Infinity}={}){return withGraph(project,g=>({head:sessionPart(g,{name:session,stem}),context:fittedContext(g,{name:session,stem,todos:todos(session),today:today(timezone,now())},budget),contextFile:path.join(directory(session),'context.md')}));}
  };
}
