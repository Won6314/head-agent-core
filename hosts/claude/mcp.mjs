import { serve } from '../../core/mcp.mjs';
import { sessions } from '../../core/sessions.mjs';
import { loadChannel } from './channel.mjs';
const project = process.env.CLAUDE_PROJECT_DIR;
await serve({ project, host: 'claude', conversationOf: request => request.params?.arguments?.conversation_id,
  channel: loadChannel(project, sessions(project, { host: 'claude' })) });
