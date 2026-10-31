// Small questions to a Codex shared engine, for code that cannot wait on a socket itself;
// threads.mjs runs it as its own process.
//   loaded <socket> [codex binary] — the threads it has loaded, with their names, as JSON.
import { withEngine } from './engine.mjs';
const [command, socket, bin] = process.argv.slice(2);
try {
  if (command !== 'loaded' || !socket) throw new Error('usage: query.mjs loaded <socket>');
  const threads = await withEngine({ socket, bin }, async engine => {
    const ids = (await engine.request('thread/loaded/list', {})).data || [];
    return Promise.all(ids.map(id => engine.request('thread/read', { threadId: id, includeTurns: false }).then(r => ({ id, name: r.thread.name ?? null, status: r.thread.status?.type ?? null }), () => ({ id, name: null, status: null }))));
  }, { timeoutMs: 3000 });
  console.log(JSON.stringify({ threads }));
} catch (error) { console.error(error.message); process.exit(1); }
