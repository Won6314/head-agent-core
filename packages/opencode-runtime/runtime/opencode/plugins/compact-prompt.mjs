// moved to packages/head-runtime/shared/compact-policy.mjs
export {
  POINTER,
  overridePointerOnly,
  overrideSinceCheckpoint,
  overrideCurrentOnly,
  lastCheckpointIso,
  chooseCompactPrompt,
} from "../../../../head-runtime/shared/compact-policy.mjs";
export { userTurnsSince } from "../../../../head-runtime/opencode/compact-recovery.mjs";
