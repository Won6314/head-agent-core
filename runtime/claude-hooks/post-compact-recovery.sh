#!/bin/bash
# Inject the fixed HEAD session context and run, then persist compact summaries.

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

if [ "$SOURCE" != "compact" ]; then
  exit 0
fi

TRANSCRIPT_PATH=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('transcript_path',''))" 2>/dev/null)
[ -n "$TRANSCRIPT_PATH" ] || exit 0

BASE_SIZE=$(stat -f%z "$TRANSCRIPT_PATH" 2>/dev/null || echo 0)
SAFE_PANE=$(echo "$PANE_ID" | tr -cd 'A-Za-z0-9_-')
WATCH_PID_FILE="/tmp/compact-watch-$SAFE_PANE.pid"
if [ -f "$WATCH_PID_FILE" ]; then
  kill "$(cat "$WATCH_PID_FILE")" 2>/dev/null
  rm -f "$WATCH_PID_FILE"
fi

(
  # First accept only a fresh compact summary already present in the transcript.
  SUMMARY=$(python3 - "$TRANSCRIPT_PATH" <<'PY'
import datetime, json, sys

path = sys.argv[1]
try:
    lines = open(path, encoding="utf-8").read().splitlines()
except OSError:
    raise SystemExit(0)
now = datetime.datetime.now(datetime.timezone.utc)
for line in reversed(lines):
    try:
        item = json.loads(line)
    except Exception:
        continue
    if not item.get("isCompactSummary"):
        continue
    try:
        created = datetime.datetime.fromisoformat(item.get("timestamp", "").replace("Z", "+00:00"))
        if (now - created).total_seconds() > 600:
            break
    except ValueError:
        break
    content = (item.get("message") or {}).get("content", "")
    if isinstance(content, list):
        content = "\n".join(part.get("text", "") for part in content if isinstance(part, dict))
    print(content)
    break
PY
)

  parse_appended() {
    python3 - "$TRANSCRIPT_PATH" "$BASE_SIZE" <<'PY'
import json, sys

path, offset = sys.argv[1], int(sys.argv[2])
try:
    with open(path, "rb") as handle:
        handle.seek(offset)
        text = handle.read().decode("utf-8", "replace")
except OSError:
    raise SystemExit(0)
lines = text.splitlines()
if not text.endswith("\n") and lines:
    lines = lines[:-1]
summary = ""
for line in lines:
    try:
        item = json.loads(line)
    except Exception:
        continue
    if not item.get("isCompactSummary"):
        continue
    content = (item.get("message") or {}).get("content", "")
    if isinstance(content, list):
        content = "\n".join(part.get("text", "") for part in content if isinstance(part, dict))
    if content:
        summary = content
if summary:
    print(summary)
PY
  }

  if [ -z "$SUMMARY" ]; then
    for _ in $(seq 1 10800); do
      CURRENT_SIZE=$(stat -f%z "$TRANSCRIPT_PATH" 2>/dev/null || echo 0)
      if [ "$CURRENT_SIZE" -gt "$BASE_SIZE" ]; then
        SUMMARY=$(parse_appended)
        if [ -n "$SUMMARY" ]; then
          sleep 2
          LATER=$(parse_appended)
          [ -n "$LATER" ] && SUMMARY="$LATER"
          break
        fi
      fi
      sleep 2
    done
  fi

  if [ -n "$SUMMARY" ]; then
    echo "$SUMMARY" | python3 "$PROJECT_ROOT/.claude/hooks/compact-session-update.py" \
      --project-root "$PROJECT_ROOT" \
      --session "$SESSION_NAME"
    echo "[$(date '+%H:%M:%S')] compact summary persisted: session=$SESSION_NAME chars=${#SUMMARY}" >> "$LOG_FILE"
  else
    echo "[$(date '+%H:%M:%S')] compact summary not found after transcript watch: $TRANSCRIPT_PATH" >> "$LOG_FILE"
  fi
  rm -f "$WATCH_PID_FILE"
) &
echo $! > "$WATCH_PID_FILE"
exit 0
