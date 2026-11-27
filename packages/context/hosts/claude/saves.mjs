import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

// The record is read in chunks, whatever its size, and only lines naming a save are parsed.
function* saveLines(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return;
  }
  try {
    const buffer = Buffer.alloc(1024 * 1024),
      decoder = new StringDecoder('utf8');
    let pieces = [];
    for (let n; (n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0;) {
      const text = decoder.write(buffer.subarray(0, n));
      let start = 0;
      for (let end; (end = text.indexOf('\n', start)) !== -1; start = end + 1) {
        const line = pieces.join('') + text.slice(start, end);
        pieces = [];
        if (line.includes('__save')) yield line;
      }
      pieces.push(text.slice(start));
    }
    const last = pieces.join('') + decoder.end();
    if (last.includes('__save')) yield last;
  } catch {
    /* a record the host is still writing or cannot be read */
  } finally {
    fs.closeSync(fd);
  }
}
export function claudeSaves(file, id) {
  if (!file) return [];
  const calls = [];
  for (const line of saveLines(file)) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.type !== 'assistant' || Object.hasOwn(row, 'forkedFrom') || row.sessionId !== id) continue;
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
