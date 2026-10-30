import { withEngine } from './engine.mjs';
import { pathOk } from './mode.mjs';
import { readPresence, queue } from './threads.mjs';

// A message to a Codex conversation of this project, from another conversation (a Claude
// conversation's SendMessage, or a Codex conversation's send tool). On the shared engine its
// turn starts now, in the frame Codex's own send_message_to_thread uses: the window shows
// "Sent by Codex from task <from>" and the model reads it as a delegated input. Anywhere else
// (a window with its engine inside, the desktop app) it waits in the conversation's inbox and
// is given at its next prompt. Returns how it went: 'started' or 'queued'.
export async function deliverToCodex(project, threadId, text, { from, fromName } = {}) {
  const presence = readPresence(project, threadId);
  if (!presence) throw new Error(`이 프로젝트에서 연 Codex 대화가 아닙니다: codex:${threadId}`);
  if (presence.mode === 'shared' && pathOk(presence.socket)) {
    await withEngine(presence.socket, engine => sendToThread(engine, { source: from, threadId, prompt: text }));
    return 'started';
  }
  queue(project, threadId, { from, from_name: fromName, text });
  return 'queued';
}

// What Codex 0.164's send_message_to_thread does after its checks (tui/src/dynamic_tools.rs):
// resume the thread and start a background turn whose input is a delegation from `source`.
const escape = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const delegatedPrompt = (source, prompt) => `<codex_delegation>\n  <source_thread_id>${escape(source)}</source_thread_id>\n  <input>${escape(prompt)}</input>\n</codex_delegation>`;
const historyUnsupported = error => error?.code === -32601 || ((error?.code === -32600 || error?.code === -32602) && /history|exclude_?turns|excludeTurns|paginat|turns\/list|items\/list/i.test(error?.raw?.message || ''));
export async function sendToThread(engine, { source, threadId, prompt }) {
  if (!String(prompt).trim()) throw new Error('prompt must not be empty');
  const thread = (await engine.request('thread/read', { threadId, includeTurns: false })).thread;
  const excludeTurns = thread.historyMode === 'paginated';
  let resumed;
  try { resumed = await engine.request('thread/resume', { threadId, excludeTurns }); }
  catch (error) { if (!(excludeTurns && historyUnsupported(error))) throw error; resumed = await engine.request('thread/resume', { threadId, excludeTurns: false }); }
  const program = await accessProgram(engine, threadId, resumed.model, resumed.modelProvider, Boolean(thread.daybreakEnabled));
  await engine.request('turn/start', { threadId, input: [], toolOutput: { retain: false, name: 'send_message_to_thread', namespace: 'codex_tui', output: delegatedPrompt(source, prompt) },
    ...(program !== null ? { cyberAccessProgram: program } : {}) });
  return { threadId };
}
// Codex 0.164 picks an access program for a background turn (its Daybreak setting, on by
// default), reading the account and the model list the way the window does.
async function accessProgram(engine, threadId, model, provider, enabled) {
  const [account, models] = await Promise.allSettled([engine.request('account/read', { refreshToken: false }), engine.request('model/list', { includeHidden: true })]);
  let acct = null;
  if (account.status === 'fulfilled') acct = account.value.account;
  else if (enabled && provider === 'openai') throw new Error(`Could not determine Daybreak account eligibility: ${account.reason.message}`);
  const eligible = provider === 'openai' && (acct?.type === 'chatgpt' || acct?.type === 'apiKey');
  if (eligible && acct.type === 'apiKey') {
    const features = await engine.request('experimentalFeature/list', { threadId }).then(r => r.data || [], () => null);
    if (!features?.some(f => f.name === 'api_key_cyber_access_programs' && f.enabled)) return null;
  }
  if (!eligible) return null;
  const list = models.status === 'fulfilled' ? models.value.data || [] : [];
  const programs = list.find(m => m.model === model)?.availableAccessPrograms;
  if (!programs || !programs.cyber?.length) return null;
  const daybreak = ['daybreakBlue', 'daybreakRed'].find(p => programs.cyber.includes(p)) ?? null;
  if (enabled) { if (daybreak) return daybreak; throw new Error(`Daybreak support for model ${model} could not be confirmed by the connected server.`); }
  return programs.cyber.includes('standard') ? 'standard' : null;
}
