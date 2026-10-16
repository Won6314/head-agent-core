// Branch lifetime. The branch file holds what happened; its state is computed from
// three things only: whether a conversation that is attached to it is still alive,
// whether the last save left a next, and how long ago that was.
//
//   진행 중 | an attached conversation is alive
//   남은 일 | nobody attached + last save has a next + within the standby window
//   내려감 | nobody attached + last save has a next + older than the window
//   끝남   | nobody attached + last save has no next
//
// Neither the user nor the model sets these. 중단 is the one exception: an explicit
// abandon is a decision, so it is kept in the file and reported as it stands.
export const LIVE='진행 중',TODO='남은 일',STANDBY='내려감',DONE='끝남',ABANDONED='중단';
export const OPEN='열림',PAUSED='멈춤',CLOSED='끝남';
export const STANDBY_DAYS=14;
const DAY=86400000;
export function lifecycleOf({status,entries=[],alive=false,now=Date.now(),standbyDays=STANDBY_DAYS}){
  if(alive)return LIVE;
  if(status===ABANDONED)return ABANDONED;
  const last=entries.at(-1);
  if(!last?.next)return DONE;
  const at=Date.parse(last.timestamp);
  return Number.isFinite(at)&&now-at>standbyDays*DAY?STANDBY:TODO;
}
// The recap is written on every next-less save, so the saves after the last next-less
// one are exactly the ones the recap does not cover yet.
export const sinceRecap=entries=>entries.slice(entries.findLastIndex(e=>!e.next)+1);
// The one entry a closing branch leaves on the main line. The tool writes the marker
// lines (상태/브랜치/기록) that the graph turns into a merge edge and the map shows as M.
export function mergeArgs({branch,label,recap,entries}){
  const last=entries.at(-1),record=`work/${branch}/history.md`;
  const summary=label||last?.summary||branch;
  if(!last)return {summary,history:'저장 없이 닫혔습니다.',status:CLOSED,branch,record};
  if(!last.next)return {summary,history:recap||last.summary,status:CLOSED,branch,record};
  const after=sinceRecap(entries).map(e=>`- ${e.summary}`);
  const history=[recap,after.length?['이어서 한 일:',...after].join('\n'):'',`마지막 다음: ${last.next}`].filter(Boolean).join('\n\n');
  return {summary,history,status:PAUSED,branch,record};
}
