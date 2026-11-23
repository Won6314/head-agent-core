import { safeRoot, registerCommand } from './wake-command.mjs';
// auto_approve only the plugin's own registration command, character for character.
// Everything else is "allow" (hand over to the next hook and agy's own policy); an empty
// answer would make agy deny the tool call.
export function decide(input, env = process.env) {
  const root = env.PLUGIN_ROOT;
  if (input?.toolCall?.name === 'run_command' && safeRoot(root) && input.toolCall.args?.CommandLine === registerCommand(root))
    return { decision: 'auto_approve', reason: 'head-context 깨우기 등록 명령' };
  return { decision: 'allow' };
}
