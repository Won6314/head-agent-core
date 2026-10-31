import {createHash} from 'node:crypto';
import {mapSummary} from './history.mjs';
// The record map drawn the way `git log --graph --date-order` draws commits: one save per
// line, newest on top, main always in the first column, each branch in its own column
// from the save it forked at up to its newest save. Only the view is git-shaped; files,
// saves and the index are unchanged.
const SHORT_LENGTH=5;
const ENDED=['끝남','멈춤','중단'];
const hex=id=>createHash('sha1').update(id).digest('hex');
// Short ID: the first five hex digits of the full checkpoint ID's hash. Where two of a
// session's checkpoints share a prefix, only those grow one digit at a time.
export function shortIds(ids){
  const out=new Map(),hash=new Map(ids.map(id=>[id,hex(id)]));
  let pending=[...ids];
  for(let length=SHORT_LENGTH;pending.length;length++){
    const groups=new Map();
    for(const id of pending){const key=hash.get(id).slice(0,length);groups.set(key,[...(groups.get(key)||[]),id]);}
    pending=[];
    for(const [key,group] of groups)if(group.length===1)out.set(group[0],key);else pending.push(...group);
  }
  return out;
}
// The checkpoints of one session a short ID (or any longer prefix of the hash) points at.
export const matchShort=(ids,value)=>ids.filter(id=>hex(id).startsWith(value.toLowerCase()));
// Branch name in the map: an automatic `branch-<time>-<hex>` name shows its first four
// hex digits, longer only where two would collide; any other name is shown as it is.
const AUTO=/^branch-\d{8}T\d{6}-([0-9a-f]+)$/;
function stemNames(stems){
  const out=new Map();let pending=[];
  for(const stem of stems){if(AUTO.test(stem))pending.push(stem);else out.set(stem,stem);}
  for(let length=4;pending.length;length++){
    const groups=new Map(),taken=new Set(out.values());
    for(const stem of pending){const key=AUTO.exec(stem)[1].slice(0,length);groups.set(key,[...(groups.get(key)||[]),stem]);}
    pending=[];
    for(const [key,group] of groups){
      const whole=group.every(stem=>AUTO.exec(stem)[1].length<=length);
      if(group.length===1&&!taken.has(key))out.set(group[0],key);
      else if(whole)for(const stem of group)out.set(stem,stem);
      else pending.push(...group);
    }
  }
  return out;
}
export const shortStem=stem=>stemNames([stem]).get(stem);
// Absolute time as MM-DD HH:MM in the project's time zone (the computer's when unset).
// Pre-0.4 records carry a date only; those show the date and no time.
export function clock(timeZone){
  const format=new Intl.DateTimeFormat('en-CA',{timeZone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  return stamp=>{
    const value=String(stamp||'');
    if(!value.includes('T')){const m=/^\d{4}-(\d{2})-(\d{2})/.exec(value);return m?`${m[1]}-${m[2]} --:--`:'--:-- --:--';}
    const time=Date.parse(value);if(!Number.isFinite(time))return '--:-- --:--';
    const p=Object.fromEntries(format.formatToParts(new Date(time)).map(x=>[x.type,x.value]));
    return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
  };
}
// One session's map. `stem` keeps main and that branch's own ancestry; `current` marks
// the place the reader sits on. Returns the drawn lines and how many saves are older
// than the window.
export function renderMap(g,session,{stem,limit=30,current}={}){
  if(!Number.isInteger(limit)||limit<0)throw new Error('limit는 0 이상의 정수입니다.');
  const branches=g.branches(session),byName=new Map(branches.map(b=>[b.name,b]));
  const rows=g.checkpoints(session),ids=g.shortIds(session),names=stemNames(['main',...branches.map(b=>b.name)]);
  const nameOf=s=>names.get(s)||shortStem(s);
  const details=new Map(),detail=row=>{if(!details.has(row.id))details.set(row.id,g.detail(row));return details.get(row.id);};
  // A branch save also leaves one index line on main; the branch column already shows it.
  const indexed=e=>{const m=/^work\/([^/]+)\/history\.md$/.exec(e.source||'');return Boolean(m&&byName.has(m[1]));};
  const hidden=new Set(branches.length?rows.filter(r=>r.stem==='main'&&indexed(detail(r))).map(r=>r.id):[]);
  let allowed=null;
  if(stem&&stem!=='main'){
    if(!byName.has(stem))throw new Error(`브랜치가 없습니다: ${stem}`);
    allowed=new Set(['main']);for(let s=stem,n=0;s&&s!=='main'&&n<64;n++){allowed.add(s);s=byName.get(s)?.parent;}
  }
  const visible=rows.filter(r=>!hidden.has(r.id)&&(!allowed||allowed.has(r.stem)));
  const shown=limit===0?visible:visible.slice(-limit),order=[...shown].reverse();
  const at=new Map(order.map((r,i)=>[r.id,i])),place=new Map(rows.map((r,i)=>[r.id,i]));
  const idx=id=>at.has(id)?at.get(id):Infinity; // not shown = older than the window
  const own=new Map();for(const r of rows)if(r.stem!=='main')own.set(r.stem,[...(own.get(r.stem)||[]),r]);
  // Merge lines: the main entry a closing branch left, and the branch save it closes over.
  const merges=new Map();
  for(const r of order){
    if(r.stem!=='main')continue;
    const src=g.db.prepare("SELECT src FROM edges WHERE dst=? AND kind='merge'").get(r.id)?.src;if(!src)continue;
    const b=decodeURIComponent(src.split('/').at(-1)),last=(own.get(b)||[]).findLast(x=>place.get(x.id)<place.get(r.id));
    merges.set(r.id,{stem:b,parent:last?.id||null});
  }
  // Columns. A hidden index line cannot hold a fork, so a fork made at one is drawn at the
  // main save before it.
  const forkAt=b=>{
    let a=g.db.prepare("SELECT n.* FROM edges e JOIN nodes n ON n.id=e.src WHERE e.dst=? AND e.kind='fork' AND n.kind='checkpoint'").get(`stem:${encodeURIComponent(session)}/${encodeURIComponent(b)}`);
    if(a&&hidden.has(a.id))a=rows.filter(r=>r.stem===a.stem&&!hidden.has(r.id)&&place.get(r.id)<place.get(a.id)).at(-1)||null;
    return a||null;
  };
  // Main runs in the first column whenever it has a save of its own to show.
  const trunk=visible.some(r=>r.stem==='main'),lanes=[],laneOf=new Map([['main',0]]);
  for(const b of [...branches].sort((x,y)=>String(x.started).localeCompare(String(y.started))||x.name.localeCompare(y.name))){
    if(allowed&&!allowed.has(b.name))continue;
    const mine=own.get(b.name)||[],closes=[...merges].filter(([,m])=>m.stem===b.name&&m.parent).map(([id])=>id);
    const top=Math.min(...[...mine.map(r=>r.id),...closes].map(idx));if(!Number.isFinite(top))continue;
    const anchor=forkAt(b.name);
    // Rows sit at whole positions, a merge line at +0.3 and the fork lines at +0.6 below a
    // row. A column opened by a merge line starts just under it; a column that forks off
    // a shown save stops just above its fork lines.
    const lane={stem:b.name,from:closes.includes(order[top].id)?top+0.4:top,anchor,
      to:anchor?(idx(anchor.id)===Infinity?Infinity:idx(anchor.id)-0.5):idx(mine[0]?.id)};
    for(let k=trunk?1:0;;k++)if(!lanes.some(x=>x.lane===k&&!(x.to+1<lane.from||lane.to+1<x.from))){lane.lane=k;break;}
    lanes.push(lane);laneOf.set(b.name,lane.lane);
  }
  const active=(lane,p)=>lane.from<=p&&p<=lane.to;
  // Columns on a line: main always runs; a branch where its range covers the position.
  const running=p=>new Set([...(trunk?[0]:[]),...lanes.filter(l=>active(l,p)).map(l=>l.lane)]);
  const cellsOf=(on,width=0)=>{width=Math.max(width,0,...on);return Array.from({length:width*2+1},(_,i)=>i%2?' ':on.has(i/2)?'|':' ');};
  // A straight join across columns: crossed columns show `+` (or `-` where nothing runs).
  const across=(cells,a,b,diagonal,slash)=>{
    const lo=Math.min(a,b),hi=Math.max(a,b);while(cells.length<hi*2+1)cells.push(' ');
    for(let i=lo*2+1;i<hi*2;i++)cells[i]=i%2?'-':cells[i]==='|'?'+':'-';
    cells[diagonal]=slash;return cells;
  };
  // Fork lines: every column that forks off the next row walks one column per line
  // toward its parent column, the way git draws `|/ /` then `|/`; a column with
  // another running column in the way joins straight across it instead.
  const forkLines=(ending,p)=>{
    const out=[],fixed=running(p);
    let moving=ending.map(l=>({col:l.lane,to:laneOf.get(l.anchor.stem)??0}));
    for(let guard=0;moving.length&&guard<64;guard++){
      const cells=cellsOf(fixed,Math.max(...moving.map(m=>Math.max(m.col,m.to)))),next=[];
      const order=[...moving.filter(m=>m.col>m.to).sort((x,y)=>x.col-y.col),...moving.filter(m=>m.col<m.to).sort((x,y)=>y.col-x.col)];
      for(const m of order){
        const step=m.col>m.to?-1:1,slash=step<0?'/':'\\',at=m.col*2+step;
        if(m.col+step===m.to)cells[at]=slash;
        else if(!fixed.has(m.col+step)&&!next.some(n=>n.col===m.col+step)){cells[at]=slash;next.push({...m,col:m.col+step});}
        else across(cells,m.col,m.to,at,slash);
      }
      out.push(cells.join('').trimEnd());moving=next;
    }
    return out;
  };
  const tips=new Map();for(const r of order)if(!tips.has(r.stem))tips.set(r.stem,r.id);
  const label=r=>{
    if(tips.get(r.stem)!==r.id)return '';
    return ` (${current===r.stem?'HEAD -> ':''}${nameOf(r.stem)})`;
  };
  const time=clock(g.timezone),lines=[];
  order.forEach((r,i)=>{
    const e=detail(r),lane=laneOf.get(r.stem)??0,cells=cellsOf(running(i),lane);cells[lane*2]='*';
    // A closing entry reads the way git writes it: Merge branch 'x' (끝남, and 0.6's 멈춤),
    // Abandon branch 'x': reason (중단).
    const closed=e.branch&&ENDED.includes(e.status)?(e.status==='중단'?`Abandon branch '${nameOf(e.branch)}'${e.reason?`: ${e.reason}`:''}`:`Merge branch '${nameOf(e.branch)}'`):'';
    lines.push(`${cells.join('').trimEnd()} ${ids.get(r.id)} ${time(r.stamp)} ${closed||mapSummary(e).text}${label(r)}`);
    const m=merges.get(r.id);
    if(m?.parent&&laneOf.has(m.stem)){const to=laneOf.get(m.stem);lines.push(across(cellsOf(running(i+0.3)),lane,to,to>lane?to*2-1:to*2+1,to>lane?'\\':'/').join('').trimEnd());}
    const ending=lanes.filter(l=>l.anchor&&at.has(l.anchor.id)&&at.get(l.anchor.id)===i+1);
    if(ending.length)lines.push(...forkLines(ending,i+0.6));
  });
  return {lines,omitted:visible.length-shown.length,name:nameOf};
}
