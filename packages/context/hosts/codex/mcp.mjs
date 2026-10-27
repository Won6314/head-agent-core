import { serve } from '../../core/mcp.mjs';
import { registered, threadOf } from './register.mjs';
// Codex names the conversation on every tool call (_meta.threadId); its folder is what the
// start hook registered for it. A project set in the server's environment is the fallback.
const projectOf = request => registered(threadOf(request))?.cwd || process.env.CLAUDE_PROJECT_DIR || null;
await serve({ projectOf, host: 'codex', conversationOf: request => threadOf(request) || request.params?.arguments?.conversation_id });
