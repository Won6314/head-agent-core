#!/bin/bash
# Save a Claude session ID to the active HEAD session's restore block.

if [ -n "${HEAD_PROJECT_ROOT:-}" ]; then
  PROJECT_ROOT="$HEAD_PROJECT_ROOT"
else
  SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
fi

INPUT=$(cat)
SID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
[ -z "$SID" ] && exit 0

LOCATION=$(HEAD_PROJECT_ROOT="$PROJECT_ROOT" node "$PROJECT_ROOT/.claude/agents/head/opencode/bin/render-runtime-config.mjs" --location-json 2>/dev/null)
SESSION=$(echo "$LOCATION" | jq -r '.sessionName // empty')
case "$SESSION" in ""|"."|".."|*/*|*\\*) exit 0 ;; esac

SESSIONS_DIR="$PROJECT_ROOT/.claude/agents/head/sessions"
SESSION_DIR="$SESSIONS_DIR/$SESSION"
[ -d "$SESSION_DIR" ] || exit 0
SESSION_DIR=$(python3 - "$SESSIONS_DIR" "$SESSION_DIR" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve(strict=True)
child = Path(sys.argv[2]).resolve(strict=True)
if child.parent != root:
    raise SystemExit(1)
print(child)
PY
) || exit 0

python3 "$PROJECT_ROOT/.claude/hooks/upsert-restore-id.py" \
  --history "$SESSION_DIR/history.md" \
  --runtime claude \
  --id "$SID"
exit 0
