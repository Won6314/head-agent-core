import { locations, recordFile, readState, atomicJSON } from './storage.mjs';
// The core keeps no conversation state (working, waiting, ended) any more. This one
// writer stays for adapters outside the core that still report their own subtasks.
// child_conversation_id (optional): the conversation the subtask runs as, when it is one
// (a fork or worker started as its own conversation); a board joins the two with it.
export function report(project, { host, parent_conversation_id, id, name, status, kind, child_conversation_id }) {
  if (!['running', 'ended'].includes(status)) throw new Error('유효하지 않은 하위작업 상태입니다.');
  const { state } = locations(project);
  recordFile(state, 'conversations', parent_conversation_id, host);
  recordFile(state, 'subtasks', id, host);
  const file = recordFile(state, 'subtasks', `${parent_conversation_id}__${id}`, host);
  const previous = readState(file, null);
  const child = typeof child_conversation_id === 'string' && child_conversation_id ? child_conversation_id : previous?.child_conversation_id;
  atomicJSON(file, { host, parent_conversation_id, id, name: name || previous?.name || id, kind: kind || previous?.kind || 'external',
    ...(child ? { child_conversation_id: child } : {}), status, updated_at: new Date().toISOString() });
}
