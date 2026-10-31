import { processOf } from '../../core/platform.mjs';
import { codexHome, controlSocket } from './engine.mjs';

// Which Codex engine runs this process's conversation, read from the process's ancestors.
// Codex starts hooks and tool servers as children of the engine:
//   shared   — `codex app-server --listen unix://[path]`: the shared engine terminal windows
//              attach to. Its own conversation tools (codex_tui) exist there.
//   embedded — a `codex` window running its engine inside itself: no conversation tools.
//   app      — any other `codex app-server` (the desktop app, an editor): no such tools.
// The ancestors come from the process table (core/platform.mjs).
// The shared engine's socket is the --listen path, or the default one under CODEX_HOME.
const isCodex = (argv) =>
  (argv.length && /(^|[\\/])codex(\.exe)?$/.test(argv[0])) ||
  (argv[0] && /node/.test(argv[0]) && argv.some((a) => /[\\/]codex(\.js)?$/.test(a)));
export function engineOf({ pid = process.ppid, env = process.env, depth = 6, read = processOf } = {}) {
  const home = codexHome(env);
  for (let at = pid, i = 0; at > 1 && i < depth; i++) {
    const p = read(at);
    if (!p) break;
    const argv = p.argv,
      k = argv.indexOf('app-server');
    if (k >= 0 && isCodex(argv.slice(0, k))) {
      const listen = argv.indexOf('--listen'),
        value = listen >= 0 ? argv[listen + 1] || '' : argv.find((a) => a.startsWith('--listen='))?.slice(9) || '';
      if (value.startsWith('unix://'))
        return { mode: 'shared', pid: at, home, socket: value.slice(7) || controlSocket(home), bin: argv[0] };
      return { mode: 'app', pid: at, home, bin: argv[0] };
    }
    if (isCodex(argv) && !argv.includes('app-server')) return { mode: 'embedded', pid: at, home };
    at = p.ppid;
  }
  return { mode: 'unknown', home };
}
