// What a person typed, as opposed to what reached a conversation on its own: a slash
// command, a task or channel notice, another conversation's message, a plugin's prompt.
// Returns the line that says it (a paste's first line for a pasted block), or null.
export function instructionLine(text){
  if(typeof text!=='string')return null;
  const lines=text.split(/\r?\n/).map(l=>l.trim());
  let first=lines.find(Boolean)||'';
  if(/^<pasted_content\b[^>]*>$/i.test(first))first=lines.slice(lines.indexOf(first)+1).find(l=>l&&!/^<\/pasted_content/i.test(l))||'';
  if(!first||/^\/[^\s/]+(?:\s|$)/.test(first)||/^\[(?:forked|quick_task|context_run|agent-task|다른 세션 HEAD|frozen_wave|head_advisor|from )/i.test(first))return null;
  if(/^(?:<system|<task-notification|<channel|<cross-session-message|<local-command|<command-|<pasted_content|Caveat:|This is a message from another|Another Claude session sent|The \S+ plugin sent a message)/i.test(first))return null;
  return Array.from(first).length>10?first:null;
}
// Who runs a conversation: a person at a terminal or in the desktop app, or a program
// that started a copy or a worker.
export function kindOf(entrypoint){
  if(!entrypoint)return null;
  return entrypoint==='cli'||entrypoint==='claude-desktop'?'사람':'포크·워커';
}
