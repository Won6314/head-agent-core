---
name: restore-session
description: List and safely restore a validated HEAD Claude/OpenCode session into a fresh Herdr pane.
---

# Restore Session

The project's `scripts/resume-session.sh` is the canonical restore engine. This skill handles listing, explicit selection, dry-run verification, and reporting.

## Procedure

1. Resolve the current project root from the HEAD working directory and verify `<PROJECT_ROOT>/scripts/resume-session.sh` exists.
2. List available sessions:

```bash
"<PROJECT_ROOT>/scripts/resume-session.sh" --list
```

3. Show exact session name, state, update time, valid restore candidates, and live status. Ask the user to select the session and runtime when not already explicit.
4. Do not guess a fuzzy name or restore ID. Do not bypass invalid, duplicate, or collision warnings.
5. Verify a non-destructive plan:

```bash
"<PROJECT_ROOT>/scripts/resume-session.sh" "<SESSION_NAME>" --runtime "<claude|opencode>" --dry-run
```

6. If the plan exactly matches the user's selection, run the same command without `--dry-run`.
7. Report the exact Herdr location returned by the engine.

Do not reconstruct restore behavior manually from history or pane state. If the CLI fails, stop instead of continuing with hand-built Herdr or terminal commands.
