import { report } from '../core/state.mjs';
try {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--host');
  const host = flag < 0 ? 'claude' : args.splice(flag, 2)[1];
  const [project, parent, id, name, phase] = args;
  report(project, { host, parent_conversation_id: parent, id, name, status: phase === 'start' ? 'running' : phase === 'end' ? 'ended' : phase });
} catch (error) { console.error(error.message); process.exitCode = 1; }
