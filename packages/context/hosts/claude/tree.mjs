// The live conversations of a project as data, for tools outside the core (a board, a
// phone view): the same tree session_conversations draws, read on the spot from what
// Claude Code writes down. Nothing is stored. See README "현황 데이터".
import { sessions, doing } from '../../core/sessions.mjs';
import { hostInfo, liveConversations } from './process.mjs';
export { doing };
export function claudeTree(project, { name } = {}) {
  return sessions(project, { host: 'claude', hostInfo, live: known => liveConversations(project, known) }).tree({ name });
}
