export {
  aliveConversation,
  ownerOf,
  currentConversation,
  hostInfo,
  liveConversations,
} from '../hosts/claude/process.mjs';
import { report as commonReport } from '../core/state.mjs';
export function report(project, { parent, id, name, phase, kind, child }) {
  return commonReport(project, {
    host: 'claude',
    parent_conversation_id: parent,
    id,
    name,
    kind,
    child_conversation_id: child,
    status: phase === 'start' ? 'running' : phase === 'end' ? 'ended' : phase,
  });
}
