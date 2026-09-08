// moved to packages/head-runtime/opencode/compact-recovery.mjs
export {
  CompactRecovery,
  POINTER,
  USER_TURNS_MARKER,
  CONTINUATION_IDLE_POLL_INTERVAL_MS,
  CONTINUATION_IDLE_POLL_TIMEOUT_MS,
  SESSION_CONTEXT_MARKER,
  latestUserModel,
  sessionIsIdle,
  compactProjection,
  isHeadCoreSystemEntry,
  placeSessionContext,
  placeUserTurns,
  resolveToolSchema,
} from "../../../../head-runtime/opencode/compact-recovery.mjs";
