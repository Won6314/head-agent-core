import { mapSummary } from './history.mjs';
import { clock } from './map-view.mjs';
import { branchTitle } from './recovery.mjs';
import { isOpen } from './lifecycle.mjs';

export function conversationKey(host, id) {
  if (
    typeof host !== 'string' ||
    !/^[a-z][a-z0-9]*$/.test(host) ||
    typeof id !== 'string' ||
    !/^[A-Za-z0-9_-]+$/.test(id)
  )
    throw new Error('대화 ID가 유효하지 않습니다.');
  return `${host}:${id}`;
}

export function chainOf(connection, starts) {
  const queue = [...starts],
    seen = new Set(),
    result = [];
  while (queue.length && result.length < 32) {
    const { id, transcript } = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const bound = connection(id);
    result.push({ id, transcript: transcript || bound?.transcript_path || null });
    if (Array.isArray(bound?.previous))
      for (const previous of bound.previous)
        if (typeof previous === 'string' && /^[A-Za-z0-9_-]+$/.test(previous)) queue.push({ id: previous });
  }
  return result;
}

export function conversationRecords(g, { host, chain, calls }) {
  const records = new Map();
  const add = (row, detail = g.detail(row)) =>
    records.set(row.id, { ...detail, session: row.session, stamp: row.stamp });
  for (const { id } of chain) for (const row of g.byConversation(conversationKey(host, id))) add(row);
  const ordered = calls.filter((call) => Number.isFinite(call.at)).sort((a, b) => a.at - b.at);
  if (ordered.length) {
    const candidates = g
      .stampedBetween(ordered[0].at - 5000, ordered.at(-1).at + 600000)
      .map((row) => ({ row, detail: g.detail(row), at: Date.parse(row.stamp) }))
      .sort((a, b) => a.at - b.at);
    const used = new Set();
    for (const call of ordered) {
      const key = conversationKey(host, call.conversation);
      const found = candidates.find(
        ({ row, detail, at }) =>
          !used.has(row.id) &&
          detail.explicit_summary === call.summary.trim() &&
          detail.source === '' &&
          (detail.conversation === '' || detail.conversation === key) &&
          call.at - 5000 <= at &&
          at <= call.at + 600000,
      );
      if (found) {
        used.add(found.row.id);
        add(found.row, found.detail);
      }
    }
  }
  return [...records.values()].sort((a, b) => Date.parse(a.stamp) - Date.parse(b.stamp));
}

const cut = (text, n) => {
  const chars = Array.from(text);
  return chars.length > n ? chars.slice(0, n).join('') + '…' : text;
};

export function renderConversationMap(g, records, { session }) {
  const lines = [
    '## 이 대화가 남긴 기록 (최신이 위)',
    '이 대화와 /clear·이어짐으로 이어진 앞 대화가 저장한 기록이다. 본문은 `read entry <짧은 ID>`로 읽는다(다른 작업 세션의 줄은 name도 준다).',
  ];
  const ordered = [...records].sort((a, b) => Date.parse(b.stamp) - Date.parse(a.stamp) || b.id.localeCompare(a.id));
  for (const record of ordered.slice(0, 15)) {
    let branch = '메인';
    if (record.stem !== 'main') {
      const header = g.header(record.session, record.stem);
      branch = header
        ? branchTitle({ name: record.stem, ...header }) + (isOpen(header.status) ? '' : ` (${header.status})`)
        : record.stem;
    }
    const shown = record.session !== session ? `[${record.session}] ` : '';
    lines.push(
      cut(
        `- ${g.shortIds(record.session).get(record.id)} ${clock(g.timezone)(record.stamp)} ${shown}${branch} · ${cut(mapSummary(record).text, 120)}`,
        300,
      ),
    );
  }
  if (!records.length) lines.push('(이 대화가 저장한 기록은 아직 없다)');
  if (records.length > 15) lines.push(`(그 앞 ${records.length - 15}개 — 흐름 지도에 있다)`);
  return lines;
}

export function recoveryBlock(g, place, source) {
  if (source === 'clear' && !place) return '';
  const lines =
    source === 'clear'
      ? [
          '## /clear 뒤 먼저 할 것',
          '이 대화는 /clear 전 대화의 자리(작업 세션·작업 브랜치)를 이어받았다. 사용자가 하던 일을 이으라고 하면 아래대로 복원부터 한다. 새 일을 말하면 그 일을 한다.',
        ]
      : [
          '## 컴팩트 뒤 먼저 할 것',
          '하던 일을 잇기 전에 복원부터 한다. 컴팩트 요약에 붙은 "이어서 하라"는 말은 복원을 마친 뒤에 따른다.',
        ];
  if (!place)
    lines.push(
      '1. 최초 목적과 지금 할 일: 최근 대화에서 사용자가 정한 일을 찾는다. 사용자가 정하지 않은 계획은 잇기 전에 사용자에게 확인한다.',
    );
  else if (place.stem === 'main')
    lines.push(
      '1. 최초 목적: 이 대화는 메인에서 일한다. 메인은 여러 대화가 함께 쓰므로, 메인의 다른 기록은 다른 대화 것일 수 있다. 할 일은 「이 대화가 남긴 기록」과 최근 대화에서 사용자가 정한 일에서 찾는다.',
      '2. 지금 할 일: 위에서 찾은 일이다. 사용자가 정하지 않은 계획은 잇기 전에 사용자에게 확인한다.',
    );
  else {
    const rows = g.own(place.session, place.stem),
      first = rows[0],
      next = rows.length ? g.detail(rows.at(-1)).next : '';
    lines.push(
      first
        ? `1. 최초 목적: \`read entry ${g.shortIds(place.session).get(first.id)}\`로 이 작업 브랜치를 시작한 목적(문제·목표·조건)을 읽는다. 첫 기록 요약: ${mapSummary(g.detail(first)).text}`
        : '1. 최초 목적: 이 작업 브랜치에는 아직 기록이 없다. 최근 대화에서 사용자가 정한 일을 찾는다.',
      next
        ? `2. 지금 할 일: 마지막 기록의 다음 — ${next}. 이 다음은 기록을 남긴 대화가 적은 계획이다. 사용자가 정한 일인지 최근 대화에서 확인한 뒤 잇는다.`
        : '2. 지금 할 일: 최근 대화에서 사용자가 마지막으로 정한 일을 찾는다.',
    );
  }
  return lines.join('\n');
}

export function recoveryText(g, { place, source, host, chain, calls }) {
  const block = recoveryBlock(g, place, source);
  if (!block) return '';
  const records = conversationRecords(g, { host, chain, calls });
  const map =
    !place && !records.length ? '' : renderConversationMap(g, records, { session: place?.session }).join('\n');
  return [block, map].filter(Boolean).join('\n\n');
}
