#!/bin/bash
# Inject fixed HEAD recovery context. Compaction never writes canonical state.

if [ -n "${HEAD_PROJECT_ROOT:-}" ]; then
  PROJECT_ROOT="$HEAD_PROJECT_ROOT"
else
  SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
fi
HEAD_ROOT="$PROJECT_ROOT/.claude/agents/head"
SESSIONS_DIR="$HEAD_ROOT/sessions"
LOG_FILE="$HEAD_ROOT/opencode/state/logs/claude-session-start.log"
mkdir -p "$(dirname -- "$LOG_FILE")"

# quick_task children do not occupy the caller's HEAD tab.
if [ "${AGENT_TASK_QUICK:-}" = "1" ] && [ -n "${AGENT_TASK_AGENT:-}" ]; then
  case "$AGENT_TASK_AGENT" in *[!a-zA-Z0-9_]*) exit 0 ;; esac
  if [ "$AGENT_TASK_AGENT" = "head" ]; then
    HEAD_CONTEXT="$HEAD_ROOT/HEAD_CONTEXT.md"
    [ -f "$HEAD_CONTEXT" ] && cat "$HEAD_CONTEXT"
  else
    EXPERTISE="$PROJECT_ROOT/.claude/agents/$AGENT_TASK_AGENT/EXPERTISE.md"
    if [ -f "$EXPERTISE" ]; then
      echo "## EXPERTISE.md (accumulated learnings)"
      cat "$EXPERTISE"
    fi
  fi
  exit 0
fi

INPUT=$(cat)
SOURCE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('source',''))" 2>/dev/null)

# Resolve only this process's validated Herdr pane; never use focused state.
LOCATION=$(HEAD_PROJECT_ROOT="$PROJECT_ROOT" node "$HEAD_ROOT/opencode/bin/render-runtime-config.mjs" --location-json 2>/dev/null)
PANE_ID=$(echo "$LOCATION" | jq -r '.paneId // empty')
SESSION_NAME=$(echo "$LOCATION" | jq -r '.sessionName // empty')
[ -n "$PANE_ID" ] && [ -n "$SESSION_NAME" ] || exit 0
case "$SESSION_NAME" in ""|"."|".."|*/*|*\\*) exit 0 ;; esac

SESSION_DIR="$SESSIONS_DIR/$SESSION_NAME"
SESSION_DIR=$(python3 - "$SESSIONS_DIR" "$SESSION_DIR" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve(strict=True)
child = Path(sys.argv[2]).resolve(strict=True)
if child.parent != root or not child.is_dir():
    raise SystemExit(1)
print(child)
PY
) || exit 0

echo "[$(date '+%H:%M:%S')] SessionStart: SOURCE=$SOURCE PANE=$PANE_ID SESSION=$SESSION_NAME" >> "$LOG_FILE"

if [ "$SOURCE" != "compact" ]; then
  HEAD_CONTEXT="$HEAD_ROOT/HEAD_CONTEXT.md"
  [ -f "$HEAD_CONTEXT" ] && cat "$HEAD_CONTEXT"
fi

SESSION_CONTEXT_FILE="$SESSION_DIR/context.md"
SESSION_CONTEXT=""
if [ -f "$SESSION_CONTEXT_FILE" ]; then
  SESSION_CONTEXT=$(cat "$SESSION_CONTEXT_FILE" 2>/dev/null)
fi
if [ -n "$SESSION_CONTEXT" ]; then
  echo ""
  echo "---"
  echo ""
  echo "# Current Session: $SESSION_NAME"
  echo ""
  echo "$SESSION_CONTEXT"
fi

RUN_FILE="$SESSION_DIR/run.md"
RUN_CONTENT=""
if [ -f "$RUN_FILE" ]; then
  RUN_CONTENT=$(cat "$RUN_FILE" 2>/dev/null)
fi
if [ -n "$RUN_CONTENT" ]; then
  echo ""
  echo "---"
  echo ""
  echo "# Loaded File: $RUN_FILE"
  echo ""
  echo "$RUN_CONTENT"
fi

exit 0
