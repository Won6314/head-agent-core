// moved to packages/head-runtime/shared/compact-policy.mjs
export {
  BUDGET_CHARS,
  KEEP_FULL_TAIL,
  HEAD_CHARS,
  USER_TURNS_MARKER,
  collectCompactedUserTurns,
  formatCompactedUserTurns,
  stamp,
} from "../../../../head-runtime/shared/compact-policy.mjs";
export {
  messageTime,
  realUserTurn,
  extractCompactedUserTurns,
  loadCompactedUserTurns,
  saveCompactedUserTurns,
} from "../../../../head-runtime/opencode/compact-recovery.mjs";
