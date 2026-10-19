import fs from 'node:fs';
import path from 'node:path';
import { sessions } from '../../core/sessions.mjs';
import { HOOK_BUDGET, UNCONNECTED } from '../../core/recovery.mjs';
import { locations } from '../../core/storage.mjs';
import { ancestry } from './recovery.mjs';
import { hostInfo } from './process.mjs';
import { recentPart } from './recent.mjs';
import { compactInstruction } from './compact.mjs';
import { SUBAGENT_NOTICE } from '../../core/mcp.mjs';
import { guide, refreshCore } from '../../core/project.mjs';

// PreToolUse fills the host fields of the head-context tools: the conversation, and
// for a task running inside it (fork, subagent) its agent id (writes are refused there).
// SubagentStart tells such a task once that it reads records but does not write them. PreCompact turns the
// host's summary into one pointer line. SessionStart runs three times, once per part,
// because the host caps each hook output separately (about 10,000 characters each,
// measured on 2.1.303) and runs them side by side in no fixed order:
//   session — the work session, context.md whole, this conversation's work branch. It
//     gives the conversation its place and must always arrive.
//   context — open work branches, to-dos, the record map, this branch's newest saves;
//     over the cap it is cut down (fewer saves, shorter bodies, a shorter map).
//   recent  — after a compact or /clear only: the last exchanges as they were said.
const TOOL = /^mcp__plugin_head-context_context__session_/;
const part = process.argv[2];
const out = (event, text) => { if (text) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } })); };
const fit = (text, budget, shorter) => (text.length > budget ? shorter() : text);
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const project = process.env.CLAUDE_PROJECT_DIR || input.cwd;
  const event = input.hook_event_name, source = input.source || 'startup';
  if (event === 'PreToolUse' && TOOL.test(input.tool_name || '')) {
    const { agent_id: _ignored, ...rest } = input.tool_input || {};
    const updatedInput = { ...rest, conversation_id: input.session_id, ...(input.agent_id ? { agent_id: input.agent_id } : {}) };
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput } }));
  } else if (event === 'SubagentStart') {
    // A task inside this conversation (a fork or a subagent): one notice, nothing else.
    out('SubagentStart', SUBAGENT_NOTICE);
  } else if (event === 'PreCompact') {
    process.stdout.write(compactInstruction());
  } else if (event === 'SessionStart' && !input.agent_id) {
    const store = sessions(project, { host: 'claude', hostInfo });
    const quiet = source === 'resume' || source === 'fork'; // the conversation already holds its context
    const where = () => ({ conversation_id: input.session_id, session_name: process.env.HEAD_CONTEXT_SESSION,
      origins: store.connection(input.session_id) ? [] : ancestry(project, input) });
    if (part === 'session') {
      const info = { transcript_path: input.transcript_path, ...(input.session_title ? { title: input.session_title } : {}) };
      const place = store.start({ ...where(), info });
      // First run: refresh the project copy of the core (applies next start, since CLAUDE.md
      // is read before this hook), and on a fresh start add the short setup/survey guide.
      let first = '';
      try { refreshCore(project); if (source === 'startup' || source === 'clear') first = guide(project); }
      catch (error) { console.error(`head-context: ${error.message}`); }
      let head = '';
      if (!place) head = UNCONNECTED;
      else if (!quiet) {
        const { head: text, contextFile } = store.parts(place);
        const tail = `\n…(context.md 뒷부분 생략 — 전문: ${contextFile})`;
        head = fit(text, HOOK_BUDGET - first.length - 2, () => text.slice(0, Math.max(0, HOOK_BUDGET - first.length - tail.length - 2)) + tail);
      }
      out('SessionStart', [head, first].filter(Boolean).join('\n\n'));
    } else if (part === 'context' && !quiet) {
      const place = store.locate(where());
      if (place) {
        // Cut down in order to fit; the open branches, the to-dos and the last next stay.
        out('SessionStart', store.parts(place, { budget: HOOK_BUDGET }).context);
      }
    } else if (part === 'recent' && (source === 'compact' || source === 'clear')) {
      // After /clear the exchanges are in the conversation /clear replaced.
      let transcript = input.transcript_path;
      if (source === 'clear') {
        const before = ancestry(project, input).find(link => link.kind === 'clear')?.conversation_id;
        const known = before && store.connection(before);
        transcript = known?.transcript_path || (before && input.transcript_path ? path.join(path.dirname(input.transcript_path), `${before}.jsonl`) : null);
      }
      if (transcript) out('SessionStart', recentPart(transcript, { timeZone: locations(project).timezone, budget: HOOK_BUDGET }));
    }
  }
} catch (error) {
  console.error(`head-context: ${error.message}`);
  // Hook failures never block a conversation.
}
