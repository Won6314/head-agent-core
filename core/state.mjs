import { locations, recordFile, optionalRead, atomicJSON } from './storage.mjs';
export function activity(project,host,id){return JSON.parse(optionalRead(recordFile(locations(project).state,'activity',id,host))||'null');}
export function markRecovered(project,host,id){
  const file=recordFile(locations(project).state,'activity',id,host),previous=activity(project,host,id);
  atomicJSON(file,{...previous,host,conversation_id:id,recovery_seen_at:new Date().toISOString()});
}
export function userInstruction(project,{host,conversation_id,text,is_user=true}){
  if(!is_user||typeof text!=='string')return;
  const first=text.split(/\r?\n/)[0].trim();
  if(!first||/^\/[^\s/]+(?:\s|$)/.test(first)||/^\[(?:quick_task|context_run|agent-task|다른 세션 HEAD|frozen_wave|head_advisor)/i.test(first)||/^(?:<system|<task-notification|This is a message from another)/i.test(first))return;
  if(Array.from(first).length<=10)return;
  const file=recordFile(locations(project).state,'activity',conversation_id,host),previous=activity(project,host,conversation_id);
  atomicJSON(file,{...previous,host,conversation_id,current:Array.from(first).slice(0,80).join(''),instruction_at:new Date().toISOString()});
}
export function transition(project, { host, conversation_id, status, liveness }) {
  if (!['working', 'waiting', 'blocked', 'ended'].includes(status)) throw new Error('유효하지 않은 상태 전이입니다.');
  const { state } = locations(project);
  const file = recordFile(state, 'activity', conversation_id, host);
  const previous = JSON.parse(optionalRead(file) || 'null');
  atomicJSON(file, { ...previous, host, conversation_id, status, updated_at: new Date().toISOString(),
    liveness: liveness === undefined ? previous?.liveness || previous?.process || null : liveness });
}
export function report(project, { host, parent_conversation_id, id, name, status, kind = 'external' }) {
  if (!['running', 'ended'].includes(status)) throw new Error('유효하지 않은 하위작업 상태입니다.');
  const { state } = locations(project);
  recordFile(state, 'conversations', parent_conversation_id, host);
  recordFile(state, 'subtasks', id, host);
  const file = recordFile(state, 'subtasks', `${parent_conversation_id}__${id}`, host);
  const previous = JSON.parse(optionalRead(file) || 'null');
  atomicJSON(file, { host, parent_conversation_id, id, name: name || previous?.name || id, kind,
    status, updated_at: new Date().toISOString() });
}
