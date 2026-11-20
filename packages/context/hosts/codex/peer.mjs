import { codexLive } from './threads.mjs';
import { deliverToCodex } from './deliver.mjs';
// Codex as another app sees it: its live conversations of a project.
export const codexPeer = {
  host: 'codex',
  live: codexLive,
  accepts: (target) => target.startsWith('codex:'),
  send: (target, text, options) => deliverToCodex(options.project, target.slice(6), text, options),
};
