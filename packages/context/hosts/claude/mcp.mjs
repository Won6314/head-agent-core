import { serve } from '../../core/mcp.mjs';
import { sessions } from '../../core/sessions.mjs';
import { loadChannel } from './channel.mjs';
import { hostInfo, liveConversations } from './process.mjs';
const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const options = { hostInfo, live: known => liveConversations(project, known) };
await serve({ project, host: 'claude', options, conversationOf: request => request.params?.arguments?.conversation_id,
  channel: loadChannel(project, sessions(project, { host: 'claude', ...options })) });
