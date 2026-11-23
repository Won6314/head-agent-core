import fs from 'node:fs';
import { EXCHANGES, renderRecent } from '../../core/recent.mjs';

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
function exchanges(rows) {
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
  return spans.findLast((s) => s.length)?.slice(-EXCHANGES) || [];
}
// Restore the stretch before the latest checkpoint, not the new prompt already
// written after it when PreInvocation runs. Rendering lives in core/recent.mjs (as for Claude).
export function recentPart(rows, file, options) {
  const at = rows.findLastIndex((r) => r.type === 'CHECKPOINT');
  return renderRecent(exchanges(at >= 0 ? rows.slice(0, at) : rows), file, options);
}
