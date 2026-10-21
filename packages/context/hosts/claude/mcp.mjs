import { serve } from '../../core/mcp.mjs';
import { hostInfo, liveConversations, registryOf } from './process.mjs';
import { isCopy } from '../../core/instruction.mjs';
const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const options = { hostInfo, live: known => liveConversations(project, known) };
// A conversation run by claude -p (a fork or worker) reads records but does not write them.
const readOnly = () => isCopy(process.env.CLAUDE_CODE_ENTRYPOINT || registryOf(process.ppid)?.entrypoint);
await serve({ project, host: 'claude', options, readOnly, conversationOf: request => request.params?.arguments?.conversation_id });
