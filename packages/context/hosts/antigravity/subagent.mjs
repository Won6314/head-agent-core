import fs from 'node:fs';
import path from 'node:path';

// agy puts the parent's first message in a subagent's own messages folder before the
// subagent's SessionStart; a conversation a person opened has no such message. Unknown → null
// (handled as a person's conversation): misreading a person as a subagent costs HEAD its context.
const PARENT_TITLE = 'Message from Parent Agent';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function parentOf({ conversationId: id, artifactDirectoryPath: dir } = {}) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir) || path.basename(dir) !== id) return null;
  const folder = path.join(dir, '.system_generated', 'messages');
  let names;
  try {
    names = fs.readdirSync(folder);
  } catch {
    return null;
  }
  let parent = null, earliest;
  for (const name of names.filter((name) => name.endsWith('.json')).sort()) {
    let m;
    try {
      m = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
    } catch {
      continue;
    }
    if (m?.renderDetails?.messageTitle !== PARENT_TITLE) continue;
    if (typeof m.sender !== 'string' || !UUID.test(m.sender) || m.sender === id) continue;
    const at = typeof m.timestamp === 'string' ? m.timestamp : '';
    if (parent === null || at < earliest) {
      parent = m.sender;
      earliest = at;
    }
  }
  return parent;
}
