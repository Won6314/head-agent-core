import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { processEvidence, parentPid, evidenceAlive } from '../../core/liveness.mjs';

function linuxIdentity(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const parts = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return { pid: Number(pid), ppid: Number(parts[1]), start: parts[19], zombie: parts[0] === 'Z' };
}
function registryFor(pid) {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'sessions', `${pid}.json`), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export function hostProcess(conversation) {
  let pid = process.ppid;
  for (let depth = 0; pid > 1 && depth < 20; depth++) {
    try {
      const registry = registryFor(pid);
      if (registry?.sessionId === conversation) return processEvidence(pid);
      pid = parentPid(pid);
    } catch { break; }
  }
  return null;
}
export function alive(status, conversation) {
  if (status?.liveness) return evidenceAlive(status);
  if (status?.process?.platform === 'linux') {
    try { const p = linuxIdentity(status.process.pid); return !p.zombie && p.start === status.process.start; }
    catch { return false; }
  }
  const directory = path.join(os.homedir(), '.claude', 'sessions');
  try {
    return fs.readdirSync(directory).some(file => {
      if (!/^\d+\.json$/.test(file)) return false;
      try { const r = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')); if (r.sessionId !== conversation) return false; process.kill(Number(file.slice(0, -5)), 0); return true; }
      catch { return false; }
    });
  } catch { return false; }
}
