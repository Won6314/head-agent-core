import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { codexHome, controlSocket } from './engine.mjs';

// Which Codex engine runs this process's conversation, read from the process's ancestors.
// Codex starts hooks and tool servers as children of the engine:
//   shared   — `codex app-server --listen unix://[path]`: the shared engine terminal windows
//              attach to. Its own conversation tools (codex_tui) exist there.
//   embedded — a `codex` window running its engine inside itself: no conversation tools.
//   app      — any other `codex app-server` (the desktop app, an editor): no such tools.
// On Windows the ancestors come from one PowerShell process list (no /proc, no ps).
// The shared engine's socket is the --listen path, or the default one under CODEX_HOME.
function linuxProcess(pid) {
  try {
    const argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    return { argv, ppid };
  } catch { return null; }
}
function psProcess(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'ppid=', '-o', 'args=', '-p', String(pid)], { encoding: 'utf8', timeout: 2000 }).trim();
    const m = /^(\d+)\s+(.*)$/.exec(out); if (!m) return null;
    return { ppid: Number(m[1]), argv: m[2].split(/\s+/) };
  } catch { return null; }
}
// Windows has no ps: one PowerShell call lists every process (id, parent, command line), kept
// for a few seconds so a walk up the ancestors costs one call.
let windowsTable = null;
export const splitCommandLine = line => [...String(line || '').matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2]);
function windowsProcess(pid) {
  if (!windowsTable || Date.now() - windowsTable.at > 5000) {
    try {
      const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress'],
        { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
      const rows = [].concat(JSON.parse(out) || []);
      windowsTable = { at: Date.now(), byPid: new Map(rows.map(r => [Number(r.ProcessId), { ppid: Number(r.ParentProcessId), argv: splitCommandLine(r.CommandLine) }])) };
    } catch { windowsTable = { at: Date.now(), byPid: new Map() }; }
  }
  return windowsTable.byPid.get(Number(pid)) || null;
}
export const processOf = pid => (process.platform === 'linux' ? linuxProcess(pid) : process.platform === 'win32' ? windowsProcess(pid) : psProcess(pid));
const isCodex = argv => argv.length && /(^|[\\/])codex(\.exe)?$/.test(argv[0]) || (argv[0] && /node/.test(argv[0]) && argv.some(a => /[\\/]codex(\.js)?$/.test(a)));
export function engineOf({ pid = process.ppid, env = process.env, depth = 6, read = processOf } = {}) {
  const home = codexHome(env);
  for (let at = pid, i = 0; at > 1 && i < depth; i++) {
    const p = read(at); if (!p) break;
    const argv = p.argv, k = argv.indexOf('app-server');
    if (k >= 0 && isCodex(argv.slice(0, k))) {
      const listen = argv.indexOf('--listen'), value = listen >= 0 ? argv[listen + 1] || '' : argv.find(a => a.startsWith('--listen='))?.slice(9) || '';
      if (value.startsWith('unix://')) return { mode: 'shared', pid: at, home, socket: value.slice(7) || controlSocket(home), bin: argv[0] };
      return { mode: 'app', pid: at, home };
    }
    if (isCodex(argv) && !argv.includes('app-server')) return { mode: 'embedded', pid: at, home };
    at = p.ppid;
  }
  return { mode: 'unknown', home };
}
// A Unix socket file. On Windows (AF_UNIX) it is not reported as a socket, so being there is
// enough.
export const pathOk = file => {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return false;
  if (process.platform === 'win32') { try { fs.lstatSync(file); return true; } catch (e) { return Boolean(e?.code) && e.code !== 'ENOENT' && e.code !== 'ENOTDIR'; } }
  try { return fs.statSync(file).isSocket(); } catch { return false; }
};
