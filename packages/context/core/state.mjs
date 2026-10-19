import { locations, recordFile, optionalRead, atomicJSON } from './storage.mjs';
// The core keeps no conversation state (working, waiting, ended) any more. This one
// writer stays for adapters outside the core that still report their own subtasks.
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
