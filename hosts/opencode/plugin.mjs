import { sessions } from '../../core/sessions.mjs';
import { transition, report, userInstruction, activity } from '../../core/state.mjs';
import { processEvidence } from '../../core/liveness.mjs';
import { instructions } from '../../core/mcp.mjs';

// OpenCode V1 1.19.0 server hooks. No SDK/npm import and no background monitor.
export default { id: 'head-context', server: async ({ directory, client }) => {
  const store = sessions(directory, { host: 'opencode' });
  const parents = new Map(), names = new Map(), roots = new Set(), blocked = new Map();
  const nativeChild=id=>Boolean(parents.get(id)&&!store.connection(id));
  // A standalone V1 TUI/run owns its in-process backend. A detached/attached server
  // has no reliable client-close signal: do NOT call that session alive.
  const args = process.argv.slice(2);
  const standalone = !args.some(arg => ['serve', 'attach', 'web', 'acp'].includes(arg) || arg === '--attach' || arg.startsWith('--attach='));
  const liveness = standalone ? processEvidence() : null;
  let queue = Promise.resolve();
  const safe = fn => {
    const next = queue.then(fn);
    queue = next.catch(error => console.error(`head-context: ${error.message}`));
    return queue;
  };
  const info = async id => {
    if (parents.has(id)) return;
    const response = await client.session.get({ path: { id } });
    if (!response.data) throw new Error(`OpenCode 대화 ${id} 정보를 읽지 못했습니다.`);
    parents.set(id, response.data.parentID || null);
    names.set(id, response.data.title || id);
  };
  const rootOf = async id => {
    await info(id);
    let root = id;
    for (let depth = 0; nativeChild(root) && depth < 20; depth++) { root = parents.get(root); await info(root); }
    return root;
  };
  const write = (id, status) => {
    roots.add(id);
    transition(directory, { host: 'opencode', conversation_id: id, status, liveness });
  };
  // OpenCode rebuilds the system prompt on every request and has no hook cap, so the
  // session identity (the same text session_load returns) is pushed on every request.
  const start = async id => {
    await info(id);
    if (nativeChild(id)) return '';
    roots.add(id);
    const previous=activity(directory,'opencode',id),seen=previous?.recovery_seen_at||previous?.updated_at;
    store.start({conversation_id:id,session_name:process.env.HEAD_CONTEXT_SESSION,
      origins:parents.get(id)?[{conversation_id:parents.get(id),kind:'fork'}]:[],
      source:seen?'resume':'startup',title:names.get(id)});
    return store.identity({conversation_id:id});
  };
  const child = (id, status) => report(directory, { host: 'opencode', parent_conversation_id: parents.get(id), id,
    name: names.get(id), kind: 'native', status });
  const handleEvent = async event => {
    if (!['session.created', 'session.updated', 'session.compacted', 'session.status', 'session.idle', 'session.deleted', 'permission.asked', 'permission.replied', 'question.asked', 'question.replied', 'question.rejected'].includes(event.type)) return;
    const p = event.properties || {};
    const id = p.sessionID || p.info?.id;
    if (!id || !id.startsWith('ses_')) return;
    if (p.info) { parents.set(id, p.info.parentID || null); names.set(id, p.info.title || id); }
    if (event.type === 'session.created') {
      if (!nativeChild(id)) { await start(id); write(id, 'waiting'); }
      return; // Child creation is not yet child execution.
    }
    if (!['session.status', 'session.idle', 'session.deleted', 'permission.asked', 'permission.replied', 'question.asked', 'question.replied', 'question.rejected'].includes(event.type)) return;
    await info(id);
    const root = await rootOf(id);
    const key = `${id}:${p.id || p.requestID || event.type.split('.')[0]}`;
    if (event.type === 'permission.asked' || event.type === 'question.asked') {
      blocked.set(key, root); write(root, 'blocked'); return;
    }
    if (event.type === 'permission.replied' || event.type === 'question.replied' || event.type === 'question.rejected') {
      blocked.delete(key);
      write(root, [...blocked.values()].includes(root) ? 'blocked' : 'working'); return;
    }
    const status = event.type === 'session.deleted' ? 'ended' : event.type === 'session.idle' || p.status?.type === 'idle' ? 'waiting'
      : ['busy', 'retry'].includes(p.status?.type) ? 'working' : null;
    if (!status) return;
    if (nativeChild(id)) { child(id, status === 'working' ? 'running' : 'ended'); return; }
    if (status === 'waiting' || status === 'ended') for (const pending of blocked.keys()) if (pending.startsWith(`${id}:`)) blocked.delete(pending);
    write(id, status !== 'ended' && [...blocked.values()].includes(id) ? 'blocked' : status);
  };
  return {
    event: ({ event }) => safe(() => handleEvent(event)),
    'chat.message': (input,output) => safe(async () => {
      await info(input.sessionID);
      if (nativeChild(input.sessionID)) { names.set(input.sessionID, input.agent || names.get(input.sessionID)); return; }
      await start(input.sessionID); write(input.sessionID, 'working');
      userInstruction(directory,{host:'opencode',conversation_id:input.sessionID,
        text:(output?.parts||[]).filter(p=>p.type==='text'&&!p.synthetic&&!p.ignored).map(p=>p.text).join('\n'),
        is_user:(!output?.message?.role||output.message.role==='user')&&!input.is_meta&&!input.is_system&&!input.synthetic});
    }),
    'experimental.chat.system.transform': (input, output) => safe(async () => {
      if (!input.sessionID?.startsWith('ses_')) return;
      const context = await start(input.sessionID);
      output.system.push(instructions);
      if (context) output.system.push(context);
    }),
    'tool.execute.before': (input, output) => safe(async () => {
      if (/^head_context_session_(list|load|create|save|finish|branch|read)$/.test(input.tool)) output.args.conversation_id = input.sessionID;
    }),
    dispose: () => safe(async () => { for (const id of roots) write(id, 'ended'); })
  };
} };
