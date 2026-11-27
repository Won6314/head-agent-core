import fs from 'node:fs';

export function claudeSaves(file, id) {
  if (!file) return [];
  let text;
  try {
    if (fs.statSync(file).size > 64 * 1024 * 1024) return [];
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const calls = [];
  for (const line of text.split('\n')) {
    if (!line.includes('session__save') && !line.includes('__save')) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (Object.hasOwn(row, 'forkedFrom') || row.sessionId !== id) continue;
    if (!Array.isArray(row.message?.content)) continue;
    for (const part of row.message.content)
      if (
        part.type === 'tool_use' &&
        typeof part.name === 'string' &&
        /^mcp__.*head-context.*__save$/.test(part.name) &&
        typeof part.input?.summary === 'string'
      )
        calls.push({ summary: part.input.summary, at: Date.parse(row.timestamp) });
  }
  return calls;
}
