import fs from 'node:fs';
import { sessions } from '../../core/sessions.mjs';
import { HOOK_BUDGET, UNCONNECTED } from '../../core/recovery.mjs';
import { event } from './state.mjs';
import { ancestry } from './recovery.mjs';
import { requestLoad } from './channel.mjs';
import { guide, refreshCore } from '../../core/project.mjs';

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const project = process.env.CLAUDE_PROJECT_DIR || input.cwd;
  const origins = input.hook_event_name === 'SessionStart' ? ancestry(project, input) : [];
  event(project, input);
  const store = sessions(project, { host: 'claude' });
  if (input.hook_event_name === 'PreToolUse' &&
      /^mcp__plugin_head-context_context__session_(list|load|create|save|finish|branch|read)$/.test(input.tool_name)) {
    console.log(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PreToolUse', updatedInput: { ...input.tool_input, conversation_id: input.session_id }
    } }));
  } else if (input.hook_event_name === 'SessionEnd') {
    // The conversation is gone: close the branch it was holding and merge it into main.
    // /clear is the one end that is a handover — the start that follows it takes this
    // same place, so closing it here would merge a place that is still being worked in.
    if (input.reason !== 'clear') store.closed({ conversation_id: input.session_id });
  } else if (input.hook_event_name === 'SessionStart') {
    const source = input.source || 'startup';
    const started = store.start({ conversation_id: input.session_id,
      session_name: process.env.HEAD_CONTEXT_SESSION || input.session_title, title: input.session_title,
      origins, source });
    // First run: refresh the project copy of the core (applies next start, since CLAUDE.md
    // is read before this hook), and on a fresh start add the short setup/survey guide.
    let first = '';
    try { refreshCore(project); if (source === 'startup' || source === 'clear') first = guide(project); }
    catch (error) { console.error(`head-context: ${error.message}`); }
    const join = text => [text, first].filter(Boolean).join('\n\n');
    // Not connected to a session: say so; the instructions tell the model to match the user's work.
    let additionalContext = join(started ? started.text : UNCONNECTED);
    if (started?.text && JSON.stringify(additionalContext).length > HOOK_BUDGET) {
      // Over the host cap: ask for the load instead of carrying it. Where a channel is
      // registered this conversation's own MCP process delivers the same text as a turn.
      requestLoad(project, input.session_id);
      additionalContext = join(`세션: ${started.session}\n자리: ${started.stem === 'main' ? '메인(색인)' : '브랜치 ' + started.stem}\n[세션 로드가 훅 상한을 넘었습니다. session_load를 호출해 이 자리의 기록을 받으세요. head-context 채널이 열려 있으면 같은 내용이 메시지로 먼저 들어올 수도 있습니다.]`);
    }
    if (additionalContext) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }));
  }
} catch (error) {
  console.error(`head-context: ${error.message}`);
  // Observational hook failures never block a conversation.
}
