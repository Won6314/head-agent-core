#!/usr/bin/env python3
"""B-5 실행 대조(양방향): 기능 하나를 실제로 실행해(NODE_V8_COVERAGE)
  ① 실행된 함수가 그래프에서 그 기능의 도달 범위 안에 있는지(빠짐)
  ② 그래프가 그 기능에서 닿는다고 한 함수가 실제로 실행됐는지(부풀림 후보 — 분기·오류 경로라 안 돈 것 포함)를 본다.
    python3 run_coverage.py <패키지 폴더> <graph.json> <out.json>
"""
import json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
PKG, GRAPH, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]), Path(sys.argv[3])
g = json.loads(GRAPH.read_text())
defs = {n["id"]: n["props"] for n in g["nodes"] if n["type"] == "코드" and n["props"].get("kind") not in ("product", "component", "document")}
out_e = {}
for e in g["edges"]:
    out_e.setdefault(e["from"], []).append(e)
FOLLOW = {"call", "callback", "framework-invoked"}
def reach(start, rng=None):
    got, stack = set(), [(start, rng)]
    while stack:
        n, r = stack.pop()
        if n in got and r is None: continue
        got.add(n)
        for e in out_e.get(n, []):
            if e["type"] == "reference" and FOLLOW & set(e["props"]["kind"].split(",")):
                if r and not any(lo <= int(x) <= hi for x in str(e["props"].get("줄들") or e["props"].get("line")).split(",") for lo, hi in r): continue
                stack.append((e["to"], None))
    return got
def feature_reach(fid):
    got = set()
    for e in out_e.get(fid, []):
        if e["type"] == "기능→코드":
            rng = [tuple(map(int, x.split("-"))) for x in e["props"]["줄"].split(",")] if e["props"].get("줄") else None
            got |= reach(e["to"], rng)
    return got
def innermost(file, line):
    c = [(p["end_line"] - p["line"], i) for i, p in defs.items() if p["file"] == file and p["line"] <= line <= p["end_line"] and p["kind"] != "variable"]
    return min(c)[1] if c else None
T = Path(tempfile.mkdtemp(prefix="hc-cov-"))
home, proj = T / "user", T / "project"
for d in (home / ".claude" / "sessions", proj): d.mkdir(parents=True)
env = {k: v for k, v in os.environ.items() if not k.startswith(("CLAUDE", "ANTHROPIC", "CODEX", "HEAD_CONTEXT"))}
env.update(HOME=str(home), CLAUDE_CONFIG_DIR=str(home / ".claude"), CLAUDE_PROJECT_DIR=str(proj), CLAUDE_PLUGIN_ROOT=str(PKG))
C = "11111111-1111-4111-8111-111111111111"
def mcp(calls, cov):
    reqs = [{"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}]
    reqs += [{"jsonrpc": "2.0", "id": i + 1, "method": "tools/call", "params": {"name": n, "arguments": {**a, "conversation_id": C}}} for i, (n, a) in enumerate(calls)]
    subprocess.run(["node", str(PKG / "scripts/mcp.mjs")], input="\n".join(map(json.dumps, reqs)) + "\n", capture_output=True, text=True,
                   env={**env, **({"NODE_V8_COVERAGE": str(cov)} if cov else {})}, cwd=proj)
def hook(args, payload, cov):
    subprocess.run(["node", str(PKG / "scripts/hook.mjs"), *args], input=json.dumps(payload), capture_output=True, text=True,
                   env={**env, "NODE_V8_COVERAGE": str(cov)}, cwd=proj)
def executed(cov):
    hit = set()
    for f in cov.glob("*.json"):
        for s in json.loads(f.read_text())["result"]:
            if not s["url"].startswith("file://" + str(PKG)): continue
            rel = s["url"][len("file://" + str(PKG)) + 1:]
            text = (PKG / rel).read_text()
            for fn in s["functions"]:
                r = fn["ranges"][0]
                if r["count"] == 0 or not fn["functionName"] and fn["ranges"][0]["startOffset"] == 0: continue
                line = text.count("\n", 0, r["startOffset"]) + 1
                d = innermost(rel, line)
                if d: hit.add(d)
    return hit
# 준비: 작업 세션과 작업 브랜치(이 실행은 대조하지 않음)
mcp([("setup", {"action": "setup"}), ("create", {"name": "demo", "context": "# demo\n\n데모."}), ("branch", {"action": "create", "branch": "b1"}),
     ("save", {"summary": "s1", "history": "h1", "next": "n"})], None)
def cli(args, cov):
    subprocess.run(["node", str(PKG / "scripts" / args[0]), *args[1:]], capture_output=True, text=True, env={**env, "NODE_V8_COVERAGE": str(cov)}, cwd=proj)
cases = {
    "tool:todo": lambda cov: mcp([("todo", {"action": "add", "text": "문구 다듬기"})], cov),
    "tool:list": lambda cov: mcp([("list", {})], cov),
    "hook:claude:SubagentStart": lambda cov: hook([], {"hook_event_name": "SubagentStart", "session_id": C, "agent_id": "a1", "cwd": str(proj)}, cov),
    "hook:claude:SessionStart:session": lambda cov: hook(["session"], {"hook_event_name": "SessionStart", "session_id": C, "cwd": str(proj), "source": "startup"}, cov),
    "cli:map": lambda cov: cli(["map.mjs", str(proj), "demo", "30"], cov),
    "tool:save": lambda cov: mcp([("save", {"summary": "끝", "history": "h", "recap": "정리"})], cov),
    "tool:read": lambda cov: mcp([("read", {"action": "map"})], cov),
    "hook:claude:PreCompact": lambda cov: hook([], {"hook_event_name": "PreCompact", "session_id": C, "cwd": str(proj)}, cov),
    "hook:claude:SessionStart:context": lambda cov: hook(["context"], {"hook_event_name": "SessionStart", "session_id": C, "cwd": str(proj), "source": "startup"}, cov),
}
res = {}
for fid, run in cases.items():
    cov = T / f"cov-{fid.replace(':', '_')}"
    run(cov)
    hit = executed(cov)
    r = feature_reach(fid)
    # 도구 서버·훅을 띄우는 공통 경로(입구 파일, serve, 도구 서버 시작)는 기능 밖이라 따로 센다
    common = reach("code:scripts/mcp.mjs") | reach("code:core/mcp.mjs#serve") if fid.startswith("tool:") else set()
    outside = sorted(h for h in hit if h not in r and h not in common and not h.endswith(".mjs") and "#" in h)
    FN = {"function", "local_function", "method", "property_function"}
    over = sorted(x for x in r if defs.get(x, {}).get("kind") in FN and x not in hit)
    res[fid] = {"실행된 정의": len(hit), "그래프 도달 범위": len(r), "범위 밖에서 실행됨": outside,
                "닿는다고 했는데 안 돎": over}
shutil.rmtree(T)
OUT.write_text(json.dumps(res, ensure_ascii=False, indent=1))
for k, v in res.items():
    print(k, "실행", v["실행된 정의"], "범위", v["그래프 도달 범위"], "빠짐", len(v["범위 밖에서 실행됨"]), v["범위 밖에서 실행됨"][:8], "안 돎", len(v["닿는다고 했는데 안 돎"]))
