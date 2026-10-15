import { serve } from '../../core/mcp.mjs';
// V1 tool.execute.before injects this ID. Never assume the V2 _meta contract.
await serve({ project: process.argv[2], host: 'opencode', conversationOf: request => request.params?.arguments?.conversation_id });
