import { antigravityLive, readPresence, queue } from './threads.mjs';
export const antigravityPeer = {
  host: 'antigravity',
  live: antigravityLive,
  accepts: (target) => target.startsWith('antigravity:'),
  async send(target, text, { project, from, fromName }) {
    const id = /^antigravity:([A-Za-z0-9_-]+)$/.exec(target)?.[1];
    if (!id || !readPresence(project, id)) throw new Error(`받는 Antigravity 대화를 찾을 수 없습니다: ${target}`);
    queue(project, id, { from, from_name: fromName, text });
    return 'queued';
  },
};
