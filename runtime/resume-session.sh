#!/bin/bash
# Resume a HEAD conversation into a fresh live Herdr pane.
# Usage: scripts/resume-session.sh <session_name> [--runtime claude|opencode] [--dry-run]

set -euo pipefail

SESSION_NAME="${1:-}"
RUNTIME=""
DRY_RUN=false
if [ -n "${HEAD_PROJECT_ROOT:-}" ]; then
  PROJECT_ROOT="$HEAD_PROJECT_ROOT"
else
  SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
fi

if [ "$SESSION_NAME" = "--list" ]; then
  python3 - "$PROJECT_ROOT/.claude/agents/head/sessions" <<'PY'
import os, re, sys

root = sys.argv[1]
for name in sorted(os.listdir(root)):
    session = os.path.join(root, name)
    history = os.path.join(session, "history.md")
    if not os.path.isdir(session):
        continue
    text = open(history, encoding="utf-8").read() if os.path.isfile(history) else ""
    def field(key):
        match = re.search(rf"^{key}:[ \t]*(\S+)[ \t]*$", text, re.M)
        return match.group(1) if match else ""
    print(f"{name}\t{field('last_runtime')}\t{field('claude')}\t{field('opencode')}")
PY
  exit 0
fi

shift || true
while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime) RUNTIME="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

case "$SESSION_NAME" in
  ""|"."|".."|*/*|*\\*) echo "Usage: $0 <session_name> [--runtime claude|opencode] [--dry-run]" >&2; exit 1 ;;
esac

HEAD_DIR="$PROJECT_ROOT/.claude/agents/head"
SESSIONS_DIR="$HEAD_DIR/sessions"
SESSION_DIR="$SESSIONS_DIR/$SESSION_NAME"
[ -d "$SESSION_DIR" ] || { echo "Session not found: $SESSION_NAME" >&2; exit 1; }
SESSION_DIR=$(python3 - "$SESSIONS_DIR" "$SESSION_DIR" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve(strict=True)
child = Path(sys.argv[2]).resolve(strict=True)
if child.parent != root:
    raise SystemExit(1)
print(child)
PY
) || { echo "Invalid session path: $SESSION_NAME" >&2; exit 1; }

HISTORY="$SESSION_DIR/history.md"
META="$SESSION_DIR/meta.json"
read -r SAVED_RUNTIME CLAUDE_ID OPENCODE_ID < <(python3 - "$HISTORY" "$META" <<'PY'
import json, os, re, sys

history, meta = sys.argv[1:]
text = open(history, encoding="utf-8").read() if os.path.isfile(history) else ""
def field(name):
    match = re.search(rf"^{name}:[ \t]*(\S+)[ \t]*$", text, re.M)
    return match.group(1) if match else ""
claude = field("claude")
if not claude and os.path.isfile(meta):
    try:
        claude = json.load(open(meta, encoding="utf-8")).get("conversationId", "")
    except Exception:
        pass
print(field("last_runtime") or "-", claude or "-", field("opencode") or "-")
PY
)
[ "$SAVED_RUNTIME" = "-" ] && SAVED_RUNTIME=""
[ "$CLAUDE_ID" = "-" ] && CLAUDE_ID=""
[ "$OPENCODE_ID" = "-" ] && OPENCODE_ID=""
[ -n "$RUNTIME" ] || RUNTIME="$SAVED_RUNTIME"
[ -n "$RUNTIME" ] || RUNTIME="claude"

case "$RUNTIME" in
  claude) SESSION_ID="$CLAUDE_ID"; COMMAND=(claude --resume "$CLAUDE_ID" --dangerously-skip-permissions) ;;
  opencode) SESSION_ID="$OPENCODE_ID"; COMMAND=(opencode -s "$OPENCODE_ID") ;;
  *) echo "Invalid runtime: $RUNTIME" >&2; exit 1 ;;
esac
[ -n "$SESSION_ID" ] || { echo "No $RUNTIME restore ID for '$SESSION_NAME'." >&2; exit 1; }

if [ "$DRY_RUN" = true ]; then
  printf '{"action":"create-or-reuse-tab","session":"%s","runtime":"%s","id":"%s"}\n' "$SESSION_NAME" "$RUNTIME" "$SESSION_ID"
  exit 0
fi

[ -n "${HERDR_SOCKET_PATH:-}" ] && [ -n "${HERDR_WORKSPACE_ID:-}" ] || { echo "Run this command from a live Herdr HEAD pane." >&2; exit 1; }
HERDR_BIN="${HERDR_BIN:-$(command -v herdr)}"
[ -x "$HERDR_BIN" ] || { echo "Herdr executable not found." >&2; exit 1; }

SNAPSHOT=$("$HERDR_BIN" api snapshot)
TAB_ID=$(printf '%s' "$SNAPSHOT" | python3 -c 'import json,sys; d=json.load(sys.stdin); s=d.get("result",{}).get("snapshot") or d.get("snapshot") or {}; w,label=sys.argv[1:]; tabs=[t for t in s.get("tabs",[]) if t.get("workspace_id")==w and (t.get("label") or t.get("name"))==label]; print((tabs[0].get("tab_id") or tabs[0].get("id")) if len(tabs)==1 else "")' "$HERDR_WORKSPACE_ID" "$SESSION_NAME")
if [ -z "$TAB_ID" ]; then
  CREATED=$("$HERDR_BIN" tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$HEAD_DIR" --label "$SESSION_NAME" --no-focus)
  TAB_ID=$(printf '%s' "$CREATED" | python3 -c 'import json,sys; d=json.load(sys.stdin); x=d.get("result",{}).get("tab") or d.get("tab") or d.get("result") or d; print(x.get("tab_id") or x.get("id") or "")')
fi
[ -n "$TAB_ID" ] || { echo "Could not resolve a unique Herdr tab for '$SESSION_NAME'." >&2; exit 1; }

exec "$HERDR_BIN" agent start "head-$SESSION_NAME" --cwd "$HEAD_DIR" --workspace "$HERDR_WORKSPACE_ID" --tab "$TAB_ID" --focus -- "${COMMAND[@]}"
