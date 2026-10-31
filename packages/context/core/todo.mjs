import fs from 'node:fs';
import path from 'node:path';
import { optionalRead, atomicText, noSymlink } from './storage.mjs';
import { locked } from './lock.mjs';
// To-dos belong to the work session, not to a branch or a conversation: a branch closes,
// the to-do stays. One line each in the session's todo.md, the format earlier tools wrote:
//   - [ ] 2026-09-18 기한 2026-09-23(수) "사용자 원문"
//   - [x] ...                                   (done)
const WEEKDAY = '일월화수목금토',
  DATE = /^\d{4}-\d{2}-\d{2}$/;
const LINE = /^\s*-\s*\[( |x|X)\]\s*(\d{4}-\d{2}-\d{2})?(?:\s+기한\s+(\d{4}-\d{2}-\d{2})(?:\([^)]*\))?)?\s*(.*)$/;
const todoFile = (dir) => noSymlink(path.join(dir, 'todo.md'));
// The calendar day in the project's time zone (the computer's when unset).
export function today(timeZone, now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(now),
  );
}
const weekday = (iso) => WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const dayAfter = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
function parseTodo(text) {
  return text
    .split('\n')
    .map((line, index) => {
      const m = LINE.exec(line);
      if (!m) return null;
      const body = m[4].trim();
      return {
        index,
        line,
        done: m[1] !== ' ',
        created: m[2] || '',
        due: m[3] || '',
        text: body.replace(/^"(.*)"$/s, '$1'),
      };
    })
    .filter(Boolean);
}
// Open items: dated ones first by due date, then the rest newest first.
export function openTodos(dir) {
  return parseTodo(optionalRead(todoFile(dir)))
    .filter((t) => !t.done)
    .sort(
      (a, b) =>
        (a.due ? 0 : 1) - (b.due ? 0 : 1) ||
        a.due.localeCompare(b.due) ||
        b.created.localeCompare(a.created) ||
        b.index - a.index,
    );
}
// Due tomorrow or earlier.
export const dueSoon = (t, day) => Boolean(t.due) && t.due <= dayAfter(day);
export function addTodo(dir, { text, due, timeZone, now = Date.now() }) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) throw new Error('text(할 일)가 필요합니다.');
  if (due !== undefined && due !== '' && !DATE.test(due))
    throw new Error('due는 YYYY-MM-DD입니다. 상대 날짜는 실제 날짜로 바꿔 주세요.');
  const file = todoFile(dir),
    quoted = clean.startsWith('"') ? clean : `"${clean.replace(/"/g, "'")}"`;
  const line = `- [ ] ${today(timeZone, now)}${due ? ` 기한 ${due}(${weekday(due)})` : ''} ${quoted}`;
  locked(file, () => {
    const prior = optionalRead(file);
    atomicText(file, prior + (prior && !prior.endsWith('\n') ? '\n' : '') + line + '\n');
  });
  return line;
}
export function doneTodo(dir, match) {
  const needle = String(match || '')
    .trim()
    .toLowerCase();
  if (!needle) throw new Error('match(끝낼 항목 원문의 일부)가 필요합니다.');
  const file = todoFile(dir);
  return locked(file, () => {
    const text = optionalRead(file),
      hits = parseTodo(text).filter((t) => !t.done && t.line.toLowerCase().includes(needle));
    if (hits.length !== 1) return { changed: false, hits };
    const lines = text.split('\n');
    lines[hits[0].index] = lines[hits[0].index].replace('[ ]', '[x]');
    atomicText(file, lines.join('\n'));
    return { changed: true, hits };
  });
}
export const todoLine = (t) => `- ${t.due ? `기한 ${t.due} · ` : ''}${t.text}`;
