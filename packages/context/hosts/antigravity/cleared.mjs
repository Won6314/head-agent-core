import path from 'node:path';
import { readTail } from '../../core/storage.mjs';
import { appData } from './wake-key.mjs';

export function clearedFrom(id, { file = path.join(appData(), 'history.jsonl') } = {}) {
  const text = readTail(file, 256 * 1024);
  if (text === null) return null;
  const rows = text.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const index = rows.findIndex((r) => r.conversationId === id);
  if (index < 0) return null;
  const current = rows[index];
  for (let i = index - 1; i >= 0; i--) {
    const previous = rows[i];
    if (previous.workspace !== current.workspace) continue;
    return previous.type === 'slash_command' &&
      String(previous.display).trim() === '/clear' &&
      typeof previous.conversationId === 'string' &&
      /^[A-Za-z0-9_-]+$/.test(previous.conversationId) &&
      previous.conversationId !== id
      ? previous.conversationId
      : null;
  }
  return null;
}
