import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Every operating-system difference of the plugin is asked here; no other file reads
// process.platform. What differs per app (a Claude inbox needing its auth line, the Mac
// Codex app being woken, the Windows proxy to the Codex engine) stays with that app and
// asks these names.
const OS = process.platform;
export const isWindows = OS === 'win32';
export const isMac = OS === 'darwin';
export const isLinux = OS === 'linux';

// A process's parent and command line, read from the process table:
//   Linux   — /proc/<pid>/cmdline and stat.
//   Windows — no ps: one PowerShell call lists every process (id, parent, command line), kept
//             for a few seconds so a walk up the ancestors costs one call.
//   others  — ps.
// null when the process is not there or cannot be read.
function linuxProcess(pid) {
  try {
    const argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    return { argv, ppid };
  } catch {
    return null;
  } // gone or not readable: no such process to report
}
function psProcess(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'ppid=', '-o', 'args=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    const m = /^(\d+)\s+(.*)$/.exec(out);
    if (!m) return null;
    return { ppid: Number(m[1]), argv: m[2].split(/\s+/) };
  } catch {
    return null;
  } // ps exits non-zero for a pid that is gone
}
let windowsTable = null;
export const splitCommandLine = (line) => [...String(line || '').matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
function windowsProcess(pid) {
  if (!windowsTable || Date.now() - windowsTable.at > 5000) {
    try {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress',
        ],
        { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      );
      const rows = [].concat(JSON.parse(out) || []);
      windowsTable = {
        at: Date.now(),
        byPid: new Map(
          rows.map((r) => [
            Number(r.ProcessId),
            { ppid: Number(r.ParentProcessId), argv: splitCommandLine(r.CommandLine) },
          ]),
        ),
      };
    } catch {
      windowsTable = { at: Date.now(), byPid: new Map() };
    }
  }
  return windowsTable.byPid.get(Number(pid)) || null;
}
export const processOf = (pid) => (isLinux ? linuxProcess(pid) : isWindows ? windowsProcess(pid) : psProcess(pid));

// A process's start time (clock ticks since boot), Linux only: elsewhere null.
export function processStart(pid) {
  if (!isLinux) return null;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] || null;
  } catch {
    return null;
  } // gone: no start time
}

// A Unix socket file at an absolute path. On Windows (AF_UNIX) it is not reported as a
// socket, so being there is enough.
export const socketThere = (file) => {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return false;
  if (isWindows) {
    try {
      fs.lstatSync(file);
      return true;
    } catch (e) {
      return Boolean(e?.code) && e.code !== 'ENOENT' && e.code !== 'ENOTDIR';
    }
  }
  try {
    return fs.statSync(file).isSocket();
  } catch {
    return false;
  } // not there
};
