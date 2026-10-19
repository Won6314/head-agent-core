export { aliveConversation, ownerOf, currentConversation, hostInfo, liveConversations } from '../hosts/claude/process.mjs';
import { report as commonReport } from '../core/state.mjs';
export function report(project, { parent, id, name, phase, kind }) {
  return commonReport(project, { host: 'claude', parent_conversation_id: parent, id, name, kind, status: phase === 'start' ? 'running' : phase === 'end' ? 'ended' : phase });
}
