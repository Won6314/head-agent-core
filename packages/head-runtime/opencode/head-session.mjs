import { createSessionTransitions } from "../shared/session-transitions.mjs";
import { detectHerdrLocation, headDir, loadSessionRecord, projectRoot } from "../shared/context-composition.mjs";
import { resolveToolSchema } from "./compact-recovery.mjs";

export const HeadSessionCore = async ({ root: configuredRoot, directory, worktree, detectLocation, schema: providedSchema, transition: suppliedTransition } = {}) => {
  const root = projectRoot(configuredRoot || directory || worktree);
  const schema = providedSchema || await resolveToolSchema();
  const transition = suppliedTransition || createSessionTransitions({
    headDirectory: headDir(root),
    identity: { live: () => (detectLocation || (() => detectHerdrLocation(process.env, undefined, root)))() },
    binding: {
      read: (sessionID) => loadSessionRecord(sessionID, root),
    },
  });
  return {
    tool: {
      head_session: {
          description: "Start the current Session's prepared Run, finish its terminal Run, or stop a user-authorized active Run.",
          args: {
          action: schema.enum(["start_run", "finish_run", "stop_run"]),
          run_id: schema.string().optional(),
          session_handoff: schema.string().optional(),
        },
        async execute(args, context) {
          const result = transition({ ...args, sessionID: context?.sessionID });
          return result.ok
            ? `Session ${result.session}: ${result.mode}, active Run ${result.activeRun || "none"}, generation ${result.generation}.`
            : `head_session failed: ${result.code}.`;
        },
      },
    },
  };
};

export default Object.freeze({
  id: "head-core-session",
  server: HeadSessionCore,
});
