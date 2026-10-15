import fs from 'node:fs';
import os from 'node:os';
// Generic OS witness, not a host registry. Absent/unknown evidence is never live.
export function processEvidence(pid = process.pid) {
  if (process.platform !== 'linux') return null;
  try {
    const p = linuxIdentity(pid);
    return { type: 'linux-process', pid: Number(pid), start: p.start,
      boot_id: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(), machine: os.hostname() };
  } catch { return null; }
}
function linuxIdentity(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const parts = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return { ppid: Number(parts[1]), start: parts[19], zombie: parts[0] === 'Z' };
}
export function parentPid(pid) { try { return linuxIdentity(pid).ppid; } catch { return null; } }
export function evidenceAlive(record) {
  const evidence = record?.liveness || record?.process;
  if (!evidence || !(evidence.type === 'linux-process' || evidence.platform === 'linux')) return false;
  try {
    if (evidence.machine && evidence.machine !== os.hostname()) return false;
    if (evidence.boot_id && evidence.boot_id !== fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()) return false;
    const actual = linuxIdentity(evidence.pid);
    return !actual.zombie && actual.start === evidence.start;
  } catch { return false; }
}
