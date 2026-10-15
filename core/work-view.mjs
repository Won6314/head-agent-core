// Host-neutral conversation attention and liveness. No work-label inference.
export const statusLabels={waiting:'나를 기다림',running:'돌아가는 중',stopped:'멈춤'};
export function statusOf(conversations,children,isAlive){
  const ranks={stopped:0,running:1,waiting:2};let result='stopped';
  for(const c of conversations){
    if(!isAlive(c)||c.status==='ended')continue;
    const child=children.some(s=>s.host===c.host&&s.parent_conversation_id===c.conversation_id&&s.status==='running');
    const candidate=c.status==='blocked'?'waiting':c.status==='working'||child?'running':c.status==='waiting'?'waiting':'stopped';
    if(ranks[candidate]>ranks[result])result=candidate;
  }return result;
}
// Preserve the old named import used by pre-existing attention tests only.
export const workStatus=statusOf;
export function conversationView(bound,activities,children,isAlive){
  const a=activities.find(a=>a.host===bound.host&&a.conversation_id===bound.conversation_id);
  const raw={...bound,...a},alive=raw.status!=='ended'&&isAlive(raw);
  const subtasks=children.filter(t=>t.host===bound.host&&t.parent_conversation_id===bound.conversation_id).map(t=>({...t,active:alive&&t.status==='running'}));
  return {host:bound.host,conversation_id:bound.conversation_id,alive,status:statusOf([raw],subtasks,()=>alive),
    host_status:raw.status||'unknown',current:raw.current||null,subtasks,running_subtasks:subtasks.filter(t=>t.active).length};
}
export function groupStatus(cs){
  const ranks={stopped:0,running:1,waiting:2};let status='stopped';
  for(const c of cs)if(c.alive&&ranks[c.status]>ranks[status])status=c.status;
  return status;
}
