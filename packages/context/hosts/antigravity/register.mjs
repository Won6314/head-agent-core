import path from 'node:path';
import { atomicJSON, readLoose } from '../../core/storage.mjs';

// agy gives both the hook and the MCP server PLUGIN_DATA. The MCP process cwd is
// the plugin directory, never evidence of the caller's project.
const fileOf = (id) => {
  if (!process.env.PLUGIN_DATA) throw new Error('Antigravity PLUGIN_DATA가 없습니다.');
  if (!/^[A-Za-z0-9_-]+$/.test(id || '')) throw new Error('대화 ID가 유효하지 않습니다.');
  return path.join(process.env.PLUGIN_DATA, 'conversations', `${id}.json`);
};
export const registered = (id) => (id ? readLoose(fileOf(id)) : null);
export function register(id, value) {
  if (!path.isAbsolute(value.cwd || '')) throw new Error('절대 작업 폴더가 필요합니다.');
  atomicJSON(fileOf(id), value);
}
export function callerOf(request) {
  const meta = request?.params?._meta || {};
  const id = meta['antigravity.google/conversation_id'];
  const root = meta['antigravity.google/root_conversation_id'];
  return id && root && id !== root ? { conversation: root, agent: id } : { conversation: id, agent: null };
}
