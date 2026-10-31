// The forms every app wrapper writes the same way, so that one app's conversation reads what
// another's wrote:
//   envelope   — a message from another conversation, as Claude Code's own SendMessage
//                hands it over: <cross-session-message from="…" from-name="…">.
//   hookOutput — what a hook prints to add to a conversation; Claude Code and Codex read the
//                same hookSpecificOutput object.
const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export const envelope = ({ from, fromName, text }) =>
  `<cross-session-message from="${attr(from)}"${fromName ? ` from-name="${attr(fromName)}"` : ''}>\n${text}\n</cross-session-message>`;
export const hookOutput = (event, fields) =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: event, ...fields } });
