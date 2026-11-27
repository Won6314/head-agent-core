import fs from 'node:fs';
import path from 'node:path';
import { sessions } from '../../core/sessions.mjs';
import { coreParts, guide, refreshCore } from '../../core/project.mjs';
import { instructionsFor, SUBAGENT_NOTICE } from '../../core/mcp.mjs';
import { UNCONNECTED, HOOK_BUDGET } from '../../core/recovery.mjs';
import { locations, takeNotices } from '../../core/storage.mjs';
import { runtimeProblem, processOf } from '../../core/platform.mjs';
import { compactInstruction } from '../claude/compact.mjs';
import { register, registered } from './register.mjs';
import { writePresence, dropPresence, take } from './threads.mjs';
import { parentOf } from './subagent.mjs';
import { asMessage } from '../../core/inbox.mjs';
import { steps, checkpointOf, recentPart, agySaves } from './transcript.mjs';
import { takeStart } from './start.mjs';
import { claimAsk, appData } from './wake-key.mjs';
import { clearedFrom } from './cleared.mjs';
import { safeRoot, registerCommand } from './wake-command.mjs';

const hookOutput = (parts) => ({
  injectSteps: parts.filter(Boolean).map((text) => ({ systemMessage: { systemMessage: text } })),
});

// A terminal agy (not ACP, not print mode, not remote agents) can be woken only after it hands
// its LS address and CSRF token to a command the model runs. Ask once per agy process.
const REMOTE_OR_PRINT = new Set(['p', 'print', 'prompt', 'remote-agent']);
const terminalAgy = (argv) =>
  Array.isArray(argv) &&
  !argv.includes('acp') &&
  !argv.some((arg) => /^--?[a-z-]+(=.*)?$/.test(arg) && REMOTE_OR_PRINT.has(arg.replace(/^--?/, '').split('=')[0]));
const WAKE_ASK = (
  command,
) => `head-context 깨우기 등록: 이 agy 프로세스는 아직 등록되지 않아, 다른 대화가 보낸 메시지로 이 대화를 깨울 수 없습니다. 사용자 물음에 답하기 전에 run_command로 아래 명령을 글자 그대로 한 번만 실행하세요. 인자를 붙이거나 따옴표·경로를 고치지 마세요. 출력은 한 줄이며 사용자에게 따로 설명하지 않아도 됩니다. 실행하지 못했거나 거절되면 다시 시도하지 말고 사용자 물음에 답하세요.
${command}`;

export async function runHook() {
  let waiting;
  let ask = '';
  let presence;
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const { conversationId: id, cwd: project, transcriptPath: transcript, hookEventName: event } = input;
    if (!['SessionStart', 'PreInvocation'].includes(event)) return;
    const previous = registered(id);
    const start = event === 'SessionStart';
    const parent = !start && previous && 'parent' in previous ? previous.parent : parentOf(input);
    const rows = steps(transcript),
      checkpoint = checkpointOf(rows);
    const restore = !start && checkpoint !== null && checkpoint !== previous?.checkpoint;
    const parts = [];
    if (parent) {
      dropPresence(project, id);
      if (start || restore) parts.push(SUBAGENT_NOTICE);
    } else {
      // Register even on resume; session/load has no SessionStart, but none of the
      // context is repeated unless a new CHECKPOINT actually appeared.
      presence = writePresence(project, {
        conversation_id: id,
        transcript_path: transcript,
        said: input.lastUserInput,
      });
      if (start || restore) {
        refreshCore(project);
        parts.push(...coreParts(project));
        if (start) parts.push(instructionsFor('antigravity'));
        const problem = runtimeProblem();
        let recovery = '',
          clearedRecent = '';
        if (problem) parts.push(problem);
        else {
          const store = sessions(project, { host: 'antigravity' });
          const request = start ? takeStart(project, id) : null;
          const cleared = start && !request ? clearedFrom(id) : null;
          if (request) {
            if (!store.names().includes(request.session)) throw new Error(`작업 세션 '${request.session}'이 없습니다.`);
            if (request.branch !== undefined)
              store.load({ name: request.session, branch: request.branch, conversation_id: id });
          }
          const where = {
            conversation_id: id,
            session_name: process.env.HEAD_CONTEXT_SESSION || request?.session,
            origins: cleared ? [{ conversation_id: cleared, kind: 'clear' }] : [],
          };
          const place = start
            ? store.start({ ...where, info: { transcript_path: transcript, entrypoint: 'antigravity-acp' } })
            : store.locate(where);
          if (place) {
            const content = store.parts(place, { budget: HOOK_BUDGET });
            parts.push(content.head, content.context);
          } else parts.push(UNCONNECTED);
          const defaultTranscript = (cid) =>
            path.join(appData(), 'brain', cid, '.system_generated', 'logs', 'transcript_full.jsonl');
          const read = (cid, file) => agySaves(cid === id ? rows : steps(file || defaultTranscript(cid)));
          if (restore) recovery = store.recovery({ place, source: 'compact', starts: [{ id, transcript }], read });
          else if (cleared && place)
            recovery = store.recovery({ place, source: 'clear', starts: [{ id, transcript }, { id: cleared }], read });
          if (cleared && place) {
            const prevFile = store.connection(cleared)?.transcript_path || defaultTranscript(cleared);
            clearedRecent = recentPart(steps(prevFile), prevFile, { timeZone: locations(project).timezone });
          }
        }
        if (start) parts.push(guide(project, { host: 'antigravity' }));
        if (recovery) parts.push(recovery);
        if (clearedRecent) parts.push(clearedRecent);
        if (restore) parts.push(recentPart(rows, transcript, { timeZone: locations(project).timezone }));
      }
    }
    if (event === 'PreInvocation') {
      if (!parent && input.lastUserInput?.trim() === '/compact' && !runtimeProblem()) parts.push(compactInstruction());
      if (!parent && input.lastUserInput?.trim() !== '/compact') {
        try {
          const root = process.env.PLUGIN_ROOT;
          if (
            safeRoot(root) &&
            presence?.pid &&
            presence?.start &&
            terminalAgy(processOf(presence.pid)?.argv) &&
            claimAsk({ pid: presence.pid, start: presence.start })
          )
            parts.push(WAKE_ASK(registerCommand(root)));
        } catch (error) {
          console.error(`head-context: 깨우기 등록 요청을 넣지 못했습니다(${error.code || error.name}).`);
        }
      }
      // A wake during a running turn reaches a later invocation, not zero.
      // Claim/ack makes each inbox message appear only once across invocations.
      waiting = take(project, id);
      parts.push(...waiting.messages.map(asMessage));
      if (waiting.broken.length)
        parts.push(`head-context: 읽을 수 없는 메시지를 따로 두었습니다: ${waiting.broken.join(', ')}`);
    }
    parts.push(...takeNotices());
    if (parts.some(Boolean)) fs.writeSync(1, `${JSON.stringify(hookOutput(parts))}\n`);
    // Output is delivered before ack/checkpoint advancement. If the process dies
    // between them recovery may repeat once, but does not silently drop the data.
    waiting?.done();
    register(id, {
      cwd: project,
      checkpoint: start || restore ? checkpoint : (previous?.checkpoint ?? null),
      parent: parent ?? null,
    });
  } catch (error) {
    console.error(`head-context: ${error.message}`);
    fs.writeSync(
      1,
      `${JSON.stringify(hookOutput([`head-context: 작업 맥락을 넣지 못했습니다: ${error.message}`, ...takeNotices()]))}\n`,
    );
  }
}
