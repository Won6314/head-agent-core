import { liveConversations } from './process.mjs';
import { deliverToClaude, NotThereError } from './deliver.mjs';
// Claude Code as another app sees it: its live conversations of a project, and a message to
// one of them (claude:<conversation id>, or the uds:<socket> address). A send answers 'sent':
// Claude Code gives no receipt.
export const claudePeer = {
  host: 'claude',
  live: liveConversations,
  accepts: (target) => target.startsWith('claude:') || target.startsWith('uds:'),
  async send(target, text, { from, fromName }) {
    try {
      await deliverToClaude(target, text, { from, fromName });
    } catch (error) {
      throw error instanceof NotThereError ? new Error(`받는 Claude 대화가 지금 실행 중이 아닙니다: ${target}`) : error;
    }
    return 'sent';
  },
};
