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
for dst in (PKG, CPKG):
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
    record("hook", what, {"명령": f"{script} {' '.join(args)}".strip(), "입력": payload, **({"node": node} if node != "node" else {})}, out, p.stderr, p.returncode)
    return out


class Server:
    def __init__(self, script, env=None, cwd=PROJ, node="node"):
        root = CPKG if script.startswith("codex") else PKG
        self.p = subprocess.Popen([node, str(root / "scripts" / script)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True, env={**ENV, **(env or {})}, cwd=cwd)
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

OUT.write_text(json.dumps(runs, ensure_ascii=False, indent=1))
print(len(runs), "runs")
