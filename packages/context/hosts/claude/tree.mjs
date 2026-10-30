// The live conversations of a project as data, for tools outside the core (a board, a
// phone view): the same tree conversations draws, Claude Code and Codex together, read on
// the spot from what the two apps write down. Nothing is stored. See README "현황 데이터".
import { sessions, doing } from '../../core/sessions.mjs';
import { hostInfo, liveConversations } from './process.mjs';
import { codexLive } from '../codex/threads.mjs';
export { doing };
export function claudeTree(project, { name } = {}) {
  return sessions(project, { host: 'claude', hostInfo, live: known => liveConversations(project, known), peers: [{ host: 'codex', live: known => codexLive(project, known) }] }).tree({ name });
}
