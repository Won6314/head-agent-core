import { spawn } from 'node:child_process';
import { isMac, socketThere } from '../../core/platform.mjs';
import { withEngine } from './engine.mjs';
import { readPresence, engineFrom, queue } from './threads.mjs';

// A message to a Codex conversation of this project, from another conversation (a Claude
// conversation's SendMessage, or a Codex conversation's send tool). On the shared engine its
// turn starts now, in the frame Codex's own send_message_to_thread uses: the window shows
// "Sent by Codex from task <from>" and the model reads it as a delegated input. Anywhere else
// (a window with its engine inside) it waits in the conversation's inbox and is given at its
// next prompt. A desktop app conversation gets it through Codex's own queue (`codex queue`,
// run with the app engine's binary): the app's engine starts a turn with it within about 10
// seconds while it holds that conversation, and when it does not, as soon as the conversation
// is opened again; on Mac the app is also asked to pick the conversation up now
// (codex://threads/wake/<id>, which leaves the screen as it is). The queue takes a user
// message, so the text goes in the delegation frame Codex itself uses. When the queue cannot
// take it (no binary, the command fails) it waits in the inbox as before.
// Returns how it went: 'started', 'app-queued' or 'queued'.
export async function deliverToCodex(project, threadId, text, { from, fromName } = {}) {
  const presence = readPresence(project, threadId);
  if (!presence) throw new Error(`이 프로젝트에서 연 Codex 대화가 아닙니다: codex:${threadId}`);
  const at = engineFrom(presence);
  if (at.mode === 'shared' && socketThere(at.socket)) {
    await withEngine(at, engine => sendToThread(engine, { source: from, threadId, prompt: text }));
    return 'started';
  }
  if (at.mode === 'app' && at.bin) {
    try { await queueToApp(at, threadId, delegatedPrompt(from, text)); return 'app-queued'; }
    catch (error) { console.error(`head-context: Codex queue failed, using the inbox: ${error.message}`); }
  }
  queue(project, threadId, { from, from_name: fromName, text });
  return 'queued';
}

// `codex queue --thread <id> --message <text>` with the app engine's own binary and home. No
// --resume: that would load the conversation into another engine than the app's.
// at: the app's engine (threads.mjs engineFrom). wake: ask the Mac app to pick it up now.
export function queueToApp(at, threadId, message, { wake = isMac, run = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...(at.home ? { CODEX_HOME: at.home } : {}) };
    const child = run(at.bin, ['queue', '--thread', threadId, '--message', message], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('codex queue did not finish')); }, 20000);
    child.stderr?.on('data', d => { err += d; });
    child.stdout?.on('data', () => { });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(err.trim().split('\n').pop() || `codex queue exited ${code}`)); return; }
      if (wake) { try { const o = run('open', ['-g', `codex://threads/wake/${threadId}`], { stdio: 'ignore', detached: true }); o.on?.('error', () => { /* the queue already holds it; waking is a nicety */ }); o.unref?.(); } catch { /* the queue already holds it; waking is a nicety */ } }
      resolve();
    });
  });
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
