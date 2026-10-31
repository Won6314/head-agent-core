// Claude Code side of a message to a Codex conversation: the plugin's SendMessage hook runs
//   node relay.mjs <project> codex:<thread id> <from address> [<from name>]
// with the message text on stdin, and prints {"delivered":true,"how":"started"|"app-queued"|"queued"}
// or {"delivered":false,"reason":"..."}.
import fs from 'node:fs';
import { deliverToCodex } from '../hosts/codex/deliver.mjs';
const [project, to, from, fromName] = process.argv.slice(2);
try {
  const id = /^codex:([A-Za-z0-9_-]+)$/.exec(to || '')?.[1];
  if (!project || !id || !from) throw new Error('사용법: relay.mjs <project> codex:<thread id> <from> [<from name>]');
  const how = await deliverToCodex(project, id, fs.readFileSync(0, 'utf8'), { from, fromName });
  console.log(JSON.stringify({ delivered: true, how }));
} catch (error) { console.log(JSON.stringify({ delivered: false, reason: error.message })); }
