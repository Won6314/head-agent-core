#!/usr/bin/env python3
"""A-1: head-context를 임시 폴더에서 실제로 실행해 받는 출력 원문을 모은다.

    python3 run_a.py <플러그인 폴더(packages/context)> <결과 json> <판>

호스트(Claude Code·Codex)가 하는 일 — hooks.json의 명령을 그 입력 JSON으로 실행, 도구 서버에
JSON-RPC 한 줄씩 보내기 — 을 이 스크립트가 대신한다. 실행은 모두 /tmp/hc-demo 아래의 임시
HOME·임시 프로젝트에서만 한다(실제 ~/.claude, ~/.codex는 읽지도 쓰지도 않는다).
조작마다 무엇을 실행했나(종류, 명령, 입력), 상태, 받은 출력 원문을 남긴다.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

PKG = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2])
VERSION = sys.argv[3]  # 설치 자리 이름(<home>/plugins/cache/<마켓>/<플러그인>/<판>)
ROOT = Path("/tmp/hc-demo")
shutil.rmtree(ROOT, ignore_errors=True)
HOME = ROOT / "user"
PROJ = ROOT / "project"
for p in (HOME / ".claude" / "sessions", HOME / ".codex", PROJ):
    p.mkdir(parents=True, exist_ok=True)
(PROJ / "README.md").write_text("# demo app\n")
# 설치: 두 앱이 플러그인을 두는 자리(<home>/plugins/cache/<마켓>/<플러그인>/<판>)에 복사한다.
SRC = PKG
PKG = HOME / ".claude" / "plugins" / "cache" / "head-agent-core" / "head-context" / VERSION
CPKG = HOME / ".codex" / "plugins" / "cache" / "head-agent-core" / "head-context" / VERSION
APKG = HOME / ".gemini" / "config" / "plugins" / "head-context"  # Antigravity(agy)가 플러그인을 두는 자리(0.9.11~)
APKG_DATA = HOME / ".gemini" / "antigravity-cli" / "plugin_data" / "head-context"  # agy가 주는 PLUGIN_DATA
for dst in (PKG, CPKG, APKG):
    shutil.copytree(SRC, dst)

ENV = {k: v for k, v in os.environ.items() if not k.startswith(("CLAUDE", "ANTHROPIC", "CODEX", "HEAD_CONTEXT"))}
ENV.update(HOME=str(HOME), CLAUDE_CONFIG_DIR=str(HOME / ".claude"), CODEX_HOME=str(HOME / ".codex"),
           CLAUDE_PLUGIN_ROOT=str(PKG), CLAUDE_PROJECT_DIR=str(PROJ), TZ="Asia/Seoul")
runs = []
STATE = {"label": "첫 실행 전"}

C1 = "11111111-1111-4111-8111-111111111111"  # 사람 대화
C2 = "22222222-2222-4222-8222-222222222222"  # /clear 뒤 새 대화
X1 = "019a0000-0000-7000-8000-00000000c0de"  # Codex 대화


def scrub(text):
    return text.replace(str(ROOT), "/tmp/hc-demo")


def record(kind, what, inp, out, err="", code=0):
    runs.append({"n": len(runs) + 1, "상태": STATE["label"], "종류": kind, "실행": what,
                 "입력": inp, "출력": scrub(out), "stderr": scrub(err), "종료": code})


def hook(script, args, payload, what, env=None, node="node"):
    root = CPKG if script.startswith("codex") else PKG
    cmd = [node, str(root / "scripts" / script), *args]
    p = subprocess.run(cmd, input=json.dumps(payload), capture_output=True, text=True, env={**ENV, "CLAUDE_PLUGIN_ROOT": str(root), **(env or {})}, cwd=PROJ)
    out = p.stdout
    try:
        j = json.loads(out.strip().splitlines()[-1]) if out.strip() else None
        ac = j and (j.get("hookSpecificOutput") or {}).get("additionalContext")
        if ac is not None:
            out = ac
    except Exception:
        pass
    record("hook", what, {"명령": f"{script} {' '.join(args)}".strip(), "입력": payload, **({"node": node} if node != "node" else {}),
                          **({"env": {k: scrub(v) for k, v in env.items()}} if env else {})}, out, p.stderr, p.returncode)
    return out


class Server:
    def __init__(self, script, env=None, cwd=PROJ, node="node"):
        root = CPKG if script.startswith("codex") else APKG if script.startswith("antigravity") else PKG
        agy_env = {"PLUGIN_ROOT": str(APKG), "PLUGIN_DATA": str(APKG_DATA)} if script.startswith("antigravity") else {}
        self.p = subprocess.Popen([node, str(root / "scripts" / script)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True, env={**ENV, **agy_env, **(env or {})}, cwd=cwd)
        self.n = 0
        self.script = script if node == "node" else f"{script} (node {node})"

    def rpc(self, method, params=None):
        self.n += 1
        self.p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params or {}}) + "\n")
        self.p.stdin.flush()
        return json.loads(self.p.stdout.readline())

    def init(self, what):
        r = self.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "demo", "version": "0"}})
        record("mcp", what, {"서버": self.script, "method": "initialize"}, r["result"].get("instructions", ""))
        r = self.rpc("tools/list")
        tools = r["result"]["tools"]
        record("mcp", what + " · 도구 목록", {"서버": self.script, "method": "tools/list"},
               "\n\n".join(f"## {t['name']}\n{t['description']}\n인자: {', '.join(t['inputSchema']['properties'])}" for t in tools))

    def call(self, name, args, what, meta=None):
        params = {"name": name, "arguments": args}
        if meta:
            params["_meta"] = meta
        r = self.rpc("tools/call", params)
        res = r.get("result") or {}
        text = "\n".join(c.get("text", "") for c in res.get("content", [])) or json.dumps(r.get("error"), ensure_ascii=False)
        record("mcp tool", what, {"서버": self.script, "tool": name, "인자": {k: v for k, v in args.items()}, **({"_meta": meta} if meta else {})},
               ("[오류] " if res.get("isError") else "") + text)
        return text

    def close(self):
        self.p.stdin.close()
        self.p.wait(timeout=10)


def claude_start(source, conv, parts=("core 1 2", "core 2 2", "session", "context", "recent"), transcript=None, extra=None):
    out = {}
    for part in parts:
        payload = {"hook_event_name": "SessionStart", "session_id": conv, "cwd": str(PROJ), "source": source,
                   "transcript_path": transcript or str(HOME / ".claude" / "projects" / "demo" / f"{conv}.jsonl"), **(extra or {})}
        out[part] = hook("hook.mjs", part.split(), payload, f"Claude SessionStart({source}) · {part}")
    return out


# ---------------------------------------------------------------- 1. 첫 실행
claude_start("startup", C1)
s = Server("mcp.mjs")
s.init("Claude 도구 서버 시작")
s.call("list", {"conversation_id": C1}, "작업 세션 목록(없음)")
s.call("load", {"name": "demo", "conversation_id": C1}, "없는 작업 세션 불러오기")
s.call("create", {"name": "demo", "conversation_id": C1}, "context 없이 만들기")
s.call("setup", {"action": "setup"}, "초기설정")
STATE["label"] = "초기설정 뒤, 작업 세션 없음"
s.call("setup", {"action": "survey_done"}, "프로젝트 조사 끝남 기록")
s.call("setup", {"action": "never_ask"}, "never_ask에 step 없음")

# ---------------------------------------------------------------- 2. 작업 세션·작업 브랜치·저장
s.call("create", {"name": "demo", "context": "# demo\n\n데모 앱의 로그인 화면을 고친다.\n\n## 범위\n\n- 로그인 화면만", "conversation_id": C1}, "작업 세션 만들기")
STATE["label"] = "작업 세션 demo 메인에 연결"
s.call("save", {"summary": "로그인 화면 문제 정리", "history": "로그인 버튼이 두 번 눌린다. 근거: [메모](work/2026-11/2026-11-04-login.md)", "conversation_id": C1}, "메인에 저장")
s.call("branch", {"action": "create", "branch": "login-fix", "conversation_id": C1}, "작업 브랜치 열기")
STATE["label"] = "작업 브랜치 login-fix"
s.call("save", {"summary": "버튼 중복 클릭 막기 방향 정함", "history": "버튼을 누르면 요청이 끝날 때까지 막는다.", "next": "구현하고 시험", "conversation_id": C1}, "작업 브랜치에 저장(다음 있음)")
s.call("save", {"summary": "구현 끝", "history": "막기 구현, 시험 통과.", "conversation_id": C1}, "다음·정리 없이 저장")
s.call("save", {"summary": "구현", "history": "x", "next": "a", "recap": "b", "conversation_id": C1}, "다음과 정리를 함께")
s.call("todo", {"action": "add", "text": "로그인 오류 문구 다듬기 — 사용자: \"문구는 나중에\"", "due": "2026-11-10", "conversation_id": C1}, "할 일 더하기")
s.call("todo", {"action": "list", "conversation_id": C1}, "할 일 목록")
s.call("branch", {"action": "create", "branch": "copy-tone", "conversation_id": C1}, "두 번째 작업 브랜치 열기")
STATE["label"] = "작업 브랜치 copy-tone"
s.call("branch", {"action": "abandon", "branch": "copy-tone", "conversation_id": C1}, "이유 없이 중단")
s.call("branch", {"action": "abandon", "branch": "copy-tone", "reason": "사용자가 문구 작업을 미룸", "conversation_id": C1}, "작업 브랜치 중단")
s.call("branch", {"action": "attach", "branch": "login-fix", "conversation_id": C1}, "작업 브랜치 이어 가기")
STATE["label"] = "작업 브랜치 login-fix"
s.call("read", {"action": "map", "conversation_id": C1}, "흐름 지도")
s.call("read", {"action": "recent", "conversation_id": C1}, "최근 본문")
s.call("read", {"action": "overview", "conversation_id": C1}, "둘러보기")
s.call("read", {"action": "find", "query": "버튼", "conversation_id": C1}, "본문 찾기")
s.call("read", {"action": "files", "branch": "main", "conversation_id": C1}, "기록이 가리킨 파일(branch=main)")
(PROJ / ".head" / "sessions" / "demo" / "work" / "2026-11").mkdir(parents=True, exist_ok=True)
(PROJ / ".head" / "sessions" / "demo" / "work" / "2026-11" / "2026-11-04-login.md").write_text("# 로그인 메모\n\n원인은 `src/login.js`의 클릭 처리.\n")
s.call("read", {"action": "files", "branch": "login-fix", "conversation_id": C1}, "기록이 가리킨 파일(branch=login-fix)")
s.call("read", {"action": "find", "file": "work/2026-11/2026-11-04-login.md", "conversation_id": C1}, "파일을 가리킨 기록")
s.call("conversations", {"conversation_id": C1}, "살아 있는 대화 목록")
s.call("save", {"summary": "구현 끝", "history": "막기 구현, 시험 통과.", "recap": "버튼 중복 클릭을 막는 방향을 정하고 구현했다.", "conversation_id": C1}, "정리와 함께 저장(작업 브랜치 닫힘)")
STATE["label"] = "login-fix 닫힘, 메인"
s.call("todo", {"action": "done", "match": "문구", "conversation_id": C1}, "할 일 끝냄")
s.call("read", {"action": "entry", "id": "zzzzz", "conversation_id": C1}, "없는 기록 읽기")
s.call("load", {"name": "demo", "conversation_id": C1}, "작업 세션 불러오기")
s.call("nope", {}, "없는 도구")
s.call("read", {"action": "map", "limit": -1, "conversation_id": C1}, "잘못된 인자")

# ---------------------------------------------------------------- 3. 대화 안 작업(포크·하위 에이전트)
hook("hook.mjs", [], {"hook_event_name": "PreToolUse", "session_id": C1, "agent_id": "agent-1", "cwd": str(PROJ),
                       "tool_name": "mcp__plugin_head-context_session__save", "tool_input": {"summary": "s", "history": "h"}}, "Claude PreToolUse(대화 안 작업의 save)")
hook("hook.mjs", [], {"hook_event_name": "PreToolUse", "session_id": C1, "cwd": str(PROJ),
                       "tool_name": "mcp__plugin_head-context_session__load", "tool_input": {"name": "demo"}}, "Claude PreToolUse(대화의 load)")
hook("hook.mjs", [], {"hook_event_name": "SubagentStart", "session_id": C1, "agent_id": "agent-1", "cwd": str(PROJ)}, "Claude SubagentStart")
s.call("save", {"summary": "s", "history": "h", "conversation_id": C1, "agent_id": "agent-1"}, "대화 안 작업의 저장")
s.call("read", {"action": "map", "conversation_id": C1, "agent_id": "agent-1"}, "대화 안 작업의 읽기")
s.close()
p = Server("mcp.mjs", env={"CLAUDE_CODE_ENTRYPOINT": "sdk-cli"})
p.rpc("initialize", {"protocolVersion": "2025-06-18"})
p.call("todo", {"action": "add", "text": "x", "conversation_id": "33333333-3333-4333-8333-333333333333"}, "claude -p 대화의 할 일 더하기")
p.close()

# ---------------------------------------------------------------- 4. 다시 시작·압축·/clear
STATE["label"] = "초기설정 뒤, demo 메인에 연결된 대화"
claude_start("startup", C1, parts=("core 1 2", "core 2 2", "session", "context", "recent"))
hook("hook.mjs", [], {"hook_event_name": "PreCompact", "session_id": C1, "cwd": str(PROJ), "trigger": "auto"}, "Claude PreCompact")
tr = HOME / ".claude" / "projects" / "demo" / f"{C1}.jsonl"
tr.parent.mkdir(parents=True, exist_ok=True)
lines = []
for i, (u, a) in enumerate([("로그인 버튼이 두 번 눌려", "요청이 끝날 때까지 버튼을 막겠습니다."), ("그렇게 해", "구현했고 시험이 통과했습니다.")]):
    lines.append({"type": "user", "sessionId": C1, "timestamp": f"2026-11-04T01:0{i}:00Z", "message": {"role": "user", "content": u}})
    lines.append({"type": "assistant", "sessionId": C1, "timestamp": f"2026-11-04T01:0{i}:30Z", "message": {"role": "assistant", "content": [{"type": "text", "text": a}]}})
tr.write_text("\n".join(json.dumps(l, ensure_ascii=False) for l in lines) + "\n")
claude_start("compact", C1, parts=("core 1 2", "session", "context", "recent"), transcript=str(tr))
claude_start("resume", C1, parts=("core 1 2", "session", "context", "recent"), transcript=str(tr))
claude_start("clear", C2, parts=("session", "context", "recent"), transcript=str(tr.parent / f"{C2}.jsonl"))

# ---------------------------------------------------------------- 5. 깨진 기록
STATE["label"] = "대화 연결 파일이 깨짐"
conn = PROJ / ".head" / "state" / "conversations" / f"claude-{C1}.json"
if conn.exists():
    conn.write_text("{broken")
claude_start("startup", C1, parts=("session",))
STATE["label"] = ".head/config.json이 깨짐"
cfg = PROJ / ".head" / "config.json"
saved = cfg.read_text() if cfg.exists() else None
cfg.write_text("{broken")
claude_start("startup", C1, parts=("session",))
if saved is not None:
    cfg.write_text(saved)

# ---------------------------------------------------------------- 6. Codex
STATE["label"] = "Codex 대화, 초기설정 뒤"
cx = {"hook_event_name": "SessionStart", "session_id": X1, "cwd": str(PROJ), "source": "startup", "transcript_path": str(HOME / ".codex" / "sessions" / f"{X1}.jsonl")}
for part in ("core", "instructions", "session", "context"):
    hook("codex-hook.mjs", [part], cx, f"Codex SessionStart(startup) · {part}")
X2 = "019a0000-0000-7000-8000-0000000000ff"
hook("codex-hook.mjs", ["session"], {**cx, "session_id": X2}, "Codex SessionStart(startup) · session (두 번째 Codex 대화)")
c = Server("codex-mcp.mjs", cwd=CPKG)
c.init("Codex 도구 서버 시작")
c.call("load", {"name": "demo"}, "Codex 대화가 작업 세션 불러오기", meta={"threadId": X1, "sessionId": X1})
c.call("conversations", {}, "Codex에서 대화 목록", meta={"threadId": X1, "sessionId": X1})
c.call("send", {"threadId": f"codex:{X2}", "prompt": "로그인 고친 것 봐 줘"}, "Codex send(다른 Codex 대화)", meta={"threadId": X1, "sessionId": X1})
c.call("send", {"threadId": f"claude:{C1}", "prompt": "안녕"}, "Codex send(Claude 대화, 실행 중 아님)", meta={"threadId": X1, "sessionId": X1})
c.call("send", {"threadId": f"codex:{X1}", "prompt": "안녕"}, "Codex send(자기 자신)", meta={"threadId": X1, "sessionId": X1})
c.call("save", {"summary": "s", "history": "h"}, "Codex 하위 에이전트의 저장", meta={"threadId": "019a0000-0000-7000-8000-0000000000aa", "sessionId": X1})
c.call("list", {}, "등록 안 된 대화의 도구 호출", meta={"threadId": "019a0000-0000-7000-8000-0000000000bb", "sessionId": "019a0000-0000-7000-8000-0000000000bb"})
c.close()
hook("codex-hook.mjs", ["inbox"], {"hook_event_name": "UserPromptSubmit", "session_id": X2, "cwd": str(PROJ), "prompt": "계속"}, "Codex UserPromptSubmit · inbox (메시지가 기다리던 대화)")
hook("codex-hook.mjs", ["inbox"], {"hook_event_name": "UserPromptSubmit", "session_id": X1, "cwd": str(PROJ), "prompt": "계속"}, "Codex UserPromptSubmit · inbox (빈 편지함)")
hook("codex-hook.mjs", ["subagent"], {"hook_event_name": "SubagentStart", "session_id": X1, "agent_id": "a", "cwd": str(PROJ)}, "Codex SubagentStart · subagent")

# ---------------------------------------------------------------- 7. CLI
def cli(args, what, stdin=None):
    p = subprocess.run(["node", str(PKG / "scripts" / args[0]), *args[1:]], input=stdin, capture_output=True, text=True, env={**ENV, "CLAUDE_PLUGIN_ROOT": str(PKG)}, cwd=PROJ)
    record("CLI", what, {"명령": " ".join(["node scripts/" + args[0], *[scrub(a) for a in args[1:]]]), **({"stdin": stdin} if stdin else {})},
           p.stdout, p.stderr, p.returncode)


STATE["label"] = "초기설정 뒤, demo 작업 세션 있음"
cli(["map.mjs", str(PROJ), "demo", "30"], "흐름 지도 CLI")
cli(["migrate-0.7.mjs", str(PROJ)], "0.7 정리 미리 보기")
cli(["migrate-0.7.mjs"], "0.7 정리, 경로 없음")
cli(["report.mjs", str(PROJ), C1, "task-1", "demo-task", "start"], "하위 작업 보고")
cli(["relay.mjs", str(PROJ), "codex:019a0000-0000-7000-8000-00000000dead", f"claude:{C1}"], "Claude → Codex 중계(없는 대화)", stdin="안녕")
cli(["relay.mjs", str(PROJ), f"codex:{X2}", f"claude:{C1}"], "Claude → Codex 중계(이 프로젝트의 Codex 대화)", stdin="Claude에서 보냄")

# ---------------------------------------------------------------- 8. 같은 출력을 내는 다른 기능(검수 review-2 N1)
STATE["label"] = "대화 안 작업(agent_id)의 쓰기 — 다른 쓰기 도구"
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
for name, args in (("load", {"name": "demo"}), ("create", {"name": "demo2", "context": "# demo2\n\n시험."}),
                   ("branch", {"action": "create", "branch": "x1"}), ("setup", {"action": "setup"}),
                   ("todo", {"action": "done", "match": "문구"})):
    s.call(name, {**args, **({} if name == "setup" else {"conversation_id": C1}), "agent_id": "agent-1"} if name != "setup" else {**args},
           f"대화 안 작업의 {name}" if name != "setup" else "setup(대화 안 작업 표시 없음, 이미 초기설정됨)")
s.close()
p2 = Server("mcp.mjs", env={"CLAUDE_CODE_ENTRYPOINT": "sdk-cli"})
p2.rpc("initialize", {"protocolVersion": "2025-06-18"})
p2.call("setup", {"action": "setup"}, "claude -p 대화의 setup")
p2.close()
STATE["label"] = "Codex: 등록 안 된 대화의 도구 호출 — 모든 도구"
c = Server("codex-mcp.mjs", cwd=CPKG)
c.rpc("initialize", {"protocolVersion": "2025-06-18"})
XU = "019a0000-0000-7000-8000-0000000000cc"
for name, args in (("load", {"name": "demo"}), ("create", {"name": "d3", "context": "x"}), ("save", {"summary": "s", "history": "h"}),
                   ("branch", {"action": "create", "branch": "b"}), ("read", {"action": "map"}), ("todo", {"action": "list"}),
                   ("conversations", {}), ("setup", {"action": "setup"}), ("send", {"threadId": f"codex:{X1}", "prompt": "x"})):
    c.call(name, args, f"등록 안 된 대화의 {name}", meta={"threadId": XU, "sessionId": XU})
c.close()

# ---------------------------------------------------------------- 9. 작업 브랜치·할 일이 있는 대화의 시작(작업 맥락 전체)
STATE["label"] = "작업 브랜치 ctx-1에 연결, 열린 할 일 있음"
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.call("branch", {"action": "create", "branch": "ctx-1", "conversation_id": C1}, "연결 안 된 대화의 작업 브랜치 열기")
s.call("load", {"name": "demo", "conversation_id": C1}, "작업 세션 다시 불러오기")
s.call("branch", {"action": "create", "branch": "ctx-1", "conversation_id": C1}, "작업 브랜치 열기(시작 맥락 시험용)")
s.call("save", {"summary": "맥락 시험", "history": "시작 때 작업 맥락 확인용 기록.", "next": "다음 확인", "conversation_id": C1}, "작업 브랜치에 저장(시작 맥락 시험용)")
s.call("todo", {"action": "add", "text": "맥락 시험용 할 일", "due": "2026-11-05", "conversation_id": C1}, "할 일 더하기(시작 맥락 시험용)")
s.close()
claude_start("startup", C1, parts=("session", "context"))
hook("codex-hook.mjs", ["context"], {"hook_event_name": "SessionStart", "session_id": X1, "cwd": str(PROJ), "source": "startup"}, "Codex SessionStart(startup) · context (연결된 대화)")
hook("codex-hook.mjs", ["session"], {"hook_event_name": "SessionStart", "session_id": X1, "cwd": str(PROJ), "source": "startup"}, "Codex SessionStart(startup) · session (연결된 대화)")
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.call("load", {"name": "demo", "branch": "ctx-1", "conversation_id": C1}, "열린 작업 브랜치·할 일이 있는 작업 세션 불러오기")
s.close()

# ---------------------------------------------------------------- 10. 0.9.6~0.9.10에서 바뀐 출력
STATE["label"] = "작업 브랜치 ctx-1 — 참조파일·이름·짧은 ID"
(HOME / "notes").mkdir(parents=True, exist_ok=True)
(HOME / "notes" / "login-plan.md").write_text("# 로그인 계획\n")
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.call("save", {"summary": "참조파일 시험", "history": "계획은 참조파일에 있다.", "next": "다음 확인",
                "files": [str(HOME / "notes" / "login-plan.md"), "work/2026-11/2026-11-04-login.md", "nope/missing.md"],
                "conversation_id": C1}, "참조파일(files)과 함께 저장")
s.call("save", {"summary": "s", "history": "h", "next": "n", "files": "notes/login-plan.md", "conversation_id": C1}, "files에 목록이 아닌 값")
s.call("read", {"action": "find", "file": str(HOME / "notes" / "login-plan.md"), "conversation_id": C1}, "참조파일을 가리킨 기록")
s.call("read", {"action": "files", "branch": "ctx-1", "conversation_id": C1}, "기록이 가리킨 파일(참조파일 포함)")
s.call("branch", {"action": "create", "branch": "2026-11", "conversation_id": C1}, "달 꼴 이름으로 작업 브랜치 열기")
s.call("read", {"action": "entry", "id": "ab1", "name": "demo", "conversation_id": C1}, "짧은 ID가 너무 짧음")
s.call("setup", {"action": "setup"}, "이미 초기설정된 프로젝트에서 다시 초기설정")
s.close()

STATE["label"] = "작업 맥락이 9,000자를 넘음(열린 작업 브랜치 36·할 일 14)"
C3 = "44444444-4444-4444-8444-444444444444"
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.call("load", {"name": "demo", "conversation_id": C3}, "다른 대화가 작업 세션 불러오기")
for i in range(1, 36):
    s.rpc("tools/call", {"name": "branch", "arguments": {"action": "create", "branch": f"task-{i:02d}", "parent": "main", "conversation_id": C3}})
    s.rpc("tools/call", {"name": "save", "arguments": {"summary": f"일 {i:02d}: 로그인 화면의 오류 문구와 버튼 상태를 정리한 결과를 남긴다 " + "가나다라마바사 " * 6,
                                                         "history": "본문", "next": f"일 {i:02d}의 다음: 사용자에게 문구 후보 셋을 보이고 고르게 한다 " + "아자차카타파하 " * 6,
                                                         "conversation_id": C3}})
for i in range(1, 15):
    s.rpc("tools/call", {"name": "todo", "arguments": {"action": "add", "text": f"할 일 {i:02d}: 로그인 오류 문구 후보를 다시 보고 사용자와 정한다 " + "가나다라 " * 20,
                                                       **({"due": "2026-11-06"} if i <= 5 else {}), "conversation_id": C3}})
s.close()
r = claude_start("startup", C1, parts=("session", "context"))
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
full = s.call("load", {"name": "demo", "branch": "ctx-1", "conversation_id": C1}, "같은 자리를 load로 불러오기(줄이지 않은 작업 맥락)")
s.close()
record("측정", "작업 맥락 글자 수", {"무엇": "바로 앞 SessionStart의 session·context 출력과 load 결과의 글자 수"},
       f"시작 훅 session {len(r['session'])}자, context {len(r['context'])}자(상한 9,000자) · load 결과 {len(full)}자(줄이지 않음)\n"
       f"시작 훅 context의 열린 작업 브랜치 줄 {r['context'].count(chr(10) + '- task-') + r['context'].count(chr(10) + '- ctx-1')}개, "
       f"'## 흐름' 절 {'있음' if '## 흐름' in r['context'] else '없음'}, 끝 줄: {r['context'].rstrip().splitlines()[-1][:120]}")

STATE["label"] = "Codex 대화 정보(presence)가 깨짐"
pres = PROJ / ".head" / "state" / "presence" / f"codex-{X1}.json"
pres.parent.mkdir(parents=True, exist_ok=True)
pres.write_text("{broken")
hook("codex-hook.mjs", ["inbox"], {"hook_event_name": "UserPromptSubmit", "session_id": X1, "cwd": str(PROJ), "prompt": "계속"}, "Codex UserPromptSubmit · inbox (presence가 깨진 대화의 다음 입력)")
try:
    pj = json.loads(pres.read_text())
    got = "JSON으로 읽힘: " + json.dumps({k: pj[k] for k in sorted(pj) if k in ("host", "thread_id", "cwd", "mode")}, ensure_ascii=False)
except Exception as e:
    got = f"여전히 읽히지 않음: {e}"
record("측정", "입력 뒤 presence 파일", {"파일": ".head/state/presence/codex-<X1>.json", "전": "{broken"}, scrub(got))
pres.unlink()
hook("codex-hook.mjs", ["inbox"], {"hook_event_name": "UserPromptSubmit", "session_id": X1, "cwd": str(PROJ), "prompt": "계속"}, "Codex UserPromptSubmit · inbox (presence가 없는 대화의 다음 입력)")
record("측정", "입력 뒤 presence 파일(없던 것)", {"파일": ".head/state/presence/codex-<X1>.json", "전": "없음"},
       "새로 써짐" if pres.exists() else "써지지 않음")

OLD = shutil.which("node", path="/usr/bin")
STATE["label"] = f"node:sqlite가 없는 Node({subprocess.run([OLD, '--version'], capture_output=True, text=True).stdout.strip()})"
o = Server("mcp.mjs", node=OLD)
o.init("옛 Node로 Claude 도구 서버 시작")
o.call("list", {"conversation_id": C1}, "옛 Node에서 도구 호출")
o.close()
o = Server("codex-mcp.mjs", cwd=CPKG, node=OLD)
o.rpc("initialize", {"protocolVersion": "2025-06-18"})
o.call("list", {}, "옛 Node에서 Codex 도구 호출", meta={"threadId": X1, "sessionId": X1})
o.close()
for part in ("core 1 2", "session", "context", "recent"):
    payload = {"hook_event_name": "SessionStart", "session_id": C1, "cwd": str(PROJ), "source": "compact", "transcript_path": str(tr)}
    hook("hook.mjs", part.split(), payload, f"옛 Node · Claude SessionStart(compact) · {part}", node=OLD)
hook("hook.mjs", [], {"hook_event_name": "PreCompact", "session_id": C1, "cwd": str(PROJ), "trigger": "auto"}, "옛 Node · Claude PreCompact", node=OLD)
for part in ("session", "context"):
    hook("codex-hook.mjs", [part], {"hook_event_name": "SessionStart", "session_id": X1, "cwd": str(PROJ), "source": "startup"}, f"옛 Node · Codex SessionStart(startup) · {part}", node=OLD)

# ---------------------------------------------------------------- 11. 검수(11-15)가 짚은 출력
STATE["label"] = f"node:sqlite가 없는 Node — 나머지 도구(검수 M1)"
o = Server("mcp.mjs", node=OLD)
o.rpc("initialize", {"protocolVersion": "2025-06-18"})
for name, args in (("load", {"name": "demo"}), ("create", {"name": "d9", "context": "x"}), ("save", {"summary": "s", "history": "h"}),
                   ("branch", {"action": "create", "branch": "b9"}), ("read", {"action": "map"}), ("todo", {"action": "list"}),
                   ("conversations", {}), ("setup", {"action": "setup"})):
    o.call(name, {**args, **({} if name == "setup" else {"conversation_id": C1})}, f"옛 Node에서 {name}")
o.close()
o = Server("codex-mcp.mjs", cwd=CPKG, node=OLD)
o.rpc("initialize", {"protocolVersion": "2025-06-18"})
o.call("send", {"threadId": f"codex:{X2}", "prompt": "x"}, "옛 Node에서 Codex send", meta={"threadId": X1, "sessionId": X1})
o.close()

STATE["label"] = "작업 브랜치 ctx-1 — save가 거절하는 본문·files, 폴더 참조(검수 M4)"
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.call("save", {"summary": "s", "history": "계획\n요약: 본문에 넣은 예약 줄", "next": "n", "conversation_id": C1}, "본문에 예약 줄")
s.call("save", {"summary": "s", "history": "h", "next": "n", "files": ["notes/a`b.md"], "conversation_id": C1}, "files 경로에 백틱")
s.call("save", {"summary": "폴더 참조", "history": "노트 폴더를 참조로 둔다.", "next": "n", "files": [str(HOME / "notes")], "conversation_id": C1}, "files에 폴더")
s.close()

STATE["label"] = "색인 잠금을 다른 프로세스가 쥐고 있음(검수 L2)"
lockdir = PROJ / ".head" / "index-v5.sqlite.lock"
lockdir.mkdir()
(lockdir / "owner").write_text(str(os.getpid()))  # 살아 있는 프로세스(이 스크립트)가 쥔 잠금
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.call("read", {"action": "map", "name": "demo", "conversation_id": C3}, "잠금을 얻지 못함(10초 기다린 뒤)")
s.close()
shutil.rmtree(lockdir)

STATE["label"] = "Codex 대화가 작업 브랜치 ctx-1에 연결(검수 L5)"
c = Server("codex-mcp.mjs", cwd=CPKG)
c.rpc("initialize", {"protocolVersion": "2025-06-18"})
c.call("load", {"name": "demo", "branch": "ctx-1"}, "Codex 대화가 작업 브랜치 불러오기", meta={"threadId": X1, "sessionId": X1})
c.close()
hook("codex-hook.mjs", ["context"], {"hook_event_name": "SessionStart", "session_id": X1, "cwd": str(PROJ), "source": "startup"}, "Codex SessionStart(startup) · context (작업 브랜치에 연결된 대화)")


def opencode(what, session_id, parent=None, env=None):
    js = """
const [plugin, dir, sid, parent] = process.argv.slice(1);
const m = await import(plugin);
const client = { session: { get: async () => ({ data: { parentID: parent || null, title: 'demo-oc' } }) } };
const hooks = await m.default.server({ directory: dir, client });
const output = { system: [] };
await hooks['experimental.chat.system.transform']({ sessionID: sid }, output);
process.stdout.write(output.system.join('\\n\\n'));
"""
    p = subprocess.run(["node", "--input-type=module", "-e", js, str(PKG / "hosts" / "opencode" / "plugin.mjs"), str(PROJ), session_id, parent or ""],
                       capture_output=True, text=True, env={**ENV, **(env or {})}, cwd=PROJ)
    runs.append({"n": len(runs) + 1, "상태": STATE["label"], "종류": "opencode hook", "실행": what,
                 "입력": {"훅": "experimental.chat.system.transform", "sessionID": session_id, **({"parentID": parent} if parent else {}), **({"env": env} if env else {})},
                 "출력": scrub(p.stdout), "stderr": scrub(p.stderr), "종료": p.returncode})


STATE["label"] = "OpenCode 대화(호스트 없이 플러그인 훅을 직접 부름, 검수 L5)"
opencode("OpenCode 요청 · system.transform (HEAD_CONTEXT_SESSION=demo로 연결)", "ses_demo1", env={"HEAD_CONTEXT_SESSION": "demo"})
opencode("OpenCode 요청 · system.transform (하위 세션)", "ses_child1", parent="ses_demo1")

STATE["label"] = "대화 연결 파일이 깨진 뒤 도구 호출·Codex 훅(검수 L5)"
for name in (f"claude-{C1}.json", f"codex-{X1}.json"):
    f = PROJ / ".head" / "state" / "conversations" / name
    if f.exists():
        f.write_text("{broken")
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.call("read", {"action": "map", "conversation_id": C1}, "연결 파일이 깨진 대화의 도구 호출")
s.close()
hook("codex-hook.mjs", ["session"], {"hook_event_name": "SessionStart", "session_id": X1, "cwd": str(PROJ), "source": "startup"}, "Codex SessionStart(startup) · session (연결 파일이 깨짐)")

# ---------------------------------------------------------------- 12. Antigravity(0.9.11~0.9.15, 그래프 패치 2.8 A1~A13·5.6 A14~A26)
# agy 없이 훅(scripts/antigravity-hook.mjs)과 도구 서버(scripts/antigravity-mcp.mjs)를 agy가 주는 꼴의 입력으로 직접 부른다.
# 훅 입력은 camelCase, 출력은 injectSteps(시스템 메시지마다 하나)다. 출력 원문은 시스템 메시지들을 빈 줄 하나로 잇는다.
def agy(payload, what, node="node", env=None):
    cmd = [node, str(APKG / "scripts" / "antigravity-hook.mjs")]
    p = subprocess.run(cmd, input=json.dumps(payload), capture_output=True, text=True,
                       env={**ENV, "PLUGIN_ROOT": str(APKG), "PLUGIN_DATA": str(APKG_DATA), **(env or {})}, cwd=payload.get("cwd", str(PROJ)))
    out = p.stdout
    try:
        j = json.loads(out.strip().splitlines()[-1]) if out.strip() else None
        if j and "injectSteps" in j:
            out = "\n\n".join(x["systemMessage"]["systemMessage"] for x in j["injectSteps"])
    except Exception:
        pass
    record("hook", what, {"명령": "antigravity-hook.mjs", "입력": {k: scrub(v) if isinstance(v, str) else v for k, v in payload.items()},
                          **({"node": node} if node != "node" else {}), **({"env": env} if env else {})}, out, p.stderr, p.returncode)
    return out


AFRESH = ROOT / "agy-fresh"  # 초기설정 전 프로젝트
AFRESH.mkdir(parents=True, exist_ok=True)
BRAIN = HOME / ".gemini" / "antigravity-cli" / "brain"
def gid(n):
    return f"aaaaaaaa-0000-4000-8000-{n:012d}"
def sid(n):
    return f"bbbbbbbb-0000-4000-8000-{n:012d}"
def conv_dir(cid):
    d = BRAIN / cid
    (d / ".system_generated" / "logs").mkdir(parents=True, exist_ok=True)
    return d
def agy_in(cid, event, project=PROJ, **kw):
    d = conv_dir(cid)
    base = {"artifactDirectoryPath": str(d), "conversationId": cid, "cwd": str(project), "hookEventName": event,
            "lastUserInput": "", "modelName": "gemini-4-neon-low",
            "transcriptPath": str(d / ".system_generated" / "logs" / "transcript_full.jsonl"), "workspacePaths": [str(project)]}
    if event == "PreInvocation":
        base.update(initialNumSteps=1, invocationNum=1)
    base.update(kw)
    return base
def parent_message(cid, sender, title="Message from Parent Agent", name="m-parent.json", ts="2026-11-23T04:41:06.000000000Z"):
    folder = conv_dir(cid) / ".system_generated" / "messages"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_text(json.dumps({"id": name[:-5], "recipient": cid, "sender": sender, "priority": "MESSAGE_PRIORITY_HIGH",
                                           "timestamp": ts, "renderDetails": {"messageTitle": title}, "content": "Do this task"}))
TROWS = {}
def trow(cid, type_, content, source="SYSTEM"):
    rows = TROWS.setdefault(cid, [])
    rows.append({"step_index": len(rows), "type": type_, "content": content, "source": source, "status": "DONE",
                 "created_at": f"2026-11-23T01:{len(rows):02d}:00Z"})
    f = conv_dir(cid) / ".system_generated" / "logs" / "transcript_full.jsonl"
    f.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n")
def exchange(cid, user, model):
    trow(cid, "USER_INPUT", f"<USER_REQUEST>\n{user}\n</USER_REQUEST>", "USER_EXPLICIT")
    trow(cid, "PLANNER_RESPONSE", model, "MODEL")
def birth(pid):
    stat = Path(f"/proc/{pid}/stat").read_text()
    return stat[stat.rindex(")") + 2:].split(" ")[19]
STATE_DIR = PROJ / ".head" / "state"
def presence_of(cid, project=PROJ):
    return project / ".head" / "state" / "presence" / f"antigravity-{cid}.json"
def registered(cid):
    f = APKG_DATA / "conversations" / f"{cid}.json"
    return json.loads(f.read_text()) if f.exists() else None
def measure(what, inp, out):
    record("측정", what, inp, scrub(out))

G1, G2, G3, G4, G5, G6, G7, G8 = (gid(i) for i in range(1, 9))
STATE["label"] = "Antigravity 대화, 초기설정 전 프로젝트"
agy(agy_in(G1, "SessionStart", AFRESH, lastUserInput="안녕"), "Antigravity SessionStart (초기설정 전, 사람 대화)")             # A1
STATE["label"] = "Antigravity 대화, 초기설정 뒤 demo 프로젝트"
agy(agy_in(G2, "SessionStart", lastUserInput="로그인 화면 보자"), "Antigravity SessionStart (연결 안 됨)")                       # A2
start_dir = STATE_DIR / "start"
start_dir.mkdir(parents=True, exist_ok=True)
(start_dir / f"antigravity-{G3}.json").write_text(json.dumps({"session": "demo"}))
agy(agy_in(G3, "SessionStart", lastUserInput="이어서"), "Antigravity SessionStart (시작 파일: session demo)")                  # A3
(start_dir / f"antigravity-{G4}.json").write_text(json.dumps({"session": "demo", "branch": "ctx-1"}))
agy(agy_in(G4, "SessionStart", lastUserInput="이어서"), "Antigravity SessionStart (시작 파일: session demo, branch ctx-1)")
(start_dir / f"antigravity-{G5}.json").write_text(json.dumps({"session": "nope"}))
agy(agy_in(G5, "SessionStart", lastUserInput="이어서"), "Antigravity SessionStart (시작 파일: 없는 작업 세션)")
stale = start_dir / "antigravity-cccccccc-0000-4000-8000-000000000001.json"
stale.write_text(json.dumps({"session": "demo"}))
old = __import__("time").time() - 2 * 86400
os.utime(stale, (old, old))
agy(agy_in(G6, "SessionStart", lastUserInput="안녕"), "Antigravity SessionStart (하루 지난 남의 시작 파일이 있음)")              # A4
measure("하루 지난 시작 파일", {"파일": ".head/state/start/antigravity-cccccccc-….json", "수정 시각": "이틀 전"}, "지워짐" if not stale.exists() else "남음")
inbox = STATE_DIR / "inbox" / f"antigravity-{G3}"
inbox.mkdir(parents=True, exist_ok=True)
(inbox / "2026-11-23T01-00-00-000Z-11111111-1111-4111-8111-111111111111.json").write_text(json.dumps(
    {"from": f"claude:{C1}", "from_name": "head-1", "text": "로그인 시안 나왔어요", "at": "2026-11-23T01:00:00.000Z"}, ensure_ascii=False))
(inbox / "2026-11-23T01-00-01-000Z-22222222-2222-4222-8222-222222222222.json").write_text("{broken")
agy(agy_in(G3, "PreInvocation", lastUserInput="계속"), "Antigravity PreInvocation (편지함: 메시지 하나와 깨진 파일 하나)")       # A5
exchange(G3, "로그인 버튼이 두 번 눌려", "요청이 끝날 때까지 버튼을 막겠습니다.")
exchange(G3, "그렇게 해", "구현했고 시험이 통과했습니다.")
agy(agy_in(G3, "PreInvocation", lastUserInput="/compact"), "Antigravity PreInvocation (/compact)")                           # A6
trow(G3, "CHECKPOINT", "# Resuming from a compaction")
trow(G3, "USER_INPUT", "<USER_REQUEST>\n계속\n</USER_REQUEST>", "USER_EXPLICIT")
agy(agy_in(G3, "PreInvocation", lastUserInput="계속"), "Antigravity PreInvocation (압축 뒤 첫 단계: 새 CHECKPOINT)")
agy(agy_in(G3, "PreInvocation", lastUserInput="계속"), "Antigravity PreInvocation (압축 뒤 둘째 단계)")
# 0.9.14가 남긴 서브에이전트 꼴: 부모(G3)와 같은 살아 있는 pid로 쓴 presence, parent 칸 없는 등록 파일(A11에서 보이고 A15에서 정리된다)
S1, S2, S3, S4, S5, S6, S7 = (sid(i) for i in range(1, 8))
pres_dir = STATE_DIR / "presence"
live = {"pid": os.getpid(), "start": birth(os.getpid())}
for cid, said in ((G7, "살아 있는 사람 대화"), (S2, "")):
    presence_of(cid).write_text(json.dumps({"host": "antigravity", "conversation_id": cid, "cwd": str(PROJ), **live,
                                            **({"said": said} if said else {}), "at": "2026-11-23T01:30:00.000Z"}, ensure_ascii=False))
(APKG_DATA / "conversations").mkdir(parents=True, exist_ok=True)
(APKG_DATA / "conversations" / f"{S2}.json").write_text(json.dumps({"cwd": str(PROJ), "checkpoint": None}))
parent_message(S2, G3)
STATE["label"] = "Antigravity 도구 서버(초기설정 뒤 demo 프로젝트)"
a = Server("antigravity-mcp.mjs", cwd=APKG)
a.init("Antigravity 도구 서버 시작")                                                                                     # A7
M = lambda cid, root=None, parent=None: {"antigravity.google/conversation_id": cid, "antigravity.google/root_conversation_id": root or cid,
                                         **({"antigravity.google/parent_conversation_id": parent} if parent else {})}
a.call("list", {}, "Antigravity 대화의 작업 세션 목록", meta=M(G3))
a.call("save", {"summary": "s", "history": "h"}, "Antigravity 하위 대화(root가 다름)의 저장", meta=M("dddddddd-0000-4000-8000-000000000001", G3))
a.call("list", {}, "등록 안 된 Antigravity 대화의 도구 호출", meta=M("eeeeeeee-0000-4000-8000-000000000001"))         # A8
a.call("send", {"threadId": f"antigravity:{G3}", "prompt": "x"}, "Antigravity send(자기 자신)", meta=M(G3))           # A9
a.call("send", {"threadId": "nope:1", "prompt": "x"}, "Antigravity send(알 수 없는 보낼 곳)", meta=M(G3))
a.call("send", {"threadId": "antigravity:ffffffff-0000-4000-8000-000000000001", "prompt": "x"}, "Antigravity send(presence 없는 Antigravity 대화)", meta=M(G3))
a.call("send", {"threadId": f"antigravity:{G2}", "prompt": "로그인 봐 줘"}, "Antigravity send(pid 없는 presence → 다음 입력 때)", meta=M(G3))
a.call("send", {"threadId": f"antigravity:{G7}", "prompt": "로그인 봐 줘"}, "Antigravity send(살아 있는 pid지만 ACP 프로세스가 아님 → 다음 입력 때)", meta=M(G3))
a.call("send", {"threadId": "", "prompt": " "}, "Antigravity send(빈 인자)", meta=M(G3))
a.close()
STATE["label"] = "Claude 대화가 Antigravity로 보냄"
cli(["relay.mjs", str(PROJ), f"antigravity:{G2}", f"claude:{C1}"], "Claude → Antigravity 중계(presence 있음)", stdin="Claude에서 보냄")   # A10
cli(["relay.mjs", str(PROJ), "antigravity:ffffffff-0000-4000-8000-000000000002", f"claude:{C1}"], "Claude → Antigravity 중계(없는 대화)", stdin="안녕")
agy(agy_in(G2, "PreInvocation", lastUserInput="계속"), "Antigravity PreInvocation (Claude가 보낸 메시지를 받음)")
STATE["label"] = "살아 있는 Antigravity 대화 G7과 0.9.14가 남긴 서브에이전트 S2, pid 없는 G2"
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.call("conversations", {"conversation_id": C1}, "Claude에서 대화 목록(Antigravity 포함)")                              # A11
s.close()
c = Server("codex-mcp.mjs", cwd=CPKG)
c.rpc("initialize", {"protocolVersion": "2025-06-18"})
c.call("conversations", {}, "Codex에서 대화 목록(Antigravity 포함)", meta={"threadId": X2, "sessionId": X2})
c.close()
a = Server("antigravity-mcp.mjs", cwd=APKG)
a.rpc("initialize", {"protocolVersion": "2025-06-18"})
a.call("conversations", {}, "Antigravity에서 대화 목록", meta=M(G3))
a.close()
STATE["label"] = f"Antigravity, node:sqlite가 없는 Node({subprocess.run([OLD, '--version'], capture_output=True, text=True).stdout.strip()})"
agy(agy_in(G8, "SessionStart", lastUserInput="안녕"), "옛 Node · Antigravity SessionStart", node=OLD)                   # A12
trow(G3, "PLANNER_RESPONSE", "계속합니다.", "MODEL")
trow(G3, "CHECKPOINT", "# Resuming from a compaction")
agy(agy_in(G3, "PreInvocation", lastUserInput="계속"), "옛 Node · Antigravity PreInvocation (새 CHECKPOINT)", node=OLD)
(inbox / "2026-11-23T02-00-00-000Z-33333333-3333-4333-8333-333333333333.json").write_text(json.dumps(
    {"from": f"codex:{X1}", "text": "옛 Node에서도 받나요", "at": "2026-11-23T02:00:00.000Z"}, ensure_ascii=False))
agy(agy_in(G3, "PreInvocation", lastUserInput="계속"), "옛 Node · Antigravity PreInvocation (편지함 메시지)", node=OLD)
agy(agy_in(G3, "PreInvocation", lastUserInput="/compact"), "옛 Node · Antigravity PreInvocation (/compact)", node=OLD)
o = Server("antigravity-mcp.mjs", cwd=APKG, node=OLD)
o.rpc("initialize", {"protocolVersion": "2025-06-18"})
o.call("send", {"threadId": f"antigravity:{G2}", "prompt": "x"}, "옛 Node에서 Antigravity send", meta=M(G3))
o.close()
STATE["label"] = "세 도구 서버의 판 번호(serverInfo)"
infos = {}
for script, cwd in (("mcp.mjs", PROJ), ("codex-mcp.mjs", CPKG), ("antigravity-mcp.mjs", APKG)):                          # A13
    v = Server(script, cwd=cwd)
    infos[script] = v.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "demo", "version": "0"}})["result"]["serverInfo"]
    v.close()
record("mcp", "세 도구 서버의 serverInfo", {"서버": "mcp.mjs · codex-mcp.mjs · antigravity-mcp.mjs", "method": "initialize", "plugin.json 판": VERSION},
       "\n".join(f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in infos.items()))
bad = {k: v.get("version") for k, v in infos.items() if v.get("version") != VERSION}
if bad:
    sys.exit(f"serverInfo.version이 plugin.json 판({VERSION})과 다름: {bad}")

# ---- 서브에이전트(invoke_subagent) 꼴 입력 — 0.9.15
STATE["label"] = "Antigravity 서브에이전트(부모 G3), 초기설정 뒤 demo 프로젝트"
parent_message(S1, G3)
agy(agy_in(S1, "SessionStart"), "Antigravity 서브에이전트 SessionStart")                                                 # A14
measure("서브에이전트 시작 뒤 파일", {"대화": "S1"},
        f"presence {'있음' if presence_of(S1).exists() else '없음'} · 등록 parent={(registered(S1) or {}).get('parent')} · "
        f"작업 세션 연결 기록 {'있음' if (STATE_DIR / 'conversations' / f'antigravity-{S1}.json').exists() else '없음'}")
agy(agy_in(S2, "PreInvocation"), "Antigravity PreInvocation (0.9.14가 남긴 서브에이전트: parent 칸 없는 등록 파일·presence)")   # A15
measure("0.9.14 잔재 정리 뒤 파일", {"대화": "S2"},
        f"presence {'있음' if presence_of(S2).exists() else '없음'} · 등록 parent={(registered(S2) or {}).get('parent')}")
agy(agy_in(S1, "PreInvocation", lastUserInput="/compact"), "Antigravity 서브에이전트 PreInvocation (/compact)")          # A16
exchange(S1, "하위 일 하나", "했습니다.")
trow(S1, "CHECKPOINT", "# Resuming from a compaction")
agy(agy_in(S1, "PreInvocation"), "Antigravity 서브에이전트 PreInvocation (압축 뒤 첫 단계: 새 CHECKPOINT)")
H = [gid(i) for i in range(11, 15)]
for cid, (sender, title) in zip(H, ((f"{gid(11)}/task-1", "Background task finished"), (S1, "Message from probe-self (self)"),
                                    ("system", None), (gid(14), "Message from Parent Agent"))):
    folder = conv_dir(cid) / ".system_generated" / "messages"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "m.json").write_text(json.dumps({"id": "m", "recipient": cid, "sender": sender, "priority": "MESSAGE_PRIORITY_HIGH",
                                               "timestamp": "2026-11-23T04:00:00Z", **({"renderDetails": {"messageTitle": title}} if title else {}),
                                               "content": "x"}))
for cid, what in zip(H, ("자기 백그라운드 알림만", "부모 쪽 서브에이전트 보고만", "sender system만", "제목은 맞지만 sender가 자기")):
    agy(agy_in(cid, "SessionStart", lastUserInput="안녕"), f"Antigravity SessionStart (사람 대화, 메시지 폴더에 {what})")      # A17
measure("사람 대화 판정", {"대화": "A17의 넷"}, " · ".join(f"parent={(registered(cid) or {}).get('parent')}" for cid in H))
agy(agy_in(gid(15), "SessionStart"), "Antigravity SessionStart (메시지 폴더 없음, lastUserInput 빈 값)")              # A18
STATE["label"] = "서브에이전트 S1·S2와 부모 G3, 살아 있는 G7"
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.call("conversations", {"conversation_id": C1}, "Claude에서 대화 목록(서브에이전트 정리 뒤)")                          # A19
s.close()
a = Server("antigravity-mcp.mjs", cwd=APKG)
a.rpc("initialize", {"protocolVersion": "2025-06-18"})
a.call("conversations", {}, "Antigravity에서 대화 목록(서브에이전트 정리 뒤)", meta=M(G3))
a.call("list", {}, "서브에이전트의 list", meta=M(S1, G3, G3))                                                            # A20
a.call("todo", {"action": "add", "text": "x"}, "서브에이전트의 todo add", meta=M(S1, G3, G3))
a.call("setup", {"action": "setup"}, "서브에이전트의 setup", meta=M(S1, G3, G3))
a.close()
STATE["label"] = "Antigravity 서브에이전트, 초기설정 전 프로젝트"
parent_message(S3, G1)
agy(agy_in(S3, "SessionStart", AFRESH), "Antigravity 서브에이전트 SessionStart (초기설정 전)")                           # A21
STATE["label"] = f"Antigravity 서브에이전트, node:sqlite가 없는 Node"
agy(agy_in(S1, "SessionStart"), "옛 Node · Antigravity 서브에이전트 SessionStart", node=OLD)                            # A22
trow(S1, "CHECKPOINT", "# Resuming from a compaction")
agy(agy_in(S1, "PreInvocation"), "옛 Node · Antigravity 서브에이전트 PreInvocation (새 CHECKPOINT)", node=OLD)
STATE["label"] = "Antigravity 서브에이전트, 시작 파일과 HEAD_CONTEXT_SESSION이 있음"
parent_message(S4, G3)
(start_dir / f"antigravity-{S4}.json").write_text(json.dumps({"session": "demo"}))
stale2 = start_dir / "antigravity-cccccccc-0000-4000-8000-000000000002.json"
stale2.write_text(json.dumps({"session": "demo"}))
os.utime(stale2, (old, old))
agy(agy_in(S4, "SessionStart"), "Antigravity 서브에이전트 SessionStart (자기 시작 파일·하루 지난 남의 시작 파일·HEAD_CONTEXT_SESSION)",
    env={"HEAD_CONTEXT_SESSION": "demo"})                                                                                   # A23
measure("서브에이전트 시작 뒤 시작 파일", {"대화": "S4"},
        f"자기 시작 파일 {'남음' if (start_dir / f'antigravity-{S4}.json').exists() else '지워짐'} · 하루 지난 남의 시작 파일 {'남음' if stale2.exists() else '지워짐'} · "
        f"작업 세션 연결 기록 {'있음' if (STATE_DIR / 'conversations' / f'antigravity-{S4}.json').exists() else '없음'}")
STATE["label"] = "Antigravity 판정할 수 없는 입력"
parent_message(S5, G3)
agy({k: v for k, v in agy_in(S5, "SessionStart").items() if k != "artifactDirectoryPath"}, "Antigravity SessionStart (artifactDirectoryPath 없음, 부모 메시지는 있음)")   # A24
parent_message(S6, G3)
agy(agy_in(S7, "SessionStart", artifactDirectoryPath=str(BRAIN / S6)), "Antigravity SessionStart (artifactDirectoryPath의 폴더 이름이 대화 ID와 다름)")
S8, S9 = sid(8), sid(9)
parent_message(S8, G3)
(conv_dir(S8) / ".system_generated" / "messages" / "a-broken.json").write_text("{broken")
agy(agy_in(S8, "SessionStart"), "Antigravity SessionStart (깨진 메시지 파일 옆에 부모 메시지)")                         # A25
parent_message(S9, G3)
locked = conv_dir(S9) / ".system_generated" / "messages"
locked.chmod(0)
agy(agy_in(S9, "SessionStart", lastUserInput="안녕"), "Antigravity SessionStart (메시지 폴더를 읽을 수 없음)")
locked.chmod(0o755)
parent_message(H[0], G3, name="z-late-parent.json")
agy(agy_in(H[0], "PreInvocation", lastUserInput="계속"), "Antigravity PreInvocation (사람 대화로 판정된 뒤 부모 메시지 꼴 파일이 생김)")   # A26
measure("판정이 남은 사람 대화", {"대화": "A17 첫째"}, f"parent={(registered(H[0]) or {}).get('parent')}")

# A27(독립 검수 4, 11-23): 등록 안 된 Antigravity 대화의 도구 10개 — 모두 도구를 고르기 전에 프로젝트를 모른다며 멈춘다
STATE["label"] = "Antigravity: 등록 안 된 대화의 도구 호출 — 모든 도구"
a = Server("antigravity-mcp.mjs", cwd=APKG)
a.rpc("initialize", {"protocolVersion": "2025-06-18"})
GU = "eeeeeeee-0000-4000-8000-000000000002"
for name, args in (("list", {}), ("load", {"name": "demo"}), ("create", {"name": "d4", "context": "x"}), ("save", {"summary": "s", "history": "h"}),
                   ("branch", {"action": "create", "branch": "b"}), ("read", {"action": "map"}), ("todo", {"action": "list"}),
                   ("conversations", {}), ("setup", {"action": "setup"}), ("send", {"threadId": f"antigravity:{G3}", "prompt": "x"})):
    a.call(name, args, f"등록 안 된 Antigravity 대화의 {name}", meta=M(GU))
a.close()

# A28(독립 검수 1·5, 11-23): 편지함 폴더는 있는데 읽을 수 없음 — Antigravity는 실패 한 줄, Codex는 빈 편지함
STATE["label"] = "편지함 폴더를 읽을 수 없음(chmod 000)"
ainbox = STATE_DIR / "inbox" / f"antigravity-{G2}"
ainbox.mkdir(parents=True, exist_ok=True)
ainbox.chmod(0)
agy(agy_in(G2, "PreInvocation", lastUserInput="계속"), "Antigravity PreInvocation (편지함 폴더를 읽을 수 없음)")
ainbox.chmod(0o755)
cinbox = STATE_DIR / "inbox" / f"codex-{X1}"
cinbox.mkdir(parents=True, exist_ok=True)
cinbox.chmod(0)
hook("codex-hook.mjs", ["inbox"], {"hook_event_name": "UserPromptSubmit", "session_id": X1, "cwd": str(PROJ), "prompt": "계속"}, "Codex UserPromptSubmit · inbox (편지함 폴더를 읽을 수 없음)")
cinbox.chmod(0o755)

# A29(0.9.17): 컴팩트 뒤 먼저 할 것 — Claude·Codex 사람 대화의 compact 시작 출력 끝에 붙는다(작업 브랜치·연결 안 됨), 하위 에이전트·프로그램 실행에는 없다
STATE["label"] = "0.9.17 컴팩트 뒤 복원 — 작업 브랜치 ctx-1에 연결"
C9 = "99999999-9999-4999-8999-999999999999"
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.call("load", {"name": "demo", "branch": "ctx-1", "conversation_id": C9}, "작업 브랜치 ctx-1 불러오기(컴팩트 복원 시험용)")
s.close()
claude_start("compact", C9, parts=("session",))
STATE["label"] = "0.9.17 컴팩트 뒤 복원 — 연결 안 된 Claude 대화"
claude_start("compact", "99999999-9999-4999-8999-000000000010", parts=("session",))
STATE["label"] = "0.9.17 컴팩트 뒤 복원 — Codex 대화"
X3 = "019a0000-0000-7000-8000-0000000000dd"
cx3 = {"hook_event_name": "SessionStart", "session_id": X3, "cwd": str(PROJ), "source": "startup", "transcript_path": str(HOME / ".codex" / "sessions" / f"{X3}.jsonl")}
hook("codex-hook.mjs", ["session"], cx3, "Codex SessionStart(startup) · session (컴팩트 복원 시험용 Codex 대화)")
c = Server("codex-mcp.mjs", cwd=CPKG)
c.rpc("initialize", {"protocolVersion": "2025-06-18"})
c.call("load", {"name": "demo", "branch": "ctx-1"}, "Codex 대화가 작업 브랜치 ctx-1 불러오기", meta={"threadId": X3, "sessionId": X3})
c.close()
hook("codex-hook.mjs", ["session"], {**cx3, "source": "compact"}, "Codex SessionStart(compact) · session (작업 브랜치 ctx-1)")
hook("codex-hook.mjs", ["session"], {**cx3, "source": "compact", "agent_id": "a"}, "Codex SessionStart(compact) · session (하위 에이전트)")

# A30(0.9.17): Claude 프로그램 실행(sdk-*, HEAD_CONTEXT_PERSON 아님)은 연결 안 됐을 때 연결 안 됨 안내·첫 실행 안내를 받지 않는다
STATE["label"] = "0.9.17 Claude 프로그램 실행(sdk-cli), 연결 안 됨"
SDK = {"CLAUDE_CODE_ENTRYPOINT": "sdk-cli"}
sdk_in = lambda conv, source="startup", project=PROJ: {"hook_event_name": "SessionStart", "session_id": conv, "cwd": str(project), "source": source,
                                                        "transcript_path": str(HOME / ".claude" / "projects" / "demo" / f"{conv}.jsonl")}
hook("hook.mjs", ["session"], sdk_in("99999999-9999-4999-8999-000000000011"), "Claude SessionStart(startup) · session (sdk-cli, 연결 안 됨)", env=SDK)
hook("hook.mjs", ["session"], sdk_in("99999999-9999-4999-8999-000000000012"), "Claude SessionStart(startup) · session (sdk-cli + HEAD_CONTEXT_PERSON=1, 연결 안 됨)",
     env={**SDK, "HEAD_CONTEXT_PERSON": "1"})
hook("hook.mjs", ["session"], sdk_in("99999999-9999-4999-8999-000000000013", "compact"), "Claude SessionStart(compact) · session (sdk-cli, 연결 안 됨)", env=SDK)
STATE["label"] = "0.9.17 Claude 프로그램 실행(sdk-cli), 초기설정 전 프로젝트"
CFRESH = ROOT / "claude-fresh"
CFRESH.mkdir(parents=True, exist_ok=True)
hook("hook.mjs", ["session"], sdk_in("99999999-9999-4999-8999-000000000014", project=CFRESH), "Claude SessionStart(startup) · session (sdk-cli, 초기설정 전)",
     env={**SDK, "CLAUDE_PROJECT_DIR": str(CFRESH)})
hook("hook.mjs", ["session"], sdk_in("99999999-9999-4999-8999-000000000015", project=CFRESH), "Claude SessionStart(startup) · session (사람 대화, 초기설정 전 — 대조)",
     env={"CLAUDE_PROJECT_DIR": str(CFRESH)})

# A31(0.9.16): 짧은 말도 사람이 마지막으로 한 말(said)이 된다 — Antigravity presence의 said
STATE["label"] = "0.9.16 짧은 말 — Antigravity 사람 대화"
G16 = gid(16)
agy(agy_in(G16, "PreInvocation", lastUserInput="응"), "Antigravity PreInvocation (사람이 '응'이라고 함)")
measure("짧은 말의 said", {"대화": "G16", "lastUserInput": "응"}, f"presence said={json.dumps((json.loads(presence_of(G16).read_text()) if presence_of(G16).exists() else {}).get('said'), ensure_ascii=False)}")

# A32(검수 M1, 0.9.17): 작업 세션 머리가 상한을 넘을 때 — Claude는 시작·압축 모두, Codex는 압축 때만 context.md를 잘라 복원 블록 자리를 낸다
STATE["label"] = "0.9.17 작업 세션 머리가 9,000자를 넘음(context.md 약 1만 자)"
C20 = "99999999-9999-4999-8999-000000000020"
big = "# big\n\n긴 목적 문서로 시작 훅 상한을 넘기는 시험.\n\n" + "".join(f"- 범위 메모 {i:03d}: 로그인 화면의 문구·버튼·오류 상태를 정리한 줄이다.\n" for i in range(1, 300))
s = Server("mcp.mjs")
s.rpc("initialize", {"protocolVersion": "2025-06-18"})
s.rpc("tools/call", {"name": "create", "arguments": {"name": "big", "context": big, "conversation_id": C20}})
s.call("branch", {"action": "create", "branch": "long-1", "conversation_id": C20}, "긴 작업 세션에 작업 브랜치 열기")
s.call("save", {"summary": "긴 목적 시험 시작", "history": "머리 자르기 확인용 기록.", "next": "압축 뒤 확인", "conversation_id": C20}, "긴 작업 세션의 작업 브랜치에 저장")
s.close()
measure("긴 작업 세션의 context.md 글자 수", {"작업 세션": "big"}, f"context.md {len(big)}자")
claude_start("startup", C20, parts=("session",))
claude_start("compact", C20, parts=("session",))
X4 = "019a0000-0000-7000-8000-0000000000ee"
cx4 = {"hook_event_name": "SessionStart", "session_id": X4, "cwd": str(PROJ), "source": "startup", "transcript_path": str(HOME / ".codex" / "sessions" / f"{X4}.jsonl")}
hook("codex-hook.mjs", ["session"], cx4, "Codex SessionStart(startup) · session (머리 자르기 시험용 Codex 대화)")
c = Server("codex-mcp.mjs", cwd=CPKG)
c.rpc("initialize", {"protocolVersion": "2025-06-18"})
c.call("load", {"name": "big", "branch": "long-1"}, "Codex 대화가 긴 작업 세션의 작업 브랜치 불러오기", meta={"threadId": X4, "sessionId": X4})
c.close()
hook("codex-hook.mjs", ["session"], cx4, "Codex SessionStart(startup) · session (긴 작업 세션 — 자르지 않음)")
hook("codex-hook.mjs", ["session"], {**cx4, "source": "compact"}, "Codex SessionStart(compact) · session (긴 작업 세션 — 머리를 잘라 복원 블록 자리)")

OUT.write_text(json.dumps(runs, ensure_ascii=False, indent=1))
print(len(runs), "runs")
