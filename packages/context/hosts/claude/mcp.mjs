import { serve } from '../../core/mcp.mjs';
import { hostInfo, liveConversations, registryOf } from './process.mjs';
import { isCopy } from '../../core/instruction.mjs';
import { codexLive } from '../codex/threads.mjs';
const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// The list of other conversations holds this project's Codex conversations beside its own.
const options = { hostInfo, live: known => liveConversations(project, known), peers: [{ host: 'codex', live: known => codexLive(project, known) }] };
// A conversation run by claude -p (a fork or worker) reads records but does not write them,
// unless its starter marked it a person's (HEAD_CONTEXT_PERSON=1: a headless conversation a
// person talks to through another app).
export const person = (env = process.env) => env.HEAD_CONTEXT_PERSON === '1';
const readOnly = () => !person() && isCopy(process.env.CLAUDE_CODE_ENTRYPOINT || registryOf(process.ppid)?.entrypoint);
await serve({ project, host: 'claude', options, readOnly, conversationOf: request => request.params?.arguments?.conversation_id });
