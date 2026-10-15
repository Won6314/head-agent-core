import { transition, report, userInstruction } from '../../core/state.mjs';
import { hostProcess } from './process.mjs';
export function event(project, input) {
  const conversation_id = input.session_id;
  const e = input.hook_event_name;
  if (e === 'SubagentStart' || e === 'SubagentStop') {
    report(project, { host: 'claude', parent_conversation_id: conversation_id, id: input.agent_id,
      name: input.agent_type, kind: 'native', status: e === 'SubagentStart' ? 'running' : 'ended' });
    return;
  }
  if (input.agent_id) return;
  const states = { SessionStart: 'waiting', UserPromptSubmit: 'working', Stop: 'waiting', SessionEnd: 'ended', PermissionRequest: 'blocked' };
  let status = states[e];
  if (input.tool_name === 'AskUserQuestion') status = e === 'PreToolUse' ? 'blocked' : e === 'PostToolUse' ? 'working' : undefined;
  if (status) transition(project, { host: 'claude', conversation_id, status, liveness: hostProcess(conversation_id) });
  if(e==='UserPromptSubmit')userInstruction(project,{host:'claude',conversation_id,text:input.prompt,
    is_user:!input.is_meta&&!input.is_system&&!input.synthetic&&input.user_type!=='internal'&&input.userType!=='internal'&&(!input.source||input.source==='user')});
}
