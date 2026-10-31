import fs from 'node:fs';
import path from 'node:path';
import {locations,records,optionalRead,readState,atomicText,atomicJSON,locked} from './storage.mjs';
import {withGraph} from './graph.mjs';
import {branchPath,branchHeader} from './branch-format.mjs';
import {isOpen} from './lifecycle.mjs';
// One-time move of a 0.6 project to 0.7. Nothing is deleted: what 0.7 no longer reads is
// moved under .head/state/_0.6/ so it can be put back.
//   state     — activity/ (working·waiting·ended, the instruction line) and pending-load/
//               (channel requests). subtasks/ stays: tools outside the core still write it.
//   branches  — an automatic 0.6 branch (branch-<time>-<hex>) that is open, saved nothing
//               and that no other branch was opened from: 0.6 opened one per conversation.
//               A conversation still pointing at it goes back to main.
//   labels    — a branch label that repeats " (fork)" (the desktop app adds one per copy)
//               keeps one.
// Dry run unless apply is true; running it again finds nothing more to do.
const AUTO=/^branch-\d{8}T\d{6}-[0-9a-f]+$/,FORKS=/(?: \(fork\)){2,}/g;
export function migrate(project,{apply=false}={}){
  const {state,topics}=locations(project),archive=path.join(state,'_0.6'),report={state:[],branches:[],labels:[],skipped:[],connections:0};
  for(const kind of ['activity','pending-load']){
    const dir=path.join(state,kind);if(!fs.existsSync(dir))continue;
    const count=fs.readdirSync(dir).length;report.state.push({kind,count});
    if(apply){fs.mkdirSync(archive,{recursive:true});const to=path.join(archive,kind);if(fs.existsSync(to))fs.rmSync(to,{recursive:true,force:true});fs.renameSync(dir,to);}
  }
  const found=withGraph(project,g=>{
    const empty=[],labels=[];
    for(const session of g.names()){
      const branches=g.branches(session);
      for(const b of branches){
        if(AUTO.test(b.name)&&isOpen(b.status)&&!g.own(session,b.name).length){
          if(branches.some(x=>x.parent===b.name))continue;
          const folder=path.join(topics,session,'work',b.name),others=fs.readdirSync(folder).filter(f=>f!=='history.md');
          if(others.length){report.skipped.push({session,branch:b.name,why:`다른 파일 ${others.length}개`});continue;}
          empty.push({session,branch:b.name,label:b.label,folder});
        } else if(FORKS.test(b.label||'')){FORKS.lastIndex=0;labels.push({session,branch:b.name,label:b.label,next:b.label.replace(FORKS,' (fork)')});}
      }
    }
    return {empty,labels};
  });
  report.branches=found.empty.map(({session,branch,label})=>({session,branch,label}));
  report.labels=found.labels.map(({session,branch,label,next})=>({session,branch,from:label,to:next}));
  const gone=new Set(found.empty.map(e=>`${e.session}/${e.branch}`));
  const conns=records(path.join(state,'conversations')).filter(c=>c.session&&c.branch&&gone.has(`${c.session}/${c.branch}`));
  report.connections=conns.length;
  if(apply){
    for(const e of found.empty){const to=path.join(archive,'branches',e.session,e.branch);fs.mkdirSync(path.dirname(to),{recursive:true});if(fs.existsSync(to))fs.rmSync(to,{recursive:true,force:true});fs.renameSync(e.folder,to);}
    for(const l of found.labels){const file=branchPath(path.join(topics,l.session),l.branch);locked(file,()=>{const text=optionalRead(file);if(branchHeader(text))atomicText(file,text.replace(/^(이름표|주제): .*$/m,m=>m.replace(FORKS,' (fork)')));});}
    for(const c of conns){const file=path.join(state,'conversations',`${c.host}-${c.conversation_id}.json`);const raw=readState(file);atomicJSON(file,{...raw,branch:null});}
    withGraph(project,g=>g.names());
  }
  return report;
}
export function describe(report,{apply=false}={}){
  const lines=[apply?'# 0.6 → 0.7 맞추기 (적용함)':'# 0.6 → 0.7 맞추기 (미리 보기 — --apply로 적용)'];
  lines.push('','## 옛 상태 파일 → .head/state/_0.6/',...(report.state.length?report.state.map(s=>`- ${s.kind}/ ${s.count}개`):['- 없음']),'- subtasks/는 그대로 둡니다(코어 밖 도구가 아직 씁니다).');
  lines.push('',`## 저장 없는 0.6 자동 브랜치 → .head/state/_0.6/branches/ (${report.branches.length}개)`,...report.branches.map(b=>`- ${b.session} / ${b.branch} · ${b.label||''}`));
  if(report.skipped.length)lines.push('','## 건너뜀',...report.skipped.map(s=>`- ${s.session} / ${s.branch} · ${s.why}`));
  lines.push('',`## 이 브랜치를 가리키던 대화 → 메인 (${report.connections}개)`);
  lines.push('',`## "(fork)" 반복 이름표 → 하나로 (${report.labels.length}개)`,...report.labels.map(l=>`- ${l.session} / ${l.branch} · ${l.from} → ${l.to}`));
  return lines.join('\n');
}
