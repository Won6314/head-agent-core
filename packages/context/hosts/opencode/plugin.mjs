import { sessions } from '../../core/sessions.mjs';
import { INSTRUCTIONS } from '../../core/mcp.mjs';

// OpenCode V1 server hooks, kept to the core: the work context is pushed with the
// instructions on every request, and the head-context tools get the conversation id.
// A native child session (OpenCode's subagent) gets agent_id too, so it may read but
// not write. Conversation state is not recorded. The OpenCode host is not yet aligned
// with the Claude desktop baseline beyond this.
export default { id: 'head-context', server: async ({ directory, client }) => {
  const store = sessions(directory, { host: 'opencode' });
  const parents = new Map(), titles = new Map(), started = new Set();
  let queue = Promise.resolve();
  const safe = fn => { const next = queue.then(fn); queue = next.catch(error => console.error(`head-context: ${error.message}`)); return queue; };
  const info = async id => {
    if (parents.has(id)) return;
    const response = await client.session.get({ path: { id } });
    if (!response.data) throw new Error(`OpenCode 대화 ${id} 정보를 읽지 못했습니다.`);
    parents.set(id, response.data.parentID || null);
    titles.set(id, response.data.title || id);
  };
  const child = id => Boolean(parents.get(id) && !store.connection(id));
  const start = async id => {
    await info(id);
    if (child(id)) return '';
    const source = started.has(id) || store.connection(id) ? 'resume' : 'startup';
    started.add(id);
    store.start({ conversation_id: id, session_name: process.env.HEAD_CONTEXT_SESSION,
      origins: parents.get(id) ? [{ conversation_id: parents.get(id), kind: 'copy' }] : [], source, info: { title: titles.get(id) } });
    return store.identity({ conversation_id: id });
  };
  return {
    event: ({ event }) => safe(async () => {
      const p = event.properties || {}, id = p.sessionID || p.info?.id;
      if (!id || !id.startsWith('ses_') || !p.info) return;
      parents.set(id, p.info.parentID || null); titles.set(id, p.info.title || id);
    }),
    'experimental.chat.system.transform': (input, output) => safe(async () => {
      if (!input.sessionID?.startsWith('ses_')) return;
      const context = await start(input.sessionID);
      output.system.push(INSTRUCTIONS);
      if (context) output.system.push(context);
    }),
    'tool.execute.before': (input, output) => safe(async () => {
      if (!/^head_context_/.test(input.tool)) return;
      await info(input.sessionID);
      delete output.args.agent_id;
      if (child(input.sessionID)) { let root = input.sessionID; for (let d = 0; child(root) && d < 20; d++) { root = parents.get(root); await info(root); } output.args.conversation_id = root; output.args.agent_id = input.sessionID; }
      else output.args.conversation_id = input.sessionID;
    })
  };
} };
