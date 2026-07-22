#!/bin/bash

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
SOURCE=$(echo "$INPUT" | jq -r '.source // empty')

if [ "$SOURCE" != "startup" ] && [ "$SOURCE" != "clear" ]; then
  exit 0
fi

if [ -n "${HEAD_PROJECT_ROOT:-}" ]; then
  PROJECT_ROOT="$HEAD_PROJECT_ROOT"
else
  SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
fi
LOCATION=$(HEAD_PROJECT_ROOT="$PROJECT_ROOT" node "$PROJECT_ROOT/.claude/agents/head/opencode/bin/render-runtime-config.mjs" --location-json 2>/dev/null)
PANE_ID=$(echo "$LOCATION" | jq -r '.paneId // empty')
[ -z "$PANE_ID" ] && exit 0

if [ -n "$SESSION_ID" ]; then
  PANE_MAP_DIR="$PROJECT_ROOT/.claude/agents/head/opencode/state/claude-pane-map"
  mkdir -p "$PANE_MAP_DIR"
  echo "$LOCATION" > "$PANE_MAP_DIR/$SESSION_ID.json"
  echo "[PANE REGISTER] Session: $SESSION_ID -> Pane: $PANE_ID at $(date)" >> "$PANE_MAP_DIR/register.log"
fi
