# head-runtime

Neutral Core runtime package. Claude and OpenCode share meaning here; each runtime keeps its own connection.

## Ownership

| Role | Path | Meaning |
|---|---|---|
| Shared implementation | `shared/` | Session/Run recovery, compact policy, transitions, ledger, prompt composition, work-items, Herdr. One implementation each. |
| Claude adapter | `claude/` | Hook/CLI wrappers: session recovery, PreCompact prompt, compact user turns, restore-id upsert. |
| OpenCode adapter | `opencode/` | Plugin entrypoints: compact recovery, head session, head-core-first, save-session-id. |

## Compatibility paths

These files re-export the shared or adapter implementation so current imports keep working:

- `packages/opencode-runtime/runtime/opencode/bin/session-lifecycle.mjs`
- `packages/opencode-runtime/runtime/opencode/bin/semantic-run.mjs`
- `packages/opencode-runtime/runtime/opencode/bin/claude-compaction-recovery.mjs`
- `packages/opencode-runtime/runtime/opencode/bin/render-runtime-config.mjs`
- `packages/opencode-runtime/runtime/opencode/bin/session-transitions.mjs`
- `packages/opencode-runtime/runtime/opencode/bin/checkpoint-ledger.mjs`
- `packages/opencode-runtime/runtime/opencode/bin/work-items.mjs`
- `packages/opencode-runtime/runtime/opencode/herdr-runtime.cjs`
- `packages/opencode-runtime/runtime/opencode/plugins/compact-prompt.mjs`
- `packages/opencode-runtime/runtime/opencode/plugins/compact-user-turns.mjs`
- `packages/opencode-runtime/runtime/opencode/plugins/compact-recovery-core.mjs`
- `packages/opencode-runtime/runtime/opencode/plugins/compact-recovery.mjs`
- `packages/opencode-runtime/runtime/opencode/plugins/head-session-core.mjs`
- `packages/opencode-runtime/runtime/opencode/plugins/head-session.mjs`
- `packages/opencode-runtime/runtime/opencode/plugins/head-core-first.mjs`
- `packages/opencode-runtime/runtime/opencode/save-opencode-session-id.js`
- `packages/opencode-runtime/runtime/claude-hooks/upsert-restore-id.py`

Do not add a second implementation at those paths.
