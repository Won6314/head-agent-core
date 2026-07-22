#!/bin/bash
set -euo pipefail

SHARED_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
FIXTURE=$(mktemp -d)
trap 'rm -rf "$FIXTURE"' EXIT

mkdir -p "$FIXTURE/.claude/agents/head/sessions/maintenance" "$FIXTURE/.claude/agents/head/opencode/bin" "$FIXTURE/.claude/hooks" "$FIXTURE/bin"
printf 'head context\n' > "$FIXTURE/.claude/agents/head/HEAD_CONTEXT.md"
printf 'session context\n' > "$FIXTURE/.claude/agents/head/sessions/maintenance/context.md"
printf 'session run\n' > "$FIXTURE/.claude/agents/head/sessions/maintenance/run.md"
printf 'current detail\n' > "$FIXTURE/.claude/agents/head/sessions/maintenance/current.md"
printf '## Current State\n- compact state\n' > "$FIXTURE/.claude/agents/head/sessions/maintenance/progress.md"
touch "$FIXTURE/.claude/agents/head/opencode/bin/render-runtime-config.mjs"

cat > "$FIXTURE/bin/node" <<'SH'
#!/bin/bash
case "$*" in
  *--location-json*) printf '{"paneId":"pane-1","sessionName":"maintenance"}' ;;
esac
SH
chmod 755 "$FIXTURE/bin/node"
ln -s "$SHARED_ROOT/runtime/claude-hooks/post-compact-recovery.sh" "$FIXTURE/.claude/hooks/post-compact-recovery.sh"

OUTPUT=$(PATH="$FIXTURE/bin:$PATH" AGENT_TASK_QUICK="" AGENT_TASK_AGENT="" HEAD_PROJECT_ROOT="" bash "$FIXTURE/.claude/hooks/post-compact-recovery.sh" <<<'{"source":"startup"}')
python3 - "$OUTPUT" <<'PY'
import sys

output = sys.argv[1]
expected = ["head context", "session context", "session run"]
positions = [output.index(item) for item in expected]
if positions != sorted(positions):
    raise SystemExit(f"unexpected startup injection order: {positions}")
excluded = ["current detail", "compact state"]
if any(item in output for item in excluded):
    raise SystemExit(f"unexpected startup injection: {output}")
PY
