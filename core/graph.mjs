import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {locations,validName,noSymlink,locked,readError} from './storage.mjs';
import {parseHistory,mapSummary} from './history.mjs';
import {branchHeader} from './branch-format.mjs';

// 24.11.1 emits only this warning at require time. Do not mute other warnings.
const emit=process.emitWarning;
let DatabaseSync;
try {
  process.emitWarning=function(warning,...args){if(String(warning).startsWith('SQLite is an experimental feature'))return;return emit.call(this,warning,...args);};
  ({DatabaseSync}=createRequire(import.meta.url)('node:sqlite'));
} finally {process.emitWarning=emit;}
const VERSION=1;
export const stemId=(session,stem)=>`stem:${encodeURIComponent(session)}/${encodeURIComponent(stem)}`;
export const checkpointId=(session,stem,time,occurrence=1)=>`${encodeURIComponent(session)}/${encodeURIComponent(stem)}@${time}${occurrence>1?'#'+occurrence:''}`;
function references(body,dir){
  const candidates=[...body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(m=>m[1]);
  candidates.push(...[...body.matchAll(/`([^`\n]+)`/g)].map(m=>m[1]));
  candidates.push(...[...body.matchAll(/(?:^|\s|[:(])((?:\/|\.\.?\/|[\w가-힣.-]+\/)[^\s<>"'`)\]]+)/gm)].map(m=>m[1]));
  candidates.push(...[...body.matchAll(/(?:^|[\s:(])([\w가-힣.-]+\.[A-Za-z0-9]{1,10})(?=$|[\s,.)])/gm)].map(m=>m[1]));
  return [...new Set(candidates.flatMap(value=> {
    value=value.replace(/^<|>$/g,'').replace(/\s+["'].*$/,'').split('#')[0].replace(/[,;。]+$/,'');
    if(/^[a-z]+:\/\//i.test(value))return [];
    try {value=decodeURIComponent(value);const file=path.resolve(dir,value);return fs.statSync(file).isFile()?[file]:[];}catch{return [];}
  }))];
}
function schema(db){
  db.exec('DROP TABLE IF EXISTS edges; DROP TABLE IF EXISTS nodes; DROP TABLE IF EXISTS files;');
  db.exec(`CREATE TABLE files(path TEXT PRIMARY KEY,mtime REAL NOT NULL,size INTEGER NOT NULL);
    CREATE TABLE nodes(id TEXT PRIMARY KEY,kind TEXT NOT NULL,session TEXT NOT NULL,stem TEXT NOT NULL,stamp TEXT NOT NULL,file TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,seq INTEGER NOT NULL);
    CREATE INDEX nodes_stem ON nodes(session,stem,kind,seq);
    CREATE TABLE edges(src TEXT NOT NULL,dst TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(src,dst,kind));
    CREATE INDEX edges_destination ON edges(dst,kind); PRAGMA user_version=${VERSION};`);
}
export function withGraph(project,fn){
  const {root,topics}=locations(project);fs.mkdirSync(root,{recursive:true});const file=noSymlink(path.join(root,'index.sqlite'));
  // Gate schema rebuild and corrupted-file replacement as well as normal operations.
  // History locks are never held by a graph read; writers release them before indexing.
  return locked(file,()=> {
    let db;
    try {db=new DatabaseSync(file,{timeout:5000});db.exec('PRAGMA busy_timeout=5000;');db.prepare('PRAGMA user_version').get();}
    catch(e){try{db?.close();}catch{};if(!/not a database|malformed/i.test(e.message))throw e;fs.unlinkSync(file);db=new DatabaseSync(file,{timeout:5000});}
    try {
      const shape={files:'path,mtime,size',nodes:'id,kind,session,stem,stamp,file,start,end,seq',edges:'src,dst,kind'};
      if(db.prepare('PRAGMA user_version').get().user_version!==VERSION || Object.entries(shape).some(([table,columns])=>db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name).join(',')!==columns)){
        db.close();fs.unlinkSync(file);db=new DatabaseSync(file,{timeout:5000});db.exec('BEGIN IMMEDIATE');schema(db);db.exec('COMMIT');
      }
      db.exec('BEGIN IMMEDIATE');
      const g=new Graph(db,topics);g.sync();const result=fn(g);db.exec('COMMIT');return result;
    }catch(e){try{db.exec('ROLLBACK');}catch{};throw e;}finally{db.close();}
  });
}
class Graph {
  constructor(db,topics){this.db=db;this.topics=topics;this.errors=[];this.reindexed=[];}
  node(row){this.db.prepare('INSERT OR REPLACE INTO nodes VALUES(?,?,?,?,?,?,?,?,?)').run(row.id,row.kind,row.session,row.stem,row.stamp||'',row.file,row.start,row.end,row.seq||0);}
  edge(src,dst,kind){this.db.prepare('INSERT OR IGNORE INTO edges VALUES(?,?,?)').run(src,dst,kind);}
  read(row){
    if(!row)return null;const file=noSymlink(row.file),fd=fs.openSync(file,'r'),data=Buffer.alloc(row.end-row.start);
    try {fs.readSync(fd,data,0,data.length,row.start);}finally{fs.closeSync(fd);}
    return data.toString('utf8');
  }
  detail(row){const e=parseHistory(this.read(row))[0];if(!e)throw new Error(`기록 위치를 읽지 못했습니다: ${row.id}`);return {...e,id:row.id,stem:row.stem,file:row.file};}
  header(session,stem){const row=this.db.prepare('SELECT * FROM nodes WHERE id=?').get(stemId(session,stem));return row?.kind==='branch'?branchHeader(this.read(row)):null;}
  session(name){validName(name);const row=this.db.prepare("SELECT * FROM nodes WHERE id=? AND kind='session'").get(stemId(name,'main'));if(!row)throw new Error(`세션 '${name}'이 없습니다.`);return {name,context:this.read(row),file:row.file};}
  names(){return this.db.prepare("SELECT session FROM nodes WHERE kind='session' ORDER BY session").all().map(r=>r.session);}
  branches(session){return this.db.prepare("SELECT * FROM nodes WHERE kind='branch' AND session=? ORDER BY stem").all(session).map(row=>({name:row.stem,...this.header(session,row.stem)}));}
  own(session,stem){return this.db.prepare("SELECT * FROM nodes WHERE kind='checkpoint' AND session=? AND stem=? ORDER BY seq").all(session,stem);}
  lineage(session,stem='main',seen=new Set()){
    if(stem==='main')return this.own(session,stem);
    const key=stemId(session,stem);if(seen.has(key))throw new Error('브랜치 갈래에 순환이 있습니다.');seen.add(key);
    const parent=this.db.prepare("SELECT n.* FROM edges e JOIN nodes n ON n.id=e.src WHERE e.dst=? AND e.kind='fork' AND n.kind IN ('branch','session')").get(key);
    if(!parent)throw new Error(`브랜치 부모를 찾지 못했습니다: ${stem}`);
    const prior=this.lineage(session,parent.stem,seen);
    const anchor=this.db.prepare("SELECT n.* FROM edges e JOIN nodes n ON n.id=e.src WHERE e.dst=? AND e.kind='fork' AND n.kind='checkpoint'").get(key);
    const inherited=anchor?prior.slice(0,prior.findIndex(r=>r.id===anchor.id)+1):[];
    return [...inherited,...this.own(session,stem)];
  }
  recent(session,stem='main',count=5){if(!Number.isInteger(count)||count<0)throw new Error('count는 0 이상의 정수입니다.');const rows=this.lineage(session,stem);return (count===0?rows:rows.slice(-count)).map(row=>this.detail(row));}
  item(id){const row=this.db.prepare("SELECT * FROM nodes WHERE id=? AND kind='checkpoint'").get(id);if(!row)throw new Error('체크포인트 식별자가 없습니다.');return this.detail(row);}
  map(session,stem,limit=30,{branchLimit=Infinity}={}){
    this.session(session);if(!Number.isInteger(limit)||limit<0)throw new Error('limit는 0 이상의 정수입니다.');
    const rows=stem?this.lineage(session,stem):this.db.prepare("SELECT * FROM nodes WHERE kind='checkpoint' AND session=? ORDER BY stamp,stem,seq").all(session).sort((a,b)=>(Date.parse(a.stamp)||0)-(Date.parse(b.stamp)||0)||a.stem.localeCompare(b.stem)||a.seq-b.seq);
    const selected=limit===0?rows:rows.slice(-limit), lines=[`# 지도: ${session}${stem?' / '+stem:''}`];
    const depth=name=>{let n=0,current=name;const seen=new Set();while(current!=='main'&&!seen.has(current)){seen.add(current);n++;current=this.header(session,current)?.parent||'main';}return n;};
    for(const row of [...selected].reverse()){
      const e=this.detail(row), merge=this.db.prepare("SELECT src FROM edges WHERE dst=? AND kind='merge'").get(row.id);
      lines.push(`${'| '.repeat(depth(row.stem))}${merge?'M':'*'} ${e.id} · ${mapSummary(e).text}${merge?' ← 합쳐짐 '+merge.src.split('/').at(-1):''}`);
    }
    const shown=new Set(rows.map(r=>r.id));
    let branchRows=0,omittedBranches=0;
    for(const b of this.branches(session)) {
      const key=stemId(session,b.name), anchor=this.db.prepare("SELECT n.id FROM edges e JOIN nodes n ON n.id=e.src WHERE e.dst=? AND e.kind='fork' AND n.kind='checkpoint'").get(key);
      if(!stem||stem===b.name||anchor&&shown.has(anchor.id)){
        if(branchRows++<branchLimit)lines.push(`|\\ ${b.name} [${b.status==='열림'?'열림':b.status}] ← ${b.parent}@${b.anchor||'없음'}${b.anchor?'':' (부모 체크포인트 없음)'}`);
        else omittedBranches++;
      }
    }
    if(omittedBranches)lines.push(`그 외 지도 갈래 ${omittedBranches}개`);
    if(rows.length>selected.length)lines.push(`그 앞 ${rows.length-selected.length}개`);
    if(stem&&stem!=='main'){
      const inheritedIds=new Set(rows.map(r=>r.id));const newer=this.own(session,'main').filter(r=>!inheritedIds.has(r.id));
      if(newer.length)lines.push('# 갈라진 뒤 메인 (요약만)',...newer.slice(-5).map(r=>`· ${r.id} · ${mapSummary(this.detail(r)).text}`));
    }
    return lines.join('\n');
  }
  find({file,query,session,limit=30}){
    if(!Number.isInteger(limit)||limit<0)throw new Error('limit는 0 이상의 정수입니다.');
    let rows;
    if(file){const target=path.resolve(session?path.join(this.topics,session):this.topics,file);if(!fs.existsSync(target))return [];rows=this.db.prepare("SELECT n.* FROM edges e JOIN nodes n ON n.id=e.src WHERE e.dst=? AND e.kind='points' ORDER BY n.stamp DESC").all('file:'+target);}
    else rows=this.db.prepare("SELECT * FROM nodes WHERE kind='checkpoint' ORDER BY stamp DESC").all();
    if(session)rows=rows.filter(r=>r.session===session);
    const results=rows.map(r=>this.detail(r)).filter(e=>!query||e.body.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    return limit===0?results:results.slice(0,limit);
  }
  sync(){
    const sources=[];
    if(fs.existsSync(this.topics))for(const e of fs.readdirSync(this.topics,{withFileTypes:true})){
      if(!e.isDirectory()||e.name.startsWith('_'))continue;
      try{
        validName(e.name);const dir=noSymlink(path.join(this.topics,e.name)),context=noSymlink(path.join(dir,'context.md'));
        if(!fs.existsSync(context))continue;
        sources.push({file:context,session:e.name,stem:'main',kind:'session',dir});
        const main=noSymlink(path.join(dir,'history.md'));if(fs.existsSync(main))sources.push({file:main,session:e.name,stem:'main',kind:'history',dir});
        const work=noSymlink(path.join(dir,'work'));
        if(fs.existsSync(work))for(const b of fs.readdirSync(work,{withFileTypes:true}).filter(b=>b.isDirectory())){
          validName(b.name);const file=noSymlink(path.join(work,b.name,'history.md'));if(fs.existsSync(file))sources.push({file,session:e.name,stem:b.name,kind:'branch',dir});
        }
      }catch(error){this.errors.push({name:e.name,error:readError(error)});}
    }
    const paths=new Set(sources.map(s=>s.file));let changed=false;
    for(const old of this.db.prepare('SELECT path FROM files').all())if(!paths.has(old.path)){this.remove(old.path);changed=true;}
    for(const source of sources){
      try{
        const stat=fs.statSync(source.file),old=this.db.prepare('SELECT * FROM files WHERE path=?').get(source.file);
        if(old&&old.mtime===stat.mtimeMs&&old.size===stat.size)continue;
        let text,stable;
        for(let i=0;i<4;i++){const before=fs.statSync(source.file);text=fs.readFileSync(source.file,'utf8');const after=fs.statSync(source.file);if(before.mtimeMs===after.mtimeMs&&before.size===after.size){stable=after;break;}}
        if(!stable)throw new Error('기록이 계속 바뀌어 안정된 색인 위치를 얻지 못했습니다.');
        this.remove(source.file);changed=true;this.reindexed.push(source.file);
        if(source.kind==='session')this.node({id:stemId(source.session,'main'),kind:'session',...source,start:0,end:stable.size});
        else{
          const header=source.kind==='branch'?branchHeader(text):null;
          if(source.kind==='branch'&&!header){this.db.prepare('INSERT OR REPLACE INTO files VALUES(?,?,?)').run(source.file,stable.mtimeMs,stable.size);continue;} // Existing work artifacts are not branches.
          if(header)this.node({id:stemId(source.session,source.stem),kind:'branch',...source,start:0,end:Buffer.byteLength(text.slice(0,header.end))});
          const counts=new Map();
          for(const [seq,e] of parseHistory(text).entries()){
            const occurrence=(counts.get(e.timestamp)||0)+1;counts.set(e.timestamp,occurrence);
            const id=checkpointId(source.session,source.stem,e.timestamp,occurrence);this.node({...source,id,kind:'checkpoint',stamp:e.timestamp,start:e.start,end:e.end,seq});
            for(const file of references(e.body,source.dir)){this.node({id:'file:'+file,kind:'file',session:'',stem:'',file,start:0,end:fs.statSync(file).size});this.edge(id,'file:'+file,'points');}
          }
        }
        this.db.prepare('INSERT OR REPLACE INTO files VALUES(?,?,?)').run(source.file,stable.mtimeMs,stable.size);
      }catch(error){this.errors.push({name:source.session,file:source.file,error:readError(error)});}
    }
    if(changed)this.relate();
  }
  remove(file){const ids=this.db.prepare("SELECT id FROM nodes WHERE file=? AND kind<>'file'").all(file);for(const {id} of ids){this.db.prepare('DELETE FROM edges WHERE src=? OR dst=?').run(id,id);this.db.prepare('DELETE FROM nodes WHERE id=?').run(id);}this.db.prepare('DELETE FROM files WHERE path=?').run(file);}
  relate(){
    this.db.exec("DELETE FROM edges WHERE kind IN ('next','fork','merge')");
    for(const name of this.names()){
      const branches=this.branches(name);
      for(const stem of ['main',...branches.map(b=>b.name)]){const rows=this.own(name,stem);for(let i=1;i<rows.length;i++)this.edge(rows[i-1].id,rows[i].id,'next');}
      const pending=[...branches];let progress=true;
      while(pending.length&&progress){progress=false;for(let i=pending.length-1;i>=0;i--){const b=pending[i];if(pending.some(x=>x.name===b.parent))continue;
        try{const parentRows=b.parent==='main'?this.own(name,'main'):this.lineage(name,b.parent);const anchor=b.anchor?parentRows.findLast(r=>b.anchor_id?r.id===b.anchor_id:r.stamp===b.anchor):null;
          if(b.anchor&&!anchor)throw new Error(`갈래 체크포인트 없음: ${b.name} ← ${b.parent}@${b.anchor}`);
          this.edge(stemId(name,b.parent),stemId(name,b.name),'fork');if(anchor)this.edge(anchor.id,stemId(name,b.name),'fork');
          const first=this.own(name,b.name)[0];if(anchor&&first)this.edge(anchor.id,first.id,'next');
        }catch(error){this.errors.push({name,error:readError(error)});}pending.splice(i,1);progress=true;}}
      if(pending.length)this.errors.push({name,error:'브랜치 부모 순환 또는 부모 누락'});
      for(const row of this.own(name,'main')){const e=this.detail(row);if(e.branch&&e.record===`work/${e.branch}/history.md`&&['끝남','중단'].includes(e.status)&&branches.some(b=>b.name===e.branch))this.edge(stemId(name,e.branch),row.id,'merge');}
    }
  }
}
