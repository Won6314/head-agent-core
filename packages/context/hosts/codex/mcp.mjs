import { serve } from '../../core/mcp.mjs';
import { registered, threadOf } from './register.mjs';
// Codex names the conversation on every tool call (_meta.threadId); its folder is what the
// start hook registered for it. With no register the call stops (PROJECT_UNKNOWN): a project
// from the environment is not evidence of this conversation's project.
const projectOf = request => registered(threadOf(request))?.cwd || null;
await serve({ projectOf, host: 'codex', conversationOf: request => threadOf(request) || request.params?.arguments?.conversation_id });
