import fs from 'node:fs';
import { sessions } from '../../core/sessions.mjs';
import { HOOK_BUDGET } from '../../core/recovery.mjs';
import { event } from './state.mjs';
import { inheritedFork } from './recovery.mjs';
import { requestLoad, previousConversation } from './channel.mjs';
import { guide, refreshCore } from '../../core/project.mjs';

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const project = process.env.CLAUDE_PROJECT_DIR || input.cwd;
  const parent = input.hook_event_name === 'SessionStart' && inheritedFork(project, input);
  event(project, input);
  if (input.hook_event_name === 'PreToolUse' &&
      /^mcp__plugin_head-context_context__session_(list|load|create|save|finish|branch|read)$/.test(input.tool_name)) {
    console.log(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PreToolUse', updatedInput: { ...input.tool_input, conversation_id: input.session_id }
    } }));
  } else if (input.hook_event_name === 'SessionStart') {
    const source = input.source || 'startup';
    const from = typeof parent === 'string' ? parent : source === 'clear' ? previousConversation(project, input.session_id) : null;
    const started = sessions(project, { host: 'claude' }).start({ conversation_id: input.session_id,
      session_name: process.env.HEAD_CONTEXT_SESSION || input.session_title, from_conversation_id: from,
      source, inherited_context: Boolean(parent) });
    // First run: refresh the project copy of the core (applies next start, since CLAUDE.md
    // is read before this hook), and on a fresh start add the short setup/survey guide.
    let first = '';
    try { refreshCore(project); if (source === 'startup' || source === 'clear') first = guide(project); }
    catch (error) { console.error(`head-context: ${error.message}`); }
    const join = text => [text, first].filter(Boolean).join('\n\n');
    let additionalContext = join(started?.text || '');
    if (started?.text && JSON.stringify(additionalContext).length > HOOK_BUDGET) {
      // Over the host cap: the conversation's MCP process sends the same load as a channel turn.
      requestLoad(project, input.session_id);
      additionalContext = join(`세션: ${started.session}\n자리: ${started.stem === 'main' ? '메인' : '브랜치 ' + started.stem}\n[세션 로드가 훅 상한을 넘어 head-context 채널 메시지로 이어서 들어옵니다. 들어오지 않으면 session_load를 호출하세요.]`);
    }
    if (additionalContext) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }));
  }
} catch (error) {
  console.error(`head-context: ${error.message}`);
  // Observational hook failures never block a conversation.
}
