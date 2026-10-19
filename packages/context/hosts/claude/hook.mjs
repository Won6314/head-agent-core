import fs from 'node:fs';
import { sessions } from '../../core/sessions.mjs';
import { HOOK_BUDGET, UNCONNECTED } from '../../core/recovery.mjs';
import { ancestry } from './recovery.mjs';
import { hostInfo } from './process.mjs';
import { guide, refreshCore } from '../../core/project.mjs';

// Two events only. PreToolUse fills the host fields of the head-context tools: the
// conversation, and inside a fork or subagent its agent id (writes are refused there).
// SessionStart gives the conversation its place and puts the work context back.
const TOOL = /^mcp__plugin_head-context_context__session_/;
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const project = process.env.CLAUDE_PROJECT_DIR || input.cwd;
  if (input.hook_event_name === 'PreToolUse' && TOOL.test(input.tool_name || '')) {
    const { agent_id: _ignored, ...rest } = input.tool_input || {};
    const updatedInput = { ...rest, conversation_id: input.session_id, ...(input.agent_id ? { agent_id: input.agent_id } : {}) };
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput } }));
  } else if (input.hook_event_name === 'SessionStart' && !input.agent_id) {
    const store = sessions(project, { host: 'claude', hostInfo });
    const source = input.source || 'startup';
    const origins = store.connection(input.session_id) ? [] : ancestry(project, input);
    const info = { transcript_path: input.transcript_path, ...(input.session_title ? { title: input.session_title } : {}) };
    const started = store.start({ conversation_id: input.session_id, session_name: process.env.HEAD_CONTEXT_SESSION, origins, source, info });
    // First run: refresh the project copy of the core (applies next start, since CLAUDE.md
    // is read before this hook), and on a fresh start add the short setup/survey guide.
    let first = '';
    try { refreshCore(project); if (source === 'startup' || source === 'clear') first = guide(project); }
    catch (error) { console.error(`head-context: ${error.message}`); }
    const join = text => [text, first].filter(Boolean).join('\n\n');
    let additionalContext = join(started ? started.text : UNCONNECTED);
    if (started?.text && JSON.stringify(additionalContext).length > HOOK_BUDGET) {
      // Over the host cap: the model is told to ask for the same text with session_load.
      additionalContext = join(`작업 세션: ${started.session}${started.stem === 'main' ? '' : ` · 작업 브랜치: ${started.stem}`}\n[작업 맥락이 시작 안내 상한을 넘었습니다. session_load를 불러 받으세요.]`);
    }
    if (additionalContext) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }));
  }
} catch (error) {
  console.error(`head-context: ${error.message}`);
  // Hook failures never block a conversation.
}
