// Claude Code side of messages to Codex and Antigravity peers. The model keeps
// its own SendMessage; a message addressed codex:<thread id> (the address conversations
// shows for a Codex conversation) goes to that Codex conversation instead of a Claude inbox,
// and the send answers as delivered. Everything else goes on as the host sends it.
// The module has no Node of its own: the relay script does the work (scripts/relay.mjs).
export function register(on) {
  on('session.send', async ($, e, next) => {
    if (typeof e.to !== 'string' || (!e.to.startsWith('codex:') && !e.to.startsWith('antigravity:'))) return next(e);
    const [project, id] = await Promise.all([$.session.root(), $.session.id()]);
    const run = await $.process.run(['node', `${$.plugin.root}/scripts/relay.mjs`, project, e.to, `claude:${id}`], {
      stdin: e.text,
      timeoutMs: 60000,
    });
    let answer = null;
    try {
      answer = JSON.parse(run.stdout.trim().split('\n').pop() || 'null');
    } catch {
      answer = null;
    }
    if (answer?.delivered) return { isDelivered: true };
    return {
      isDelivered: false,
      reason:
        answer?.reason ||
        `${e.to.startsWith('antigravity:') ? 'Antigravity' : 'Codex'}로 보내지 못했습니다${run.stderr ? `: ${run.stderr.trim().split('\n')[0]}` : ''}`,
    };
  }).catch(($, e, next) =>
    next.called || (!String(e.to).startsWith('codex:') && !String(e.to).startsWith('antigravity:'))
      ? next(e)
      : {
          isDelivered: false,
          reason: `${String(e.to).startsWith('antigravity:') ? 'Antigravity' : 'Codex'}로 보내는 중 플러그인 오류가 났습니다`,
        },
  );
}
