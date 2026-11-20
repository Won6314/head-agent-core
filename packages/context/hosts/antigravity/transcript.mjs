import fs from 'node:fs';
import { clock } from '../../core/map-view.mjs';
import { HOOK_BUDGET } from '../../core/recovery.mjs';

// Host record adaptation only: keep explicit user requests and visible model text,
// never the host's metadata, injected system messages, thinking or tool results.
export function steps(file) {
  if (!file) return [];
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return text.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    } // includes a partial final write
  });
}
export const checkpointOf = (rows) => {
  const row = rows.findLast((r) => r.type === 'CHECKPOINT' && r.status === 'DONE');
  return row ? `${row.step_index}:${row.created_at}` : null;
};
export function exchanges(rows) {
  const spans = [[]];
  for (const row of rows) {
    if (row.type === 'CHECKPOINT') {
      spans.push([]);
      continue;
    }
    const span = spans.at(-1);
    if (row.type === 'USER_INPUT' && row.source === 'USER_EXPLICIT') {
      const text = /^<USER_REQUEST>\n([\s\S]*?)\n<\/USER_REQUEST>/.exec(row.content || '')?.[1]?.trim();
      if (text && !/^\/[A-Za-z][\w:-]*(\s|$)/.test(text)) span.push({ at: row.created_at, user: text, model: [] });
    } else if (row.type === 'PLANNER_RESPONSE' && span.length && typeof row.content === 'string' && row.content.trim())
      span.at(-1).model.push(row.content.trim());
  }
  return spans.findLast((s) => s.length)?.slice(-5) || [];
}
// Restore the stretch before the latest checkpoint, not the new prompt already
// written after it when PreInvocation runs. Like Claude: five exchanges, oldest
// dropped first to fit; one oversized exchange is shortened and names its source.
export function recentPart(rows, file, { timeZone, budget = HOOK_BUDGET } = {}) {
  const at = rows.findLastIndex((r) => r.type === 'CHECKPOINT');
  const all = exchanges(at >= 0 ? rows.slice(0, at) : rows);
  if (!all.length) return '';
  const time = clock(timeZone);
  const render = (list, dropped) =>
    [
      `# 최근 대화 (직전 주고받기 ${list.length}번, 원문)`,
      ...(dropped ? [`앞의 ${dropped}번은 상한 때문에 뺐습니다. 대화 기록 파일: ${file}`] : []),
      ...list.flatMap((x, i) => [
        '',
        `## ${i + 1} · 사용자 ${time(x.at)}`,
        x.user,
        '',
        `## ${i + 1} · 답`,
        x.model.join('\n\n') || '(보이는 글 없음)',
      ]),
    ].join('\n');
  const list = all.map((x) => ({ ...x }));
  let dropped = 0;
  while (render(list, dropped).length > budget && list.length > 1) {
    list.shift();
    dropped++;
  }
  let text = render(list, dropped);
  if (text.length > budget) {
    const x = list[0];
    const room = Math.max(500, budget - render([{ ...x, user: '', model: [] }], dropped).length - 200);
    const cut = (s, n) => (s.length > n ? `${s.slice(0, n)} …(생략)` : s);
    text =
      render(
        [
          {
            ...x,
            user: cut(x.user, Math.floor(room / 3)),
            model: [cut(x.model.join('\n\n'), room - Math.floor(room / 3))],
          },
        ],
        dropped,
      ) + `\n(길어서 줄였습니다. 원문: ${file})`;
  }
  return text;
}
