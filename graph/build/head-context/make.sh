#!/usr/bin/env bash
# head-context 제품 그래프를 처음부터 다시 만든다. 차례와 필요한 것은 같은 폴더의 README.md.
#   make.sh <head-agent-core 저장소> [커밋] [--with-run]
#   커밋: 그래프를 만들 커밋. 생략하면 그 저장소의 HEAD.
#   --with-run: 플러그인을 임시 폴더에서 실제로 실행해 출력 원문(runs/)을 다시 모은다(A-1). 없으면 있는 runs/를 쓴다.
# 판은 그 커밋의 packages/context/.claude-plugin/plugin.json 버전이다.
# 결과: 이 묶음의 두 단계 위 graph/head-context-<판>/에 head-context-<판>.sqlite와 hc_graph.py.
#       README·USER·LLM은 사람이 앞 판 것을 옮겨 수치를 고친다(README.md 차례 6).
# 필요: git, node 22.13 이상(node:sqlite), python3, TypeScript 5.9(HC_TYPESCRIPT=<typescript.js>, 기본 ~/.local/opt/typescript-5.9.3/lib/typescript.js).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=${1:?head-agent-core 저장소 경로}; shift
WITH_RUN=""; COMMIT_ARG=""
for a in "$@"; do
  if [ "$a" = "--with-run" ]; then WITH_RUN=1; else COMMIT_ARG=$a; fi
done
COMMIT=$(git -C "$REPO" rev-parse --short=7 "${COMMIT_ARG:-HEAD}^{commit}")
VERSION=$(git -C "$REPO" show "$COMMIT:packages/context/.claude-plugin/plugin.json" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["version"])')
DEST=$(cd "$HERE/../.." && pwd)/head-context-$VERSION
echo "커밋 $COMMIT · 판 $VERSION → $DEST" >&2
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
git -C "$REPO" archive "$COMMIT" packages/context | tar -x -C "$T"; PKG="$T/packages/context"
if [ -n "$WITH_RUN" ]; then
  python3 -I "$HERE/run_a.py" "$PKG" "$HERE/runs/a-runs.json" "$VERSION"
  python3 -I "$HERE/write_a1.py" "$HERE/runs/a-runs.json" "$HERE/runs/A-1-outputs.md" "$VERSION"
fi
TS=()
[ -n "${HC_TYPESCRIPT:-}" ] && TS=(--typescript "$HC_TYPESCRIPT")
node "$HERE/extract_js.mjs" "$PKG" "$T/code.json" "${TS[@]}"
mkdir -p "$DEST"
python3 -I "$HERE/build_graph.py" "$PKG" "$HERE" "$HERE/docs" "$T/graph.json" "$DEST/head-context-$VERSION.sqlite" "$COMMIT" "$VERSION"
python3 -I "$HERE/run_coverage.py" "$PKG" "$T/graph.json" "$HERE/runs/coverage.json"
cp "$HERE/hc_graph.py" "$DEST/hc_graph.py"
sha256sum "$DEST/head-context-$VERSION.sqlite"
