import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseHistory} from './history.mjs';
import {evidenceAlive} from './liveness.mjs';
import {conversationView,groupStatus} from './work-view.mjs';
import {activity,markSeen} from './state.mjs';
import {identity,pendingLines,topicList,RECENT_COUNT,SUMMARY_LIMIT} from './recovery.mjs';
import {withGraph} from './graph.mjs';
import {branchPath,branchText,branchHeader,withStatus,withLabel,withRecap,BRANCH_MARKER,firstLine} from './branch-format.mjs';
import {lifecycleOf,mergeArgs,LIVE,TODO,STANDBY,ABANDONED,OPEN,STANDBY_DAYS} from './lifecycle.mjs';
import {validName,optionalRead,noSymlink,locations,recordFile,atomicJSON,atomicText,records,readError,locked,entry,line} from './storage.mjs';
export * from './storage.mjs';

export const CONTEXT_REQUIRED='방향(context)이 필요합니다. 목적 없는 세션은 만들지 않습니다. 사용자와 이 세션의 목적을 정한 뒤 그 내용을 context로 주세요. 세션은 만들어지지 않았습니다.';
export const RECAP_REQUIRED='다음이 없는 저장에는 recap(지금까지 요약)이 필요합니다. 이 브랜치에서 한 일 전체를 정리해 recap으로 주세요. 이어갈 일이 남았다면 next를 주세요.';
export const RECAP_REFUSED='다음이 있는 저장에는 recap을 받지 않습니다. 지금까지 요약은 다음이 없는 저장에만 씁니다.';
const NO_LABEL='새 세션';
export function sessions(project,{host='claude',isAlive=evidenceAlive,now=()=>Date.now()}={}){
  const {topics,state,standbyDays=STANDBY_DAYS}=locations(project);
  const directory=name=>{validName(name);if(name.startsWith('_'))throw new Error('보관 폴더는 세션이 아닙니다.');return noSymlink(path.join(topics,name));};
  const connection=id=>id?JSON.parse(optionalRead(recordFile(state,'conversations',id,host))||'null'):null;
  // The branch a conversation sits on, as long as that branch still exists. A closed
  // branch stays the conversation's place: resuming or saving opens it again.
  const effective=(bound,g)=>{
    const candidate=bound?.branch;
    if(!candidate)return 'main';
    return g.branches(bound.session).some(b=>b.name===candidate)?candidate:'main';
  };
  const bind=(name,stem,id)=>{if(!id)throw new Error('conversation_id가 필요합니다 (호스트 연결이 채웁니다).');atomicJSON(recordFile(state,'conversations',id,host),{host,conversation_id:id,session:name,branch:stem==='main'?null:stem,bound_at:new Date().toISOString()});};
  const resolve=(id,g)=>{const bound=connection(id);if(!bound?.session)throw new Error('먼저 세션을 불러오거나 만드세요.');g.session(bound.session);return {...bound,stem:effective(bound,g)};};
  // The state folders are read once per board, not once per session.
  const stateRecords=()=>({cs:records(path.join(state,'conversations')),as:records(path.join(state,'activity')),children:records(path.join(state,'subtasks'))});
  const aliveBound=(c,all)=>{const a=all.as.find(a=>a.host===c.host&&a.conversation_id===c.conversation_id);const raw={...c,...a};return raw.status!=='ended'&&isAlive(raw);};
  const branchState=(g,name,all,stem)=>{
    const header=g.header(name,stem);if(!header)return null;
    const entries=g.own(name,stem).map(row=>g.detail(row));
    const attached=all.cs.filter(c=>c.session===name&&c.branch===stem);
    const alive=attached.some(c=>aliveBound(c,all));
    return {name:stem,...header,entries,attached,alive,lifecycle:lifecycleOf({status:header.status,entries,alive,now:now(),standbyDays})};
  };
  const branchStates=(g,name,all)=>g.branches(name).map(b=>branchState(g,name,all,b.name)).filter(Boolean);
  const uniqueEntry=(file,args)=>{
    const used=new Set(parseHistory(optionalRead(file)).map(e=>e.timestamp));let time=now();while(used.has(new Date(time).toISOString()))time++;
    return entry({...args,timestamp:new Date(time).toISOString()});
  };
  // ---- branch lifetime -------------------------------------------------------
  // One live conversation per branch, one branch per live conversation. The core
  // opens it, names it and closes it; the user is only ever asked about the topic.
  const autoName=()=>`branch-${new Date(now()).toISOString().replace(/[-:]/g,'').slice(0,15)}-${randomUUID().slice(0,8)}`;
  const labelFor=(id,given)=>{const a=activity(project,host,id);return firstLine(given||a?.title||a?.current)||NO_LABEL;};
  // A branch that saved nothing has nothing to inherit, so a new branch forking off it
  // points at what it was forked from instead. That also leaves the empty one free to go.
  const inheritable=(g,session,parent)=>{
    for(let stem=parent,depth=0;stem&&stem!=='main'&&depth<32;depth++){
      const header=g.header(session,stem);if(!header)return 'main';
      if(g.own(session,stem).length)return stem;
      stem=header.parent;
    }
    return 'main';
  };
  const openBranch=(g,session,stem,{label,parent='main',conversation_id})=>{
    if(parent!=='main'&&!g.header(session,parent))throw new Error('부모 브랜치가 없습니다.');
    parent=inheritable(g,session,parent);
    const dir=directory(session),file=branchPath(dir,stem),parentFile=parent==='main'?path.join(dir,'history.md'):branchPath(dir,parent);
    const last=g.recent(session,parent,1).at(-1);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    locked(parentFile,()=>fs.writeFileSync(noSymlink(file),branchText({name:stem,label:labelFor(conversation_id,label),session,parent,anchor:last?.timestamp||null,anchorId:last?.id||'',started:new Date(now()).toISOString()}),{flag:'wx'}));
    return stem;
  };
  // Closing: an empty branch is dropped, a used one leaves exactly one entry on the
  // main line and keeps its own file. Reattaching opens it and the next close adds one more.
  const closeBranch=(session,stem)=>{
    const dir=directory(session),file=branchPath(dir,stem),main=path.join(dir,'history.md');
    const info=withGraph(project,g=>{const header=g.header(session,stem);return header?{...header,entries:g.own(session,stem).map(r=>g.detail(r))}:null;});
    if(!info||info.status!==OPEN)return false;
    if(!info.entries.length){
      // Nothing was saved here, so there is nothing to merge. Drop it unless another
      // branch was forked off it before it emptied out (legacy files only).
      if(withGraph(project,g=>g.branches(session).some(b=>b.parent===stem)))return false;
      locked(file,()=>{if(branchHeader(optionalRead(file))?.status===OPEN)fs.rmSync(path.dirname(file),{recursive:true,force:true});});
      withGraph(project,g=>g.branches(session));return true;
    }
    const args=mergeArgs({branch:stem,label:info.label,recap:info.recap,entries:info.entries});
    entry(args); // Validate before touching either file.
    locked(file,()=>{
      const text=optionalRead(file);if(branchHeader(text)?.status!==OPEN)return;
      locked(main,()=>fs.appendFileSync(main,uniqueEntry(main,args)));
      atomicText(file,withStatus(text,args.status));
    });
    withGraph(project,g=>g.branches(session));return true;
  };
  // Late cleanup: whatever ended without its end hook is closed the next time anyone
  // reads the sessions (load, list, board), so the main line is never left waiting.
  // Death has to be known, not merely unproven: the host either said the conversation
  // ended, or it left evidence that no longer holds. A conversation the host never
  // reported on, or reported without evidence, keeps its branch — that is what stops the
  // end of one conversation from closing a place it has just handed over to another.
  // `except` protects the place of the conversation being served.
  const ended=(c,all)=>{
    const a=all.as.find(a=>a.host===c.host&&a.conversation_id===c.conversation_id);
    if(!a)return false;
    if(a.status==='ended')return true;
    return Boolean(a.liveness||a.process)&&!isAlive({...c,...a});
  };
  const sweep=({except=[]}={})=>{
    const spared=except.filter(Boolean);
    const jobs=withGraph(project,g=>{
      const all=stateRecords(),out=[];
      for(const name of g.names())for(const b of branchStates(g,name,all)){
        if(b.status!==OPEN||b.alive)continue;
        if(spared.some(x=>x.session===name&&x.branch===b.name))continue;
        if(b.attached.every(c=>ended(c,all)))out.push({session:name,branch:b.name});
      }
      return out;
    });
    let closed=0;for(const job of jobs)if(closeBranch(job.session,job.branch))closed++;
    return closed;
  };
  const sessionView=(g,name,all=stateRecords())=>{
    g.session(name);
    const cs=all.cs.filter(c=>c.session===name),as=all.as,children=all.children;
    const conversations=cs.map(c=>({...conversationView(c,as,children,isAlive),stem:effective(c,g)}));
    const mainConversations=conversations.filter(c=>c.stem==='main'),last=g.recent(name,'main',1).at(-1);
    return {name,main:{status:groupStatus(mainConversations),summary:last?.summary||'(체크포인트 없음)',timestamp:last?.timestamp||null,conversations:mainConversations},
      // A branch is on the board while it is being worked on or still has pending work.
      branches:branchStates(g,name,all).filter(b=>[LIVE,TODO].includes(b.lifecycle)).map(b=>{
        const latest=b.entries.at(-1),cs=conversations.filter(c=>c.stem===b.name);
        return {name:b.name,label:b.label,topic:b.label,parent:b.parent,lifecycle:b.lifecycle,next:latest?.next||'',status:groupStatus(cs),
          summary:latest?.summary||'(체크포인트 없음)',timestamp:latest?.timestamp||null,conversations:cs};
      })};
  };
  const read=name=>withGraph(project,g=>({name,context:g.session(name).context,entries:g.recent(name,'main',0),branches:g.branches(name)
    .map(b=>({...b,name:b.name})),errors:g.errors}));
  const place=(g,name,stem,{count=RECENT_COUNT,limit=SUMMARY_LIMIT}={})=>{
    const all=stateRecords(),states=branchStates(g,name,all);
    const pending=states.filter(b=>b.name!==stem&&b.lifecycle===TODO).map(b=>({branch:b.name,label:b.label,next:b.entries.at(-1)?.next||''}));
    return identity(g,{name,stem,count,limit,recap:stem==='main'?'':g.header(name,stem)?.recap||'',pending});
  };
  // Load = choose the session, put this conversation on its own branch and return the
  // identity of that place. The start hook returns the same thing.
  const load=({name,branch,history_count=RECENT_COUNT,map_limit=SUMMARY_LIMIT,conversation_id,label}={})=>{
    if(!Number.isInteger(history_count)||history_count<0)throw new Error('history_count는 0 이상의 정수입니다.');
    const before=connection(conversation_id),target=branch&&branch!=='main'&&branch!=='메인'?branch:null;
    // The place being served and the place being asked for are never swept away.
    sweep({except:[before?.branch&&{session:before.session,branch:before.branch},
      target&&{session:name||before?.session,branch:target}]});
    const moved=withGraph(project,g=>{
      const previous=connection(conversation_id),selected=name||previous?.session;if(!selected)throw new Error('세션 이름이 필요합니다.');g.session(selected);
      const current=previous?.session===selected?effective(previous,g):'main',old=current==='main'?null:current;
      let stem=branch==='메인'?'main':branch||null;
      if(stem&&stem!=='main'){
        validName(stem);const header=g.header(selected,stem);if(!header)throw new Error('브랜치가 없습니다. session_branch create로 만드세요.');
        if(header.status===ABANDONED&&stem!==old)throw new Error('중단한 자리입니다. 기록은 session_read로 읽으세요.');
        const holder=branchState(g,selected,stateRecords(),stem);
        if(stem!==old&&holder.alive)throw new Error(`브랜치 '${stem}'에는 살아 있는 대화가 붙어 있습니다. 다른 자리를 쓰세요.`);
      }
      if(!stem)stem=old||openBranch(g,selected,autoName(),{conversation_id,label});
      bind(selected,stem,conversation_id);
      return {session:selected,stem,previous:previous&&(previous.session!==selected||effective(previous,g)!==stem)?{session:previous.session,stem:effective(previous,g)}:null};
    });
    // Leaving a branch closes it: an empty one is dropped, a used one merges into main.
    if(moved.previous&&moved.previous.stem!=='main')closeBranch(moved.previous.session,moved.previous.stem);
    if(moved.stem!=='main')reopen(moved.session,moved.stem);
    return withGraph(project,g=>place(g,moved.session,moved.stem,{count:history_count,limit:map_limit}));
  };
  const reopen=(session,stem)=>locked(branchPath(directory(session),stem),()=>{
    const file=branchPath(directory(session),stem),text=optionalRead(file),header=branchHeader(text);
    if(header&&![OPEN,ABANDONED].includes(header.status))atomicText(file,withStatus(text,OPEN));
  });
  const save=({summary,history,next,recap,conversation_id})=>{
    if(typeof history!=='string'||!history.trim())throw new Error('history(본문)가 필요합니다.');
    const bound=withGraph(project,g=>resolve(conversation_id,g)),dir=directory(bound.session);
    entry({summary,history,next});
    if(bound.stem==='main'){
      const main=path.join(dir,'history.md');
      locked(main,()=>fs.appendFileSync(main,uniqueEntry(main,{summary,history,next})));
      withGraph(project,g=>g.recent(bound.session,'main',1));
      return `세션 '${bound.session}' 메인에 기록했습니다.\n요약: ${summary}${next?`\n다음: ${next}`:''}`;
    }
    if(next&&recap!==undefined&&String(recap).trim())throw new Error(RECAP_REFUSED);
    if(!next&&(recap===undefined||!String(recap).trim()))throw new Error(RECAP_REQUIRED);
    const file=branchPath(dir,bound.stem),main=path.join(dir,'history.md'),record=`work/${bound.stem}/history.md`;
    locked(file,()=>{
      const text=optionalRead(file),header=branchHeader(text);
      if(!header)throw new Error('브랜치 파일을 읽지 못했습니다.');
      if(header.status===ABANDONED)throw new Error('중단한 브랜치에는 저장할 수 없습니다.');
      // The label follows the newest summary; the recap replaces the one at the top.
      let updated=withLabel(header.status===OPEN?text:withStatus(text,OPEN),summary);
      if(!next)updated=withRecap(updated,recap);
      if(updated!==text)atomicText(file,updated);
      fs.appendFileSync(file,uniqueEntry(file,{summary,history,next}));
      locked(main,()=>fs.appendFileSync(main,uniqueEntry(main,{summary,index:{label:summary,record}})));
    });
    withGraph(project,g=>g.recent(bound.session,bound.stem,1));
    return `세션 '${bound.session}' 브랜치 '${bound.stem}'에 기록하고 메인에 색인 한 줄을 남겼습니다.\n요약: ${summary}${next?`\n다음: ${next}`:'\n지금까지 요약을 브랜치 첫머리에 올렸습니다.'}`;
  };
  // Explicit close: the same mechanical entry the end of a conversation would write,
  // after which this conversation takes a fresh branch in the same session.
  const finish=({conversation_id,branch},abandon=false,reason)=>{
    const bound=withGraph(project,g=>resolve(conversation_id,g)),name=branch||bound.stem;
    if(name==='main')throw new Error('메인은 색인이라 닫지 않습니다. 지금 자리의 브랜치를 닫으세요.');
    validName(name);
    if(abandon){
      line(reason,'reason');
      const dir=directory(bound.session),file=branchPath(dir,name),main=path.join(dir,'history.md');
      const state=withGraph(project,g=>{const header=g.header(bound.session,name);if(!header)throw new Error('브랜치가 없습니다.');return {...header,entries:g.own(bound.session,name).map(r=>g.detail(r))};});
      const args={summary:state.label||'브랜치를 중단했습니다.',history:state.recap||'중단했습니다.',status:ABANDONED,branch:name,record:`work/${name}/history.md`,reason};
      entry(args);
      locked(file,()=>{
        const text=optionalRead(file);if(branchHeader(text)?.status===ABANDONED)return;
        locked(main,()=>fs.appendFileSync(main,uniqueEntry(main,args)));
        atomicText(file,withStatus(text,ABANDONED));
      });
      withGraph(project,g=>g.branches(bound.session));
    } else if(!withGraph(project,g=>g.header(bound.session,name)))throw new Error('브랜치가 없습니다.');
    else closeBranch(bound.session,name);
    const fresh=name===bound.stem?(bind(bound.session,'main',conversation_id),load({conversation_id})):null;
    return `브랜치 '${name}'${abandon?' 중단':' 끝'}. 메인에 정리 항목 1개와 기록: work/${name}/history.md.${fresh?`\n이 대화는 새 브랜치 '${connection(conversation_id).branch}'로 이어갑니다.`:''}`;
  };
  return {
    connection,read,load,save,sweep,
    finish:args=>finish(args),
    names:()=>withGraph(project,g=>g.names()),
    view:name=>withGraph(project,g=>sessionView(g,name)),
    views:()=>{sweep();return withGraph(project,g=>{const all=stateRecords();return [...g.names().map(name=>sessionView(g,name,all)),...g.errors.map(e=>({name:e.name,error:e.error,main:{conversations:[]},branches:[]}))];});},
    list(){sweep();return withGraph(project,g=>{const all=stateRecords();
      return [topicList(g,name=>branchStates(g,name,all).filter(b=>b.lifecycle===TODO).length),...g.errors.map(e=>`${e.name}: 읽기 실패 — ${e.error}`)].join('\n');});},
    create({name,context,conversation_id,label}){
      // 목적 없는 세션은 만들지 않는다: 방향이 없거나 공백뿐이면 폴더를 만들기 전에 거절한다.
      if(context!==undefined&&typeof context!=='string')throw new Error('context는 문자열이어야 합니다.');
      if(context===undefined||!context.trim())throw new Error(CONTEXT_REQUIRED);
      const dir=directory(name);fs.mkdirSync(topics,{recursive:true});
      try{fs.mkdirSync(dir);}catch(e){if(e.code==='EEXIST')return `세션 '${name}'이 이미 있습니다. 덮어쓰지 않았습니다.`;throw e;}
      fs.writeFileSync(path.join(dir,'context.md'),context,{flag:'wx'});return load({name,conversation_id,label});
    },
    branch({action,branch,label,parent,conversation_id,reason}){
      if(action==='attach'){if(!branch)throw new Error('branch가 필요합니다.');return load({branch,conversation_id});}
      if(action==='abandon')return finish({branch,conversation_id},true,reason);
      if(action!=='create')throw new Error('action은 create/attach/abandon입니다.');
      const made=withGraph(project,g=>{
        const bound=resolve(conversation_id,g),name=branch||autoName();
        validName(name);if(['main','메인'].includes(name))throw new Error('main/메인은 메인 줄기의 예약 이름입니다.');
        const stem=parent==='메인'?'main':parent||bound.stem;
        openBranch(g,bound.session,name,{label,parent:stem,conversation_id});
        return name;
      });
      withGraph(project,g=>g.branches(connection(conversation_id).session));
      return load({branch:made,conversation_id});
    },
    inspect({action='map',name,branch,limit=30,count=5,id,file,query,conversation_id}){
      return withGraph(project,g=>{
        const previous=connection(conversation_id),selected=name||previous?.session;
        if(action==='entry'){if(!id)throw new Error('id가 필요합니다.');return g.entry(id,selected).body;}
        if(action==='find'){if(!file&&!query)throw new Error('find에는 file 또는 query가 필요합니다.');return g.find({file,query,session:name||(!path.isAbsolute(file||'')?previous?.session:undefined),limit}).map(e=>`${e.id} · ${e.summary}`).join('\n')||'(없음)';}
        if(!selected)throw new Error('세션 이름이 필요합니다.');
        if(action==='map')return g.map(selected,branch,limit);
        if(action==='recent'){const stem=branch||(!name&&previous?effective(previous,g):'main');return g.recent(selected,stem,count).map(e=>e.body).join('\n\n')||'(체크포인트 없음)';}
        throw new Error('action은 map/recent/entry/find입니다.');
      });
    },
    // Current identity of a connected conversation, without changing the connection.
    identity({conversation_id}){const bound=connection(conversation_id);if(!bound?.session)return '';return withGraph(project,g=>g.names().includes(bound.session)?place(g,bound.session,effective(bound,g)):'');},
    // Start hook, run at every start (startup, resume, /clear, compact, a fork). The
    // place is worked out again from the host's own records each time: `origins` is the
    // ancestor chain, nearest first, and the first ancestor that holds a place decides.
    // The cached binding is only used when the records say nothing, and is corrected when
    // they disagree. A continued/cleared conversation takes its ancestor's place whole; a
    // fork takes the ancestor's session on a branch of its own, under the ancestor's branch.
    start({conversation_id,session_name,origins=[],source='startup',title}){
      if(title)markSeen(project,host,conversation_id,{title:firstLine(title)});
      const cached=connection(conversation_id);
      // The nearest ancestor that holds a place, and whether getting there crossed a fork.
      let held=null,forked=false;
      for(const link of origins){
        if(link.kind==='fork')forked=true;
        const bound=connection(link.conversation_id);
        if(bound?.session){held={...link,bound};break;}
      }
      if(!held)forked=false;
      const name=held?.bound.session||cached?.session||session_name;if(!name)return null;
      if(!withGraph(project,g=>g.names().includes(name)))return null;
      const was=cached?.session===name&&cached.branch?{session:name,branch:cached.branch}:null;
      let stem;
      if(held&&!forked){
        // The place carries over whole, and the conversation that handed it over is done.
        stem=withGraph(project,g=>effective(held.bound,g));
        markSeen(project,host,held.conversation_id,{status:'ended'});
      }
      else if(held&&was)stem=was.branch; // a fork that restarts keeps the branch it was given
      else if(held)stem=withGraph(project,g=>openBranch(g,name,autoName(),{parent:effective(held.bound,g),conversation_id,label:title}));
      else if(was)stem=was.branch;
      else stem=withGraph(project,g=>openBranch(g,name,autoName(),{conversation_id,label:title}));
      bind(name,stem,conversation_id);
      markSeen(project,host,conversation_id,{});
      if(stem!=='main')reopen(name,stem);
      // A place the records moved this conversation off is closed like any other leaving.
      if(was&&was.branch!==stem)closeBranch(was.session,was.branch);
      // The conversation already holds its context when the host resumes it or starts it
      // as a copy of its parent (source 'fork'). A fresh start, /clear and a compact all
      // need the identity put back in front of the model.
      if(source==='resume'||source==='fork')return {text:'',session:name,stem};
      sweep({except:[{session:name,branch:stem}]});
      return {text:withGraph(project,g=>place(g,name,stem)),session:name,stem};
    },
    // A conversation ended: close the branch it was holding.
    closed({conversation_id}){const bound=connection(conversation_id);if(!bound?.session||!bound.branch)return 0;return sweep();}
  };
}
