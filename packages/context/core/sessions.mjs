import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseHistory} from './history.mjs';
import {evidenceAlive} from './liveness.mjs';
import {conversationView,groupStatus} from './work-view.mjs';
import {activity,markRecovered} from './state.mjs';
import {identity,openBranchLines,leaveGuide,topicList,RECENT_COUNT,SUMMARY_LIMIT} from './recovery.mjs';
import {withGraph} from './graph.mjs';
import {branchPath,branchHeader,BRANCH_MARKER,firstLine} from './branch-format.mjs';
import {validName,optionalRead,noSymlink,locations,recordFile,atomicJSON,atomicText,records,readError,locked,entry,line} from './storage.mjs';
export * from './storage.mjs';

export const CONTEXT_REQUIRED='방향(context)이 필요합니다. 목적 없는 세션은 만들지 않습니다. 사용자와 이 세션의 목적을 정한 뒤 그 내용을 context로 주세요. 세션은 만들어지지 않았습니다.';
export function sessions(project,{host='claude',isAlive=evidenceAlive}={}){
  const {topics,state}=locations(project);
  const directory=name=>{validName(name);if(name.startsWith('_'))throw new Error('보관 폴더는 세션이 아닙니다.');return noSymlink(path.join(topics,name));};
  const connection=id=>id?JSON.parse(optionalRead(recordFile(state,'conversations',id,host))||'null'):null;
  const effective=(bound,g)=>{
    const candidate=bound?.branch;
    if(!candidate)return 'main';
    return g.branches(bound.session).some(b=>b.name===candidate&&b.status==='열림')?candidate:'main';
  };
  const bind=(name,stem,id)=>{if(!id)throw new Error('conversation_id가 필요합니다 (호스트 연결이 채웁니다).');atomicJSON(recordFile(state,'conversations',id,host),{host,conversation_id:id,session:name,branch:stem==='main'?null:stem,bound_at:new Date().toISOString()});};
  const resolve=(id,g)=>{const bound=connection(id);if(!bound?.session)throw new Error('먼저 세션을 불러오거나 만드세요.');g.session(bound.session);return {...bound,stem:effective(bound,g)};};
  // The state folders are read once per board, not once per session.
  const stateRecords=()=>({cs:records(path.join(state,'conversations')),as:records(path.join(state,'activity')),children:records(path.join(state,'subtasks'))});
  const sessionView=(g,name,all=stateRecords())=>{
    g.session(name);
    const cs=all.cs.filter(c=>c.session===name),as=all.as,children=all.children;
    const conversations=cs.map(c=>({...conversationView(c,as,children,isAlive),stem:effective(c,g)}));
    const mainConversations=conversations.filter(c=>c.stem==='main'),last=g.recent(name,'main',1).at(-1);
    return {name,main:{status:groupStatus(mainConversations),summary:last?.summary||'(체크포인트 없음)',timestamp:last?.timestamp||null,conversations:mainConversations},
      branches:g.branches(name).filter(b=>b.status==='열림').map(b=>{
        const own=g.own(name,b.name).at(-1),latest=own?g.detail(own):null,cs=conversations.filter(c=>c.stem===b.name);
        return {name:b.name,topic:b.topic,parent:b.parent,status:groupStatus(cs),summary:latest?.summary||'(체크포인트 없음)',timestamp:latest?.timestamp||null,conversations:cs};
      })};
  };
  const leave=(previous,name,stem,g,keep)=>{
    if(!previous||keep===true)return '';
    const old=effective(previous,g);
    return old!=='main'&&(name!==previous.session||stem!==old)?leaveGuide(old,`${name}/${stem==='main'?'메인':stem}`):'';
  };
  const read=name=>withGraph(project,g=>({name,context:g.session(name).context,entries:g.recent(name,'main',0),branches:g.branches(name),errors:g.errors}));
  // Load = choose the session, bind the conversation and return its identity. The start
  // hook calls the same identity, so hook output and session_load are one thing.
  const load=({name,branch,history_count=RECENT_COUNT,map_limit=SUMMARY_LIMIT,conversation_id,keep_open=false}={})=>withGraph(project,g=>{
    const previous=connection(conversation_id),selected=name||previous?.session;if(!selected)throw new Error('세션 이름이 필요합니다.');g.session(selected);
    const stem=branch==='메인'?'main':branch||(!name&&previous?effective(previous,g):'main');
    if(stem!=='main'){validName(stem);if(!g.header(selected,stem))throw new Error('브랜치가 없습니다. session_branch create로 만드세요.');}
    if(!Number.isInteger(history_count)||history_count<0)throw new Error('history_count는 0 이상의 정수입니다.');
    const result=identity(g,{name:selected,stem,count:history_count,limit:map_limit});
    if(stem!=='main'&&g.header(selected,stem).status!=='열림')return result+'\n[닫힌 브랜치 조회: 연결은 그대로입니다.]';
    const warning=leave(previous,selected,stem,g,keep_open);if(warning)return warning;
    bind(selected,stem,conversation_id);
    return result;
  });
  const uniqueEntry=(file,args)=>{
    const used=new Set(parseHistory(optionalRead(file)).map(e=>e.timestamp));let time=Date.now();while(used.has(new Date(time).toISOString()))time++;
    return entry({...args,timestamp:new Date(time).toISOString()});
  };
  const save=({summary,history,next,conversation_id})=>{
    if(typeof history!=='string'||!history.trim())throw new Error('history(본문)가 필요합니다.');
    const bound=withGraph(project,g=>resolve(conversation_id,g)),dir=directory(bound.session),file=bound.stem==='main'?path.join(dir,'history.md'):branchPath(dir,bound.stem);
    entry({summary,history,next});
    locked(file,()=>{
      if(bound.stem!=='main'&&branchHeader(optionalRead(file))?.status!=='열림')throw new Error('닫힌 브랜치에는 저장할 수 없습니다.');
      fs.appendFileSync(file,uniqueEntry(file,{summary,history,next}));
    });
    withGraph(project,g=>g.recent(bound.session,bound.stem,1));
    return `세션 '${bound.session}' ${bound.stem==='main'?'메인':`브랜치 '${bound.stem}'`}에 기록했습니다.\n요약: ${summary}${next?`\n다음: ${next}`:''}`;
  };
  const finish=({conversation_id,branch,summary,history='',next,reason},abandon=false)=>{
    const bound=withGraph(project,g=>resolve(conversation_id,g)),name=branch||bound.stem;
    if(name==='main') {
      if(abandon)throw new Error('중단할 브랜치를 선택하세요.');
      return save({conversation_id,summary:summary||'메인 기록을 정리했습니다.',history:history||summary||'메인 기록을 정리했습니다.',next});
    }
    validName(name);if(abandon)line(reason,'reason');
    const dir=directory(bound.session),file=branchPath(dir,name),main=path.join(dir,'history.md'),status=abandon?'중단':'끝남',record=`work/${name}/history.md`;
    const args={summary:summary||(abandon?'브랜치를 중단했습니다.':'브랜치를 정리했습니다.'),history,next,branch:name,record,status,reason};
    entry(args); // Validate all external fields before mutating either file.
    locked(file,()=>{
      const header=withGraph(project,g=>g.header(bound.session,name));if(!header)throw new Error('브랜치가 없습니다.');
      if(header.status!=='열림')return;
      locked(main,()=>{
        const exists=withGraph(project,g=>g.recent(bound.session,'main',0).some(e=>e.branch===name&&e.record===record&&['끝남','중단'].includes(e.status)));
        if(!exists)fs.appendFileSync(main,uniqueEntry(main,args));
        atomicText(file,optionalRead(file).replace(/^상태: 열림$/m,`상태: ${status}`));
      });
    });
    withGraph(project,g=>g.branches(bound.session));bind(bound.session,'main',conversation_id);
    return `브랜치 '${name}' ${status}. 메인 정리 항목 1개와 기록: ${record}. 현재 대화는 메인입니다.`;
  };
  return {
    connection,read,load,save,finish,
    names:()=>withGraph(project,g=>g.names()),
    view:name=>withGraph(project,g=>sessionView(g,name)),
    views:()=>withGraph(project,g=>{const all=stateRecords();return [...g.names().map(name=>sessionView(g,name,all)),...g.errors.map(e=>({name:e.name,error:e.error,main:{conversations:[]},branches:[]}))];}),
    list(){return withGraph(project,g=>[topicList(g),...g.errors.map(e=>`${e.name}: 읽기 실패 — ${e.error}`)].join('\n'));},
    create({name,context,conversation_id,keep_open=false}){
      // 목적 없는 세션은 만들지 않는다: 방향이 없거나 공백뿐이면 폴더를 만들기 전에 거절한다.
      if(context!==undefined&&typeof context!=='string')throw new Error('context는 문자열이어야 합니다.');
      if(context===undefined||!context.trim())throw new Error(CONTEXT_REQUIRED);
      const warning=withGraph(project,g=>leave(connection(conversation_id),name,'main',g,keep_open));if(warning)return warning;
      const dir=directory(name);fs.mkdirSync(topics,{recursive:true});
      try{fs.mkdirSync(dir);}catch(e){if(e.code==='EEXIST')return `세션 '${name}'이 이미 있습니다. 덮어쓰지 않았습니다.`;throw e;}
      fs.writeFileSync(path.join(dir,'context.md'),context,{flag:'wx'});return load({name,conversation_id,keep_open});
    },
    branch({action,branch,topic,parent,conversation_id,summary,history,next,reason,keep_open=false}){
      if(action==='attach'){if(!branch)throw new Error('branch가 필요합니다.');return load({branch,conversation_id,keep_open});}
      if(action==='main')return load({branch:'main',conversation_id,keep_open});
      if(action==='abandon')return finish({branch,conversation_id,summary,history,next,reason},true);
      if(action!=='create')throw new Error('action은 create/attach/main/abandon입니다.');
      line(firstLine(topic),'topic');
      const bound=withGraph(project,g=>resolve(conversation_id,g)),name=branch||`branch-${new Date().toISOString().replace(/[-:]/g,'').slice(0,15)}-${randomUUID().slice(0,8)}`;
      validName(name);if(['main','메인'].includes(name))throw new Error('main/메인은 메인 줄기의 예약 이름입니다.');const stem=parent==='메인'?'main':parent||bound.stem,dir=directory(bound.session),file=branchPath(dir,name),parentFile=stem==='main'?path.join(dir,'history.md'):branchPath(dir,stem);
      fs.mkdirSync(path.dirname(file),{recursive:true});
      locked(parentFile,()=>{
        const last=withGraph(project,g=>{if(stem!=='main'&&!g.header(bound.session,stem))throw new Error('부모 브랜치가 없습니다.');return g.recent(bound.session,stem,1).at(-1);});
        const text=`${BRANCH_MARKER}\n# ${name}\n\n주제: ${firstLine(topic)}\n시작: ${new Date().toISOString()}\n갈래: ${bound.session}/${stem==='main'?'메인':stem}@${last?.timestamp||'없음'}\n갈래-ID: ${last?.id||''}\n상태: 열림\n`;
        fs.writeFileSync(noSymlink(file),text,{flag:'wx'});
      });
      withGraph(project,g=>g.branches(bound.session));return load({branch:name,conversation_id,keep_open:true});
    },
    inspect({action='map',name,branch,limit=30,count=5,id,file,query,conversation_id}){
      return withGraph(project,g=>{
        const previous=connection(conversation_id),selected=name||previous?.session;
        if(action==='entry'){if(!id)throw new Error('id가 필요합니다.');return g.item(id).body;}
        if(action==='find'){if(!file&&!query)throw new Error('find에는 file 또는 query가 필요합니다.');return g.find({file,query,session:name||(!path.isAbsolute(file||'')?previous?.session:undefined),limit}).map(e=>`${e.id} · ${e.summary}`).join('\n')||'(없음)';}
        if(!selected)throw new Error('세션 이름이 필요합니다.');
        if(action==='map')return g.map(selected,branch,limit);
        if(action==='recent'){const stem=branch||(!name&&previous?effective(previous,g):'main');return g.recent(selected,stem,count).map(e=>e.body).join('\n\n')||'(체크포인트 없음)';}
        throw new Error('action은 map/recent/entry/find입니다.');
      });
    },
    // Current identity of a connected conversation, without changing the connection.
    identity({conversation_id}){const bound=connection(conversation_id);if(!bound?.session)return '';return withGraph(project,g=>g.names().includes(bound.session)?identity(g,{name:bound.session,stem:effective(bound,g)}):'');},
    // Start hook. resume keeps the conversation as it is; startup/clear/compact are a
    // fresh start and return the same identity session_load returns. A new conversation
    // takes the session of the conversation it came from (/clear, native fork), else the
    // given name when such a session exists. Returns {text,bound} or null.
    start({conversation_id,session_name,from_conversation_id,source='startup',inherited_context=false}){
      const previous=connection(conversation_id),origin=previous?null:connection(from_conversation_id);
      const name=previous?.session||origin?.session||session_name;if(!name)return null;
      return withGraph(project,g=>{
        if(!g.names().includes(name))return null;
        const stem=previous?effective(previous,g):origin?.session===name?effective(origin,g):'main';
        if(!previous)bind(name,stem,conversation_id);
        markRecovered(project,host,conversation_id);
        if((source==='resume'&&previous)||inherited_context)return {text:'',session:name,stem};
        return {text:identity(g,{name,stem}),session:name,stem};
      });
    }
  };
}
