import { processOf, processBirth } from '../../core/platform.mjs';
import { pidAlive } from '../../core/liveness.mjs';

// agy 1.5.13 launches hooks through `sh -c node ...`. Never record the
// short-lived shell or hook as the owner of the conversation.
export function agyOwner(pid = process.ppid, inspect = processOf, birth = processBirth) {
  const seen = new Set();
  while (pid > 1 && !seen.has(pid)) {
    seen.add(pid);
    const info = inspect(pid);
    if (!info) break;
    if (info.argv.slice(0, 2).some((arg) => /(?:^|[/\\])agy(?:\.exe|\.cmd|\.js|\.mjs)?$/.test(arg))) {
      const start = birth(pid);
      return { pid, ...(start ? { start } : {}) };
    }
    pid = info.ppid;
  }
  return {};
}

// The single liveness rule for all Antigravity list consumers. `at` is only
// activity/order metadata; legacy presence without a pid is not live.
export const antigravityAlive = (presence) =>
  pidAlive(presence?.pid) && (!presence.start || processBirth(presence.pid) === presence.start);
