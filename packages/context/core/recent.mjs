import { clock } from './map-view.mjs';
import { HOOK_BUDGET } from './recovery.mjs';

export const EXCHANGES = 5;
const cut = (text, n) => (text.length > n ? `${text.slice(0, n)} …(생략)` : text);
// The recent exchanges as one hook output. Over the budget the oldest exchanges go first;
// the record file is named for them. One exchange alone over the budget is shortened.
export function renderRecent(all, source, { timeZone, budget = HOOK_BUDGET } = {}) {
  if (!all.length) return '';
  const time = clock(timeZone);
  const render = (list, dropped) => {
    const lines = [`# 최근 대화 (직전 주고받기 ${list.length}번, 원문)`];
    if (dropped) lines.push(`앞의 ${dropped}번은 상한 때문에 뺐습니다. 대화 기록 파일: ${source}`);
    list.forEach((x, i) =>
      lines.push(
        '',
        `## ${i + 1} · 사용자 ${time(x.at)}`,
        x.user,
        '',
        `## ${i + 1} · 답`,
        x.model.join('\n\n') || '(보이는 글 없음)',
      ),
    );
    return lines.join('\n');
  };
  let list = all.map((x) => ({ ...x })),
    dropped = 0,
    text = render(list, 0);
  while (text.length > budget && list.length > 1) {
    list.shift();
    dropped++;
    text = render(list, dropped);
  }
  if (text.length > budget) {
    const x = list[0],
      room = Math.max(500, budget - render([{ ...x, user: '', model: [] }], dropped).length - 200);
    list = [
      {
        ...x,
        user: cut(x.user, Math.floor(room / 3)),
        model: [cut(x.model.join('\n\n'), room - Math.floor(room / 3))],
      },
    ];
    text = `${render(list, dropped)}\n(길어서 줄였습니다. 원문: ${source})`;
  }
  return text;
}
