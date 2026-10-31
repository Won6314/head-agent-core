// Work-branch lifetime. A work branch is opened by name when work starts and is closed by
// one thing only: a save that leaves no next. That save carries the recap, and the
// branch is merged into main as one entry. A conversation ending, a process going away
// or a model switching to another branch closes nothing. 중단 is the one other way out:
// the user dropping the work, kept with its reason.
//
// 멈춤 is what 0.6 wrote when a conversation ended with a next still pending. It was
// closed by the old rule, not by the work, so it counts as open: still pending work.
export const OPEN = '열림',
  PAUSED = '멈춤',
  CLOSED = '끝남',
  ABANDONED = '중단';
export const isOpen = (status) => status !== CLOSED && status !== ABANDONED;
// The one entry a closing branch leaves on main. The tool writes the marker lines
// (상태/브랜치/기록) that the graph turns into a merge edge and the map shows as 합침.
export function mergeArgs({ branch, recap, entries }) {
  const last = entries.at(-1),
    record = `work/${branch}/history.md`;
  return {
    summary: last?.summary || branch,
    history: recap || last?.summary || '저장 없이 닫혔습니다.',
    status: CLOSED,
    branch,
    record,
  };
}
