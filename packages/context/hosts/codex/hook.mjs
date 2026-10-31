import fs from 'node:fs';
import { sessions } from '../../core/sessions.mjs';
import { HOOK_BUDGET, UNCONNECTED } from '../../core/recovery.mjs';
import { instructionsFor, SUBAGENT_NOTICE } from '../../core/mcp.mjs';
import { guide, refreshCore, coreParts } from '../../core/project.mjs';
import { register } from './register.mjs';
import { engineOf } from './mode.mjs';
import { hookOutput } from '../../core/protocol.mjs';
import { writePresence, readPresence, engineFrom, take, asMessage } from './threads.mjs';

// Codex hooks, one process per part like the Claude hook. Codex says which start it is
// (source: startup, resume, clear, compact, fork); hooks.json turns its output cap off.
// SessionStart:
//   core         — the core instructions, whole.
//   instructions — what the tool server says about its tools (Codex does not give a
//     server's instructions to the model at the start).
//   session      — registers the conversation's folder for the tool server and, for the
//     project, which engine runs it (presence: the list of conversations and messages to it
//     read it); then the work session part (or the not-connected line) and the first-run guide.
//   context      — the work context.
// UserPromptSubmit:
//   inbox        — messages other conversations left for this one while it could not be
//     woken (its engine is not the shared one), given with the prompt.
// SubagentStart:
//   subagent     — a thread the conversation spawned (spawn_agent, fork or fresh) is a task
//     inside it: one notice. Codex runs no SessionStart there, and its other hooks carry the
//     task's agent_id with the conversation's session_id; the inbox is the conversation's own.
// resume and fork give nothing: the conversation already holds it. /clear starts
// unconnected: Codex leaves no sure trace of the conversation /clear replaced. After a
// compaction Codex keeps what the user said, so no recent exchanges are added.
const part = process.argv[2];
const out = (text, event = 'SessionStart') => { if (text) console.log(hookOutput(event, { additionalContext: text })); };
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const project = input.cwd || process.env.CLAUDE_PROJECT_DIR;
  const source = input.source || 'startup', id = input.session_id;
  const quiet = source === 'resume' || source === 'fork';
  if (input.hook_event_name === 'SubagentStart' && part === 'subagent') out(SUBAGENT_NOTICE, 'SubagentStart');
  else if (input.hook_event_name === 'UserPromptSubmit' && part === 'inbox' && id && project && !input.agent_id) {
    const presence = readPresence(project, id);
    if (presence) writePresence(project, { thread_id: id, cwd: presence.cwd, engine: engineFrom(presence), transcript_path: presence.transcript_path });
    // Given first, then removed from the inbox (threads.mjs take).
    const waiting = take(project, id);
    if (waiting.messages.length) fs.writeSync(1, `${hookOutput('UserPromptSubmit', { additionalContext: waiting.messages.map(asMessage).join('\n\n') })}\n`);
    waiting.done();
  } else if (input.hook_event_name === 'SessionStart' && id && project) {
    const store = sessions(project, { host: 'codex' });
    const where = { conversation_id: id, session_name: process.env.HEAD_CONTEXT_SESSION, origins: [] };
    if (part === 'session') {
      register({ thread_id: id, cwd: project, transcript_path: input.transcript_path });
      try { writePresence(project, { thread_id: id, cwd: project, engine: engineOf(), transcript_path: input.transcript_path }); }
      catch (error) { console.error(`head-context: ${error.message}`); }
      const place = store.start({ ...where, info: { transcript_path: input.transcript_path } });
      let first = '';
      try { refreshCore(project); if (source === 'startup' || source === 'clear') first = guide(project, { host: 'codex' }); }
      catch (error) { console.error(`head-context: ${error.message}`); }
      if (!quiet) out([place ? store.parts(place).head : UNCONNECTED, first].filter(Boolean).join('\n\n'));
    } else if (quiet) {
      // nothing
    } else if (part === 'core') out(coreParts(project)[0] || '');
    else if (part === 'instructions') out(instructionsFor('codex'));
    else if (part === 'context') {
      const place = store.locate(where);
      if (place) out(store.parts(place, { budget: HOOK_BUDGET }).context);
    }
  }
} catch (error) {
  console.error(`head-context: ${error.message}`);
}
