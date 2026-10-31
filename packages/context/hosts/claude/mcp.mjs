import { serve } from '../../core/mcp.mjs';
import { hostInfo, liveConversations, registryOf } from './process.mjs';
import { isCopy } from '../../core/instruction.mjs';
// A conversation run by claude -p (a fork or worker) reads records but does not write them,
// unless its starter marked it a person's (HEAD_CONTEXT_PERSON=1: a headless conversation a
// person talks to through another app).
const person = (env = process.env) => env.HEAD_CONTEXT_PERSON === '1';
// The Claude Code tool server. peers: the other apps whose conversations the list holds beside
// this project's own ({ host, live(project, known) }); the entry (scripts/mcp.mjs) gives them.
export function serveClaude({ peers = [] } = {}) {
  const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const options = {
    hostInfo,
    live: (known) => liveConversations(project, known),
    peers: peers.map((p) => ({ host: p.host, live: (known) => p.live(project, known) })),
  };
  const readOnly = () =>
    !person() && isCopy(process.env.CLAUDE_CODE_ENTRYPOINT || registryOf(process.ppid)?.entrypoint);
  return serve({
    project,
    host: 'claude',
    options,
    readOnly,
    conversationOf: (request) => request.params?.arguments?.conversation_id,
  });
}
