import { serve } from '../../core/mcp.mjs';
import { registered, callerOf, UNREGISTERED } from './register.mjs';
import { codexLive, readPresence } from './threads.mjs';
import { deliverToCodex } from './deliver.mjs';
import { liveConversations } from '../claude/process.mjs';
import { deliverToClaude, NotThere } from '../claude/deliver.mjs';
// Codex names the conversation on every tool call (_meta.threadId); its folder is what the
// start hook registered for it. With no register the call stops (PROJECT_UNKNOWN): a project
// from the environment is not evidence of this conversation's project.
// A task a conversation spawned is never registered itself: its conversation's folder is used.
const projectOf = request => registered(callerOf(request).conversation)?.cwd || null;

// send: Codex's own send_message_to_thread reaches Codex conversations only, and it cannot be
// turned off from a plugin; this one reaches the project's Claude Code conversations too. Its
// arguments are shaped like Codex's own (threadId, prompt). The answer comes back as a message
// to this conversation (codex:<its id>), as a Claude conversation's does.
const send = {
  definition: { name: 'send', description: '다른 대화에 메시지를 보냅니다. Claude Code 대화와 Codex 대화 모두로 갑니다. threadId에는 대화 목록(conversations)의 보낼 곳(claude:<ID> 또는 codex:<ID>)을 그대로 줍니다. 받는 대화가 쉬고 있으면 깨어나서 읽습니다(창 안에서 엔진이 도는 Codex 대화와 데스크톱 앱 대화는 다음 입력 때 받습니다). 받는 대화의 답은 이 대화(codex:<이 대화 ID>)로 따로 옵니다. 결과의 delivery는 started(바로 깨움), queued(다음 입력 때 받음), sent(Claude 대화로 보냄. 받았다는 확인은 오지 않음)입니다.',
    inputSchema: { type: 'object', properties: { threadId: { type: 'string', description: '받는 대화. 대화 목록의 보낼 곳 그대로.' }, prompt: { type: 'string', description: '보낼 말' } }, required: ['threadId', 'prompt'], additionalProperties: false } },
  async call({ project, args, conversation_id }) {
    const { threadId, prompt } = args;
    if (typeof threadId !== 'string' || typeof prompt !== 'string' || !threadId.trim()) throw new Error('threadId와 prompt가 필요합니다.');
    if (!prompt.trim()) throw new Error('prompt가 비어 있습니다.');
    if (!conversation_id) throw new Error('어느 대화가 보내는지 알 수 없습니다. Codex 창을 새로 열어 주세요.');
    const from = `codex:${conversation_id}`, fromName = readPresence(project, conversation_id)?.title;
    const target = threadId.trim();
    if (target.startsWith('claude:') || target.startsWith('uds:')) {
      try { await deliverToClaude(target, prompt, { from, fromName }); }
      catch (error) { throw error instanceof NotThere ? new Error(`받는 Claude 대화가 지금 실행 중이 아닙니다: ${target}`) : error; }
      return JSON.stringify({ threadId: target, delivery: 'sent' });
    }
    const id = target.startsWith('codex:') ? target.slice(6) : target;
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`보낼 곳을 알 수 없습니다: ${target}. 대화 목록(conversations)의 보낼 곳을 그대로 주세요.`);
    if (id === conversation_id) throw new Error('이 대화 자신에게는 보낼 수 없습니다.');
    const how = await deliverToCodex(project, id, prompt, { from, fromName });
    return JSON.stringify({ threadId: `codex:${id}`, delivery: how });
  },
};
// The list of other conversations holds this project's Claude Code conversations beside its own.
await serve({ projectOf, unknownProject: UNREGISTERED, host: 'codex', conversationOf: request => callerOf(request).conversation || request.params?.arguments?.conversation_id, agentOf: request => callerOf(request).agent,
  options: dir => ({ live: known => codexLive(dir, known), peers: [{ host: 'claude', live: known => liveConversations(dir, known) }] }), tools: [send] });
