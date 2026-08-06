import { createSessionTransitions } from "../bin/session-transitions.mjs";
import childProcess from "node:child_process";
import { createRequire } from "node:module";
import { detectHerdrLocation, headDir, loadSessionRecord, mutateSessionRecord, projectRoot } from "../bin/render-runtime-config.mjs";
import { resolveToolSchema } from "./compact-recovery-core.mjs";

const require = createRequire(import.meta.url);
const { herdrBinary } = require("../herdr-runtime.cjs");

export function createHerdrRenameAdapter({ execFileSync = childProcess.execFileSync, environment = process.env } = {}) {
  return {
    renameTab(location, name) {
      if (!location?.tabId || !location?.socket) throw new Error("validated Herdr tab identity is required");
      const env = { ...environment, HERDR_SOCKET_PATH: location.socket };
      for (const key of Object.keys(env)) {
        if (/^HERDR_(?:SESSION|REMOTE)(?:_|$)|^HERDR_SOCKET_PATH$/i.test(key)) delete env[key];
      }
      env.HERDR_SOCKET_PATH = location.socket;
      execFileSync(herdrBinary(environment), ["tab", "rename", location.tabId, name], { encoding: "utf8", env });
    },
  };
}

export const HeadSessionCore = async ({ root: configuredRoot, directory, worktree, detectLocation, schema: providedSchema, transition: suppliedTransition, herdr: suppliedHerdr } = {}) => {
  const root = projectRoot(configuredRoot || directory || worktree);
  const schema = providedSchema || await resolveToolSchema();
  const transition = suppliedTransition || createSessionTransitions({
    headDirectory: headDir(root),
    identity: { live: () => (detectLocation || (() => detectHerdrLocation(process.env, undefined, root)))() },
    binding: {
      read: (sessionID) => loadSessionRecord(sessionID, root),
      write: (sessionID, record) => mutateSessionRecord(sessionID, root, () => record),
    },
    herdr: suppliedHerdr || createHerdrRenameAdapter(),
  });
  return {
    tool: {
      head_session: {
        description: "Rename the current logical Session, start its prepared Run, or finish its terminal Run.",
        args: {
          action: schema.enum(["rename", "start_run", "finish_run"]),
          new_name: schema.string().optional(),
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
