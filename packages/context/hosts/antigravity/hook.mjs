import fs from 'node:fs';
import { sessions } from '../../core/sessions.mjs';
import { coreParts, guide, refreshCore } from '../../core/project.mjs';
import { instructionsFor, SUBAGENT_NOTICE } from '../../core/mcp.mjs';
import { UNCONNECTED, HOOK_BUDGET } from '../../core/recovery.mjs';
import { locations, takeNotices } from '../../core/storage.mjs';
import { runtimeProblem } from '../../core/platform.mjs';
import { compactInstruction } from '../claude/compact.mjs';
import { register, registered } from './register.mjs';
import { writePresence, dropPresence, take } from './threads.mjs';
import { parentOf } from './subagent.mjs';
import { asMessage } from '../../core/inbox.mjs';
import { steps, checkpointOf, recentPart } from './transcript.mjs';
import { takeStart } from './start.mjs';

const hookOutput = (parts) => ({
  injectSteps: parts.filter(Boolean).map((text) => ({ systemMessage: { systemMessage: text } })),
});

export async function runHook() {
  let waiting;
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
      writePresence(project, { conversation_id: id, transcript_path: transcript, said: input.lastUserInput });
      if (start || restore) {
        refreshCore(project);
        parts.push(...coreParts(project));
        if (start) parts.push(instructionsFor('antigravity'));
        const problem = runtimeProblem();
        if (problem) parts.push(problem);
        else {
          const store = sessions(project, { host: 'antigravity' });
          const request = start ? takeStart(project, id) : null;
          if (request) {
            if (!store.names().includes(request.session)) throw new Error(`작업 세션 '${request.session}'이 없습니다.`);
            if (request.branch !== undefined)
              store.load({ name: request.session, branch: request.branch, conversation_id: id });
          }
          const where = {
            conversation_id: id,
            session_name: process.env.HEAD_CONTEXT_SESSION || request?.session,
          };
          const place = start
            ? store.start({ ...where, info: { transcript_path: transcript, entrypoint: 'antigravity-acp' } })
            : store.locate(where);
          if (place) {
            const content = store.parts(place, { budget: HOOK_BUDGET });
            parts.push(content.head, content.context);
          } else parts.push(UNCONNECTED);
        }
        if (start) parts.push(guide(project, { host: 'antigravity' }));
        if (restore) parts.push(recentPart(rows, transcript, { timeZone: locations(project).timezone }));
      }
    }
    if (event === 'PreInvocation') {
      if (!parent && input.lastUserInput?.trim() === '/compact' && !runtimeProblem()) parts.push(compactInstruction());
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
