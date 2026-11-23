import fs from 'node:fs';
import { EXCHANGES, renderRecent } from '../../core/recent.mjs';
// The recent conversation a compact or /clear takes away, put back as it was said: the
// last EXCHANGES exchanges before the cut. An exchange is one thing the user said (typed,
// sent while the model was working, or answered in a question window) and the text the
// model showed after it. Tool calls, tool results, thinking, hook and system notices,
// command lines and everything the user said before those exchanges are left out — older
// work is carried by the work context.
const SKIP =
  /^(<command-name>|<command-message>|<local-command|<task-notification|<system-reminder|<channel|<cross-session-message|\[Request interrupted|This session is being continued|Base directory for this skill|Caveat: The messages below)/;
const COMMAND = /^\/[A-Za-z][\w:-]*(\s|$)/;
const reminders = (text) => text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
const texts = (content) =>
  typeof content === 'string'
    ? [content]
    : Array.isArray(content)
      ? content.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text)
      : [];
const said = (text) => {
  const body = reminders(text);
  return body && !SKIP.test(body) && !COMMAND.test(body) ? body : '';
};
function answer(content) {
  if (!Array.isArray(content)) return '';
  for (const part of content) {
    if (part?.type !== 'tool_result') continue;
    const body = typeof part.content === 'string' ? part.content : texts(part.content).join('\n');
    if (body.trimStart().startsWith('The user answered'))
      return body.replace(/\s*Read the answers carefully[\s\S]*$/, '').trim();
  }
  return '';
}
// Exchanges of the last stretch of the record that has any: a compact boundary or a
// /clear starts a new stretch, so at a compact start the stretch just compacted is read.
export function exchanges(transcript) {
  let raw;
  try {
    raw = fs.readFileSync(transcript, 'utf8');
  } catch {
    return [];
  }
  const spans = [[]];
  const cur = () => spans[spans.length - 1];
  const user = (at, text) => cur().push({ at, user: text, model: [] });
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r.type === 'system' && r.subtype === 'compact_boundary') {
      spans.push([]);
      continue;
    }
    if (r.type === 'attachment' && r.attachment?.type === 'queued_command') {
      const a = r.attachment;
      if (a.humanTurn === true || a.origin?.kind === 'human') {
        const text = said(String(a.prompt || ''));
        if (text) user(r.timestamp || a.timestamp, text);
      }
      continue;
    }
    const m = r.message || {};
    if (r.type === 'user' && m.role === 'user' && !r.isMeta && !r.isCompactSummary) {
      const asked = answer(m.content);
      if (asked) {
        user(r.timestamp, `(질문 창 답) ${asked}`);
        continue;
      }
      const body = texts(m.content).map(said).filter(Boolean).join('\n').trim();
      if (/^<command-name>\/clear/.test(texts(m.content).join('').trim())) {
        spans.push([]);
        continue;
      }
      if (body) user(r.timestamp, body);
      continue;
    }
    if (r.type === 'assistant' && cur().length) {
      for (const text of texts(m.content)) if (text.trim()) cur().at(-1).model.push(text.trim());
    }
  }
  for (let i = spans.length - 1; i >= 0; i--) if (spans[i].length) return spans[i].slice(-EXCHANGES);
  return [];
}
export const recentPart = (transcript, options) => renderRecent(exchanges(transcript), transcript, options);
