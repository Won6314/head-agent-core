import { serve } from '../../core/mcp.mjs';
import { registered, callerOf } from './register.mjs';
import { antigravityLive } from './threads.mjs';
import { antigravityPeer } from './peer.mjs';

export function serveAntigravity({ peers = [] } = {}) {
  return serve({
    host: 'antigravity',
    projectOf: (request) => registered(callerOf(request).conversation)?.cwd || null,
    conversationOf: (request) => callerOf(request).conversation,
    agentOf: (request) => callerOf(request).agent,
    options: (dir) => ({
      live: (known) => antigravityLive(dir, known),
      peers: peers.map((p) => ({ host: p.host, live: (known) => p.live(dir, known) })),
    }),
    tools: [
      {
        definition: {
          name: 'send',
          description:
            '다른 대화에 보냅니다. threadId는 conversations의 보낼 곳 그대로. Antigravity의 delivery는 started(살아 있는 ACP 대화를 바로 깨움; 일하는 중이면 다음 단계에서 받음), queued(다음 입력 때 받음; TUI·데스크톱 앱·깨우기 실패 포함)입니다. started는 처리가 끝났다는 확인이 아닙니다.',
          inputSchema: {
            type: 'object',
            properties: { threadId: { type: 'string' }, prompt: { type: 'string' } },
            required: ['threadId', 'prompt'],
            additionalProperties: false,
          },
        },
        async call({ project, args, conversation_id }) {
          const { threadId, prompt } = args;
          if (typeof threadId !== 'string' || typeof prompt !== 'string' || !prompt.trim())
            throw new Error('threadId와 비어 있지 않은 prompt가 필요합니다.');
          const target = threadId.trim();
          if (target === `antigravity:${conversation_id}`) throw new Error('이 대화 자신에게는 보낼 수 없습니다.');
          const peer = [antigravityPeer, ...peers].find((p) => p.accepts?.(target));
          if (!peer) throw new Error(`보낼 곳을 알 수 없습니다: ${target}`);
          return JSON.stringify({
            threadId: target,
            delivery: await peer.send(target, prompt, { project, from: `antigravity:${conversation_id}` }),
          });
        },
      },
    ],
  });
}
