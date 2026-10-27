import fs from 'node:fs';
import { sessions } from '../../core/sessions.mjs';
import { HOOK_BUDGET, UNCONNECTED } from '../../core/recovery.mjs';
import { instructions } from '../../core/mcp.mjs';
import { guide, refreshCore, coreParts } from '../../core/project.mjs';
import { register } from './register.mjs';

// Codex SessionStart, one process per part like the Claude hook. Codex says which start
// it is (source: startup, resume, clear, compact, fork); hooks.json turns its output cap off.
//   core         — the core instructions, whole.
//   instructions — what the tool server says about its tools (Codex does not give a
//     server's instructions to the model at the start).
//   session      — registers the conversation's folder for the tool server, then the
//     work session part (or the not-connected line) and the first-run guide.
//   context      — the work context.
// resume and fork give nothing: the conversation already holds it. /clear starts
// unconnected: Codex leaves no sure trace of the conversation /clear replaced. After a
// compaction Codex keeps what the user said, so no recent exchanges are added.
const part = process.argv[2];
const out = text => { if (text) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } })); };
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const project = input.cwd || process.env.CLAUDE_PROJECT_DIR;
  const source = input.source || 'startup', id = input.session_id;
  const quiet = source === 'resume' || source === 'fork';
  if (input.hook_event_name === 'SessionStart' && id && project) {
    const store = sessions(project, { host: 'codex' });
    const where = { conversation_id: id, session_name: process.env.HEAD_CONTEXT_SESSION, origins: [] };
    if (part === 'session') {
      register({ thread_id: id, cwd: project, transcript_path: input.transcript_path });
      const place = store.start({ ...where, info: { transcript_path: input.transcript_path } });
      let first = '';
      try { refreshCore(project); if (source === 'startup' || source === 'clear') first = guide(project, { host: 'codex' }); }
      catch (error) { console.error(`head-context: ${error.message}`); }
      if (!quiet) out([place ? store.parts(place).head : UNCONNECTED, first].filter(Boolean).join('\n\n'));
    } else if (quiet) {
      // nothing
    } else if (part === 'core') out(coreParts(project)[0] || '');
    else if (part === 'instructions') out(instructions);
    else if (part === 'context') {
      const place = store.locate(where);
      if (place) out(store.parts(place, { budget: HOOK_BUDGET }).context);
    }
  }
} catch (error) {
  console.error(`head-context: ${error.message}`);
}
