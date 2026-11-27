#!/usr/bin/env python3
"""head-context 제품 그래프 만들기 — 노드·연결 JSON과 SQLite 한 파일.

    python3 build_graph.py <패키지 폴더(packages/context)> <build 폴더> <docs 폴더> <out graph.json> <out .sqlite> <커밋 7자> <판>

code.json은 <out graph.json>과 같은 폴더에서, 실행 기록은 <docs 폴더>와 나란한 runs/a-runs.json에서 읽는다.

정의·순서: 제품 그래프 정의(02a)·실행지침(02b), '화면이 없는 제품' 절 적용.
재료
- 코드 층(B-3): extract_js.mjs 결과(build/out/code.json), C4 묶음·바깥 칸 손 글(purposes.json).
- 기능(B-4): 패키지 manifest(hooks.json, codex-hooks.json, .mcp.json, .codex-mcp.json, skills/)와 도구 정의를
  아래 RULES 표대로 스크립트가 뽑는다. 기능 한 줄은 뜻 파일(meaning.json, B-6).
- 제품 쪽(C): docs/product-core.md, journey.md, ia.md, activities.md, screens.md. 정책은 meaning.json.
같은 입력이면 같은 출력(정렬, 시각 없음).
"""
import hashlib
import json
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

pkg, build, docs, out_json, out_db = map(Path, sys.argv[1:6])
COMMIT, VERSION = sys.argv[6], sys.argv[7]  # make.sh가 넘긴다: 커밋 7자, packages/context 플러그인 판
code = json.loads((out_json.parent / "code.json").read_text())
# 경로 글이 '.mjs'로 끝나 '경로로 실행'(framework-invoked)으로 잡혔지만 실제로는 실행하지 않는 자리(글을 만들기만 함). 이름으로 뺀다.
# 0.9.18: registerCommand는 등록 지시에 보이고 자동 승인과 비교할 명령 글을 만들 뿐이다. 그 명령은 모델이 셸에서 돌린다(cli:antigravity-wake-register).
PATH_TEXT_NOT_RUN = {("code:hosts/antigravity/wake-command.mjs#registerCommand", "code:scripts/antigravity-wake-register.mjs")}
_before = len(code["refs"])
code["refs"] = [r for r in code["refs"] if (r["from"], r["to"]) not in PATH_TEXT_NOT_RUN or r["kind"] != "framework-invoked"]
_path_text_dropped = _before - len(code["refs"])
purposes = json.loads((build / "purposes.json").read_text())
common = json.loads((build / "common-modules.json").read_text())
meaning = json.loads((build / "meaning.json").read_text())

nodes, edges, problems = {}, [], []
if _path_text_dropped != len(PATH_TEXT_NOT_RUN):
    problems.append(f"경로 글 제외 {len(PATH_TEXT_NOT_RUN)}건 중 {_path_text_dropped}건만 맞음(규칙이 낡음)")


def node(t, id_, **p):
    p = {k: v for k, v in p.items() if v not in (None, "", [])}
    if id_ in nodes:
        nodes[id_]["props"].update(p)
    else:
        nodes[id_] = {"id": id_, "type": t, "props": p}
    return id_


def edge(t, a, b, **p):
    edges.append({"type": t, "from": a, "to": b, "props": {k: v for k, v in p.items() if v not in (None, "")}})


TICK = re.compile(r"`([^`]+)`")

# ================================================================= 코드 층 (B-3)
defs = {d["id"]: d for d in code["defs"]}
layer_of = {m: l["name"] for l in purposes["layers"] for m in l["modules"]}
CTX = node("코드", "code:@head-context", kind="product", c4="Context", name="head-context",
           한줄=f"플러그인 패키지 packages/context (head-context {VERSION}, head-agent-core {COMMIT})")
for m, info in purposes["modules"].items():
    node("코드", f"code:@{m}", kind="component", c4="Component", name=m, 층=layer_of.get(m), 한줄=info["does"])
    edge("포함", CTX, f"code:@{m}")


def module_of(file):
    ms = sorted((m for m in purposes["modules"] if file.startswith(m + "/")), key=len, reverse=True)
    return ms[0] if ms else None


place_of = {p["place"]: p for p in common["places"]}
for d in code["defs"]:
    p = dict(kind=d["kind"], name=d["name"], qualname=d["qualname"], file=d["file"], line=d["line"], end_line=d["end_line"],
             exported=d["exported"])
    if d["kind"] == "module" and d["file"] in place_of:
        p["공용_자리"] = place_of[d["file"]]["does"]
    node("코드", d["id"], **p)
    if d["parent"]:
        edge("포함", d["parent"], d["id"])
    else:
        m = module_of(d["file"])
        edge("포함", f"code:@{m}" if m else CTX, d["id"])
for skill in sorted((pkg / "skills").glob("*/SKILL.md")):
    rel = skill.relative_to(pkg).as_posix()
    nid = node("코드", f"code:{rel}", kind="document", name=rel, file=rel, line=1,
               end_line=len(skill.read_text().splitlines()))
    edge("포함", CTX, nid)
for r in code["refs"]:
    edge("reference", r["from"], r["to"], kind=r["kind"], line=r["line"], 줄들=",".join(map(str, r["lines"])) if len(r["lines"]) > 1 else None)

# 데이터·외부 연결: purposes.json 바깥 칸. 요청이 들어오는 통로(훅 표준 입력, 도구 서버 입출력)는 '호출하는 곳'이 아니라 뺀다(B-2).
CHANNEL = {"훅 입력(표준 입력)", "도구 서버 표준 입출력"}
DATA = {".head/ 상태·기록·색인 파일": "파일", "프로젝트 설정·플러그인 지침 파일": "설정 파일",
        "Codex 플러그인 데이터 폴더(대화 등록)": "파일", "Claude 등록 파일·대화 기록": "호스트 파일", "Codex 대화 기록 파일": "호스트 파일",
        # 0.9.15: Antigravity가 읽는 agy 쪽 파일. 등록 파일(PLUGIN_DATA/conversations)은 공용 도우미로만 읽고 써서 칸을 두지 않는다(그래프 패치 2.4 HEAD 결정 (a))
        "Antigravity 대화 기록 파일": "호스트 파일", "Antigravity ACP 로그": "호스트 파일", "Antigravity 대화 폴더 메시지(brain)": "호스트 파일",
        # 0.9.18: 플러그인이 쓰고 읽는 자기 파일(agy 프로세스 하나에 하나). fs를 직접 불러 연결이 생긴다
        "Antigravity 깨우기 열쇠 기록": "파일",
        # 0.9.20: agy가 쓰는 사용자 전체 공용 입력 기록. /clear 앞 대화를 찾으려 끝부분을 읽기만 한다(그래프 검수 M2)
        "Antigravity 입력 기록(history.jsonl)": "호스트 파일"}
# 호스트(Claude Code)가 쓴 등록 파일·대화 기록은 바깥 서비스 호출이 아니라 파일 읽기라 데이터로 둔다(검수 지적).
READ = {"readFileSync", "readSync", "readdirSync", "existsSync", "statSync", "lstatSync", "realpathSync", "readlinkSync",
        "accessSync", "openSync", "fstatSync"}
WRITE = {"writeFileSync", "writeSync", "appendFileSync", "renameSync", "mkdirSync", "rmSync", "unlinkSync", "rmdirSync",
         "copyFileSync", "symlinkSync", "utimesSync", "truncateSync", "mkdtempSync"}
box = {}
for b in purposes["outside"]["boxes"]:
    if b["name"] in CHANNEL:
        continue
    if b["name"] in DATA:
        box[b["name"]] = node("데이터", f"data:{b['name']}", name=b["name"], 종류=DATA[b["name"]], 한줄=b.get("desc"))
    else:
        box[b["name"]] = node("외부 연결", f"ext:{b['name']}", name=b["name"], 한줄=b.get("desc"))
# 재검수 N2(11-15): 한 파일 안에서 닿는 곳이 다르면 줄 단위로 대상을 정하고(fact_targets), 여러 곳을 읽는 도우미는
# 부르는 쪽에 대상을 잇는다(via). purposes.json에 손으로 쓴다(LLM 판단, 원본 줄로 확인).
FACT_TARGET = purposes["outside"].get("fact_targets", {})
# 고정한 줄은 코드가 바뀌면 밀린다. 밀린 줄은 그 파일의 모든 칸에 이어지므로 problems로 알린다(0.9.19 검수 정보 1).
fact_lines = {f"{f['file']}:{f['line']}" for f in code["facts"] if f["type"] != "env"}
for k, target in FACT_TARGET.items():
    if k == "_":
        continue
    if k not in fact_lines:
        problems.append(f"B-2 fact_targets: {k}에 바깥 접근(fs 등) 호출이 없음 — 코드 줄이 밀렸으면 purposes.json의 줄 번호를 그 호출 줄로 고친다")
    if target not in box:
        problems.append(f"B-2 fact_targets: {k}의 대상 '{target}'이 바깥 칸에 없음")
VIA = purposes["outside"].get("via", {})
agg = {}
for helper, callers in VIA.items():
    for caller, target in callers.items():
        lines = sorted({r["line"] for r in code["refs"] if r["from"] == caller and r["to"] == helper})
        if not lines or caller not in nodes or target not in box:
            problems.append(f"B-2 via: {caller} → {helper} → {target}를 잇지 못함")
            continue
        for ln in lines:
            agg.setdefault(("read", caller, box[target]), set()).add((helper.split("#")[-1], ln))
for f in code["facts"]:
    if f["def"] in VIA:
        continue
    if f["type"] == "env":
        did = node("데이터", f"data:env:{f['name']}", name=f["name"], 종류="env")
        agg.setdefault(("read", f["def"], did), set()).add(("process.env", f["line"]))
        continue
    if f.get("fd") in (0, 1):
        continue
    for b in purposes["outside"]["boxes"]:
        if b["name"] in CHANNEL or f["file"] not in b["touch"].get(f["module"], []):
            continue
        # 한 파일 안에서 정의마다 닿는 곳이 다를 때: defs(이 정의만), except_defs(이 정의는 빼고)(검수 L3, 11-15)
        if ("defs" in b and f["def"] not in b["defs"]) or f["def"] in b.get("except_defs", []):
            continue
        ft = FACT_TARGET.get(f"{f['file']}:{f['line']}")
        if ft and ft != b["name"]:
            continue
        tid = box[b["name"]]
        api = f"{f['module']}.{f['api']}" if f["api"] else f["module"]
        if nodes[tid]["type"] == "데이터":
            op = "write" if f["api"] in WRITE else "read" if f["api"] in READ else None
            if op:
                agg.setdefault((op, f["def"], tid), set()).add((api, f["line"]))
        else:
            agg.setdefault(("코드→외부 연결", f["def"], tid), set()).add((api, f["line"]))
# 손으로 잇는 바깥 접근: 추출기가 사실로 잡지 않는 전역 호출(fetch). (정의, 바깥 칸, api, 원문에서 찾을 글)
# 0.9.18: wake를 ACP·터미널 두 함수로 나눔(구현 명세 「그래프 패치와 다른 점」 6)
MANUAL_OUTSIDE = [("code:hosts/antigravity/wake.mjs#acpSignal", "Antigravity language server(loopback HTTP)", "fetch", "await fetch("),
                  ("code:hosts/antigravity/wake.mjs#terminalSignal", "Antigravity language server(loopback HTTP)", "fetch", "await fetch(")]
for did, bname, api, text in MANUAL_OUTSIDE:
    d = defs.get(did)
    lns = [i + 1 for i, l in enumerate((pkg / d["file"]).read_text().splitlines()) if text in l and d["line"] <= i + 1 <= d["end_line"]] if d else []
    if not lns or bname not in box:
        problems.append(f"B-2 손 연결: {did} → {bname}({text})를 잇지 못함")
        continue
    agg.setdefault(("코드→외부 연결", did, box[bname]), set()).update((api, ln) for ln in lns)
for (t, a, b), apis in sorted(agg.items()):
    edge(t, a, b, api=", ".join(sorted({x[0] for x in apis})), 줄들=",".join(str(x) for x in sorted({x[1] for x in apis})))


# ---- DB: 코드의 CREATE TABLE에서 테이블·컬럼, 그 테이블 이름이 든 SQL 글이 있는 정의에서 read / write (02a DB)
# 규칙: 정의(가장 안쪽)마다 자기 줄에서 INSERT INTO·UPDATE·DELETE FROM·REPLACE INTO·CREATE TABLE·DROP TABLE의 테이블은 write,
# FROM·JOIN의 테이블은 read. 테이블 이름은 CREATE TABLE에 나온 것만 센다. 뜻 한 줄은 meaning.json db.
DB_SRC = {}
for d in code["defs"]:
    if d["kind"] == "module":
        t = (pkg / d["file"]).read_text()
        for tm in re.finditer(r"CREATE TABLE (\w+)\(([^;]*?)\);", t):
            DB_SRC[tm.group(1)] = (d["file"], [c.strip().split(None, 2) for c in re.split(r",(?![^(]*\))", tm.group(2)) if c.strip() and not c.strip().upper().startswith("PRIMARY")])
dbm = meaning.get("db", {})
for table, (file, cols) in sorted(DB_SRC.items()):
    tid = node("DB", f"db:{table}", name=table, 종류="테이블", 한줄=dbm.get(table), 원본=f"{file} CREATE TABLE")
    if not dbm.get(table):
        problems.append(f"B-6: DB 테이블 {table}의 뜻이 없음")
    for parts in cols:
        c = parts[0]
        cid = node("DB", f"db:{table}.{c}", name=f"{table}.{c}", 종류="컬럼", 한줄=dbm.get(f"{table}.{c}"),
                   SQL타입=parts[1] if len(parts) > 1 else None, 제약=parts[2] if len(parts) > 2 else None)
        edge("포함", tid, cid)
inner = {}
for d in code["defs"]:
    if d["kind"] in ("module", "variable"):
        continue
    for ln in range(d["line"], d["end_line"] + 1):
        cur = inner.get((d["file"], ln))
        if not cur or (defs[cur]["end_line"] - defs[cur]["line"]) > (d["end_line"] - d["line"]):
            inner[(d["file"], ln)] = d["id"]
db_ops = {}
for (file, ln), did in inner.items():
    text = (pkg / file).read_text().splitlines()[ln - 1]
    for op, rx in (("write", r"(?:INSERT(?: OR \w+)? INTO|REPLACE INTO|UPDATE|DELETE FROM|CREATE TABLE|DROP TABLE IF EXISTS|DROP TABLE) (\w+)"),
                   ("read", r"(?<!DELETE )\b(?:FROM|JOIN) (\w+)")):
        for tname in re.findall(rx, text):
            if tname in DB_SRC:
                db_ops.setdefault((op, did, f"db:{tname}"), set()).add(ln)
for (op, did, tid), lns in sorted(db_ops.items()):
    edge(op, did, tid, 줄들=",".join(map(str, sorted(lns))), api="SQL")


# ---- 주입(B-2 판단, LLM 판단): 입구 파일이 도구 서버에 넘긴 객체의 함수를 받은 쪽이 이름으로 부르는 곳.
# 02a의 framework-invoked(DI)로 잇는다. 이 패키지의 입구(scripts/mcp.mjs, scripts/codex-mcp.mjs, scripts/antigravity-mcp.mjs)가 넘기는 것만 적는다.
# 0.9.11~: 세 입구가 서로의 peer를 받는다 — mcp [codexPeer, antigravityPeer], codex-mcp [claudePeer, antigravityPeer], antigravity-mcp [claudePeer, codexPeer].
AGY_PEER = "code:hosts/antigravity/peer.mjs#antigravityPeer"
INJECT = [
    ("core/sessions.mjs", "source.live(known)", ["code:hosts/claude/mcp.mjs#serveClaude.live", "code:hosts/claude/mcp.mjs#serveClaude.live@15",
                                                 "code:hosts/codex/mcp.mjs#serveCodex.options.live", "code:hosts/codex/mcp.mjs#serveCodex.options.live@66",
                                                 "code:hosts/antigravity/mcp.mjs#serveAntigravity.options.live",
                                                 "code:hosts/antigravity/mcp.mjs#serveAntigravity.options.live@14"]),
    ("core/sessions.mjs", "hostInfo(id)", ["code:hosts/claude/process.mjs#hostInfo"]),
    ("hosts/claude/mcp.mjs", "p.live(project, known)", ["code:hosts/codex/threads.mjs#codexLive", "code:hosts/antigravity/threads.mjs#antigravityLive"]),
    ("hosts/codex/mcp.mjs", "p.live(dir, known)", ["code:hosts/claude/process.mjs#liveConversations", "code:hosts/antigravity/threads.mjs#antigravityLive"]),
    ("hosts/codex/mcp.mjs", "p.accepts?.(target)", ["code:hosts/claude/peer.mjs#claudePeer.accepts", AGY_PEER + ".accepts"]),
    ("hosts/codex/mcp.mjs", "peer.send(target", ["code:hosts/claude/peer.mjs#claudePeer.send", AGY_PEER + ".send"]),
    ("hosts/antigravity/mcp.mjs", "p.live(dir, known)", ["code:hosts/claude/process.mjs#liveConversations", "code:hosts/codex/threads.mjs#codexLive"]),
    ("hosts/antigravity/mcp.mjs", "p.accepts?.(target)", [AGY_PEER + ".accepts", "code:hosts/claude/peer.mjs#claudePeer.accepts",
                                                          "code:hosts/codex/peer.mjs#codexPeer.accepts"]),
    ("hosts/antigravity/mcp.mjs", "peer.send(target", [AGY_PEER + ".send", "code:hosts/claude/peer.mjs#claudePeer.send",
                                                       "code:hosts/codex/peer.mjs#codexPeer.send"]),
    # serve()가 받은 함수들: 앱마다 serveClaude·serveCodex·serveAntigravity·OpenCode 입구가 넘긴다
    ("core/mcp.mjs", "conversationOf(request)", ["code:hosts/claude/mcp.mjs#serveClaude.conversationOf", "code:hosts/codex/mcp.mjs#serveCodex.conversationOf",
                                                "code:hosts/opencode/mcp.mjs#conversationOf", "code:hosts/antigravity/mcp.mjs#serveAntigravity.conversationOf"]),
    ("core/mcp.mjs", "agentOf(request)", ["code:hosts/codex/mcp.mjs#serveCodex.agentOf", "code:hosts/antigravity/mcp.mjs#serveAntigravity.agentOf"]),
    ("core/mcp.mjs", "projectOf(request)", ["code:hosts/codex/mcp.mjs#projectOf", "code:hosts/antigravity/mcp.mjs#serveAntigravity.projectOf"]),
    ("core/mcp.mjs", "readOnly(request)", ["code:hosts/claude/mcp.mjs#serveClaude.readOnly"]),
    ("core/mcp.mjs", "options(dir)", ["code:hosts/codex/mcp.mjs#serveCodex.options", "code:hosts/antigravity/mcp.mjs#serveAntigravity.options"]),
]
for file, text, targets in INJECT:
    hits = [i + 1 for i, l in enumerate((pkg / file).read_text().splitlines()) if text in l]
    if not hits:
        problems.append(f"B-2 주입: {file}에서 '{text}'를 찾지 못함")
    for ln in hits:
        src = inner.get((file, ln), f"code:{file}")
        for t in targets:
            if t not in nodes:
                problems.append(f"B-2 주입: {t}가 코드 노드에 없음")
                continue
            edge("reference", src, t, kind="framework-invoked", line=ln, 근거="주입(입구가 넘긴 객체, B-2 판단)")

# ---- 경계(B-2): 따라가지 않고 멈추는 곳. 조회가 여기서 멈춘다고 보인다.
BOUNDARY = [("code:hosts/codex/threads.mjs#loaded", "code:hosts/codex/query.mjs",
             "하위 프로세스: spawnSync(node, [QUERY = query.mjs, 'loaded', …]) — 다른 프로세스라 호출로 잇지 않는다")]
for frm, to, why in BOUNDARY:
    if frm in nodes and to in nodes:
        node("코드", frm, 경계=f"{why} → {to}")
    else:
        problems.append(f"B-2 경계: {frm} 또는 {to}가 없음")

# ================================================================= 기능 (B-4)
lines_of = {}


def src_lines(rel):
    if rel not in lines_of:
        lines_of[rel] = (pkg / rel).read_text().splitlines()
    return lines_of[rel]


def in_ranges(props, rng):
    lines = [int(x) for x in str(props.get("줄들") or props.get("line")).split(",")]
    return any(lo <= x <= hi for x in lines for lo, hi in rng)


def branch_range(rel, pattern, within=None):
    """pattern이 있는 if/else if 줄부터 같은 들여쓰기의 다음 '}' 줄 앞까지. 한 줄짜리(끝이 '{'가 아님)는 그 줄만."""
    L = src_lines(rel)
    lo, hi = within or (1, len(L))
    for i in range(lo - 1, hi):
        if pattern in L[i]:
            ind = len(L[i]) - len(L[i].lstrip())
            if not L[i].rstrip().endswith("{"):  # 중괄호 없는 분기: 들여쓰기가 더 깊은 다음 줄들까지 한 문장
                j = i + 1
                while j < hi and L[j].strip() and len(L[j]) - len(L[j].lstrip()) > ind:
                    j += 1
                return (i + 1, j)
            if L[i].lstrip().startswith("}"):
                ind = len(L[i]) - len(L[i].lstrip())
            for j in range(i + 1, hi):
                s = L[j]
                if s.strip() and len(s) - len(s.lstrip()) == ind and s.lstrip().startswith("}"):
                    return (i + 1, j)
            return (i + 1, hi)
    problems.append(f"B-4: {rel}에서 '{pattern}' 분기를 찾지 못함")
    return None


# RULES — B-2에서 정한 처리: 기능 종류마다 처리 코드를 찾는 규칙(LLM 판단, 스택마다 한 번)
features = {}


def feature(fid, 종류, handler, 입구=None, rng=None, 앱=None, 근거=None, 입구rng=None, 공통=None):
    # 공통: 여러 기능이 같이 지나는 디스패치 갈래 [(코드, 줄 범위)] — 역할 '입구'로 잇는다(검수 H1, 11-15)
    features[fid] = dict(종류=종류, handler=handler, 입구=입구, rng=rng, 앱=앱, 근거=근거, 입구rng=입구rng, 공통=공통 or [])


def entries(f):
    """기능이 지나는 코드와 줄 범위 전부: (코드, 역할, 줄 범위)."""
    out = [(f["handler"], "처리", f["rng"]), (f["입구"], "입구", f.get("입구rng"))]
    out += [(c, "입구", r) for c, r in f.get("공통", [])]
    return [(h, role, rr) for h, role, rr in out if h]


# 도구 호출 공통 갈래: serve의 tools/call 분기. 모든 tool 호출이 여기를 지나 옛 Node 검사·프로젝트·대화·읽기 전용 판정·
# 알림 붙이기를 거친 뒤 callTool(또는 앱 도구의 call)로 간다. 그래서 모든 tool 기능의 입구 코드로 잇는다(검수 H1, 11-15).
# 재검수 N1(11-15): 갈래 전체를 잇으면 callTool 호출 줄이 들어가 각 도구가 자기 입구에서는 지나지 않는 setup 갈래까지 닿는다.
# 그래서 실제로 지나는 줄만 준다. core 도구는 callTool 호출 줄(그 도구의 callTool 안 갈래는 기능 자신의 입구 callTool·줄 범위로 간다)을 빼고,
# 앱 도구(own.call — Codex send)는 callTool 호출부터 결과 보내기 앞까지(storeOf·readOnly·agentOf 포함)를 뺀다.
def _tools_call():
    L = src_lines("core/mcp.mjs")
    lo, hi = branch_range("core/mcp.mjs", "method === 'tools/call'")
    ct = next(i + 1 for i in range(lo - 1, hi) if ": callTool(" in L[i])
    sent = next(i + 1 for i in range(ct, hi) if "send({ id, result: { content" in L[i])
    return [(lo, ct - 1), (ct + 1, hi)], [(lo, ct - 1), (sent, hi)]
CORE_CALL, OWN_CALL = _tools_call()
TOOLS_CALL = [("code:core/mcp.mjs#serve", CORE_CALL)]
OWN_TOOLS_CALL = [("code:core/mcp.mjs#serve", OWN_CALL)]
# MCP tool: 도구 정의(DEFINITIONS)의 이름, 처리 = 저장소 객체의 같은 이름 메서드(METHODS로 바뀐 것은 그 이름).
# callTool이 store[name]으로 동적으로 부르므로 추출기는 잇지 못한다 → 입구(callTool)와 처리 메서드를 따로 잇는다.
defs_js = subprocess.run(["node", "-e", "import('%s').then(m=>console.log(JSON.stringify(m.DEFINITIONS.map(d=>d.name))))"
                          % (pkg / "core" / "mcp.mjs").as_posix()], capture_output=True, text=True, check=True).stdout
mcp_src = (pkg / "core" / "mcp.mjs").read_text()
methods = dict(re.findall(r"(\w+): '(\w+)'", re.search(r"const METHODS = \{([^}]*)\}", mcp_src).group(1)))
for name in json.loads(defs_js):
    if name == "setup":  # callTool이 저장소가 아니라 setupTool로 보낸다
        handler = "code:core/project.mjs#setupTool"
    else:
        handler = f"code:core/sessions.mjs#sessions.{methods.get(name, name)}"
    ct = defs["code:core/mcp.mjs#callTool"]
    sb = branch_range("core/mcp.mjs", "if (name === 'setup')", (ct["line"], ct["end_line"]))
    # 입구 callTool의 줄 범위: setup이 아닌 tool은 setup 분기를 지나지 않는다
    irng = None if name == "setup" else [(ct["line"], sb[0] - 1), (sb[1] + 1, ct["end_line"])]
    feature(f"tool:{name}", "MCP tool", handler, 입구="code:core/mcp.mjs#callTool", 앱="Claude Code · Codex · OpenCode · Antigravity",
            근거="core/mcp.mjs DEFINITIONS", 입구rng=irng, 공통=TOOLS_CALL)
codex_mcp = (pkg / "hosts/codex/mcp.mjs").read_text()
for name in re.findall(r"definition: \{\s*name: '(\w+)'", codex_mcp):
    feature(f"tool:{name}", "MCP tool", f"code:hosts/codex/mcp.mjs#sendTool.call", 앱="Codex", 근거="hosts/codex/mcp.mjs sendTool", 공통=OWN_TOOLS_CALL)
# Antigravity 도구 서버의 앱 도구: 처리 코드가 Codex send와 달라 따로 된 기능 <도구>@antigravity로 둔다(그래프 패치 2.1-2 HEAD 결정)
agy_mcp = (pkg / "hosts/antigravity/mcp.mjs").read_text()
for name in re.findall(r"definition: \{\s*name: '(\w+)'", agy_mcp):
    feature(f"tool:{name}@antigravity", "MCP tool", "code:hosts/antigravity/mcp.mjs#serveAntigravity.call", 앱="Antigravity",
            근거="hosts/antigravity/mcp.mjs serveAntigravity tools", 공통=OWN_TOOLS_CALL)
# 도구 서버 요청: serve의 method 분기(tools/call은 위 tool들의 입구라 따로 두지 않는다)
for meth in re.findall(r"method === '([\w/]+)'", mcp_src):
    if meth == "tools/call":
        continue
    feature(f"mcp:{meth}", "MCP 요청", "code:core/mcp.mjs#serve", rng=[branch_range("core/mcp.mjs", f"method === '{meth}'")],
            앱="Claude Code · Codex · OpenCode · Antigravity", 근거="core/mcp.mjs serve")
def preamble(rel, first_pattern):
    """'try {' 줄부터 첫 분기 앞까지: 모든 분기가 같이 지나는 줄."""
    L = src_lines(rel)
    first = next(i for i, l in enumerate(L) if first_pattern in l)
    start = max(i for i in range(first) if L[i].startswith("try {"))
    return (start + 1, first)


# Claude hook: hooks.json의 명령. 처리 = hosts/claude/hook.mjs 안의 줄 범위: 공통 앞부분 + (SessionStart면 그 앞부분) + 그 분기.
CH = "hosts/claude/hook.mjs"
hj = json.loads((pkg / "hooks/hooks.json").read_text())
cpre = preamble(CH, "if (event ===")


def catch_range(rel):
    """파일 맨 위 try의 공통 catch(훅 실패 한 줄): 어느 분기에서 오류가 나도 이 줄을 지난다."""
    L = src_lines(rel)
    a = next(i for i, l in enumerate(L) if l.startswith("} catch"))
    b = next(i for i in range(a + 1, len(L)) if L[i].startswith("}"))
    return (a + 1, b + 1)


ccatch = catch_range(CH)
ss = branch_range(CH, "event === 'SessionStart' && !input.agent_id) {")
ss_pre = (ss[0], branch_range(CH, "part === 'session'", ss)[0] - 1)
# 0.9.7: node:sqlite가 없는 Node의 SessionStart 분기(session·context가 지나고, session이면 이유 한 줄을 낸다)
c_old = branch_range(CH, "event === 'SessionStart' && !input.agent_id && part !== 'core'")


def multiline_branch(rel, inner, next_pattern):
    """여러 줄 조건의 else if 분기: inner가 든 조건의 '} else if (' 줄부터 next_pattern 줄 앞까지."""
    L = src_lines(rel)
    k = next(i for i, l in enumerate(L) if inner in l)
    a = max(i for i in range(k) if L[i].lstrip().startswith("} else if ("))
    b = next(i for i in range(k, len(L)) if next_pattern in L[i])
    return (a + 1, b)
for ev, groups in sorted(hj["hooks"].items()):
    for g in groups:
        for h in g["hooks"]:
            args = h.get("args", [])[1:]
            if ev == "SessionStart":
                part = args[0]
                rng = [cpre, *([c_old] if part in ("session", "context") else []), ss_pre, branch_range(CH, f"part === '{part}'", ss), ccatch]
                fid = f"hook:claude:SessionStart:{part}"
            else:
                rng = [cpre, branch_range(CH, f"event === '{ev}'"), ccatch]
                fid = f"hook:claude:{ev}"
            if fid in features:
                features[fid]["명령"] += f" · {' '.join(args)}"
                continue
            feature(fid, "hook", f"code:{CH}", rng=rng, 앱="Claude Code", 근거=f"hooks/hooks.json {ev}")
            features[fid]["명령"] = "scripts/hook.mjs " + " ".join(args)
            if g.get("matcher"):
                features[fid]["matcher"] = g["matcher"]
for mod in hj.get("modules", []):
    rel = "hooks/" + mod.lstrip("./")
    for ev in re.findall(r"on\('([\w.]+)'", (pkg / rel).read_text()):
        feature(f"hook:claude:{ev}", "hook", f"code:{rel}#register", 앱="Claude Code", 근거=f"hooks/hooks.json modules → {rel}")
# Codex hook: codex-hooks.json의 명령. 처리 = hosts/codex/hook.mjs 안의 분기.
XH = "hosts/codex/hook.mjs"
xj = json.loads((pkg / "hooks/codex-hooks.json").read_text())
xpre = preamble(XH, "if (input.hook_event_name ===")
xcatch = catch_range(XH)
xss = branch_range(XH, "input.hook_event_name === 'SessionStart' && id && project")
xss_pre = (xss[0], branch_range(XH, "part === 'session'", xss)[0] - 1)
x_old = multiline_branch(XH, "part !== 'instructions' &&", "input.hook_event_name === 'SessionStart' && id && project")
for ev, groups in sorted(xj["hooks"].items()):
    for g in groups:
        for h in g["hooks"]:
            part = h["command"].split()[-1]
            if ev == "SessionStart":
                rng = [xpre, *([x_old] if part in ("session", "context") else []), xss_pre, branch_range(XH, f"part === '{part}'", xss), xcatch]
            else:
                rng = [xpre, branch_range(XH, f"input.hook_event_name === '{ev}'"), xcatch]
            feature(f"hook:codex:{ev}:{part}", "hook", f"code:{XH}", rng=rng, 앱="Codex", 근거=f"hooks/codex-hooks.json {ev}")
            features[f"hook:codex:{ev}:{part}"]["명령"] = f"scripts/codex-hook.mjs {part}"
# Antigravity hook: 패키지 루트 hooks.json({<묶음>: {<이벤트>: [{command}]}}). 처리 = hosts/antigravity/hook.mjs#runHook 한 함수.
# 두 이벤트가 한 함수를 지나므로, 이벤트마다 실행하지 않는 줄을 뺀 범위를 준다(독립 검수 1, 11-23).
# SessionStart(start=true, restore=false): PreInvocation 블록, 복원 때만의 recentPart, 삼항의 store.locate 쪽을 지나지 않는다.
# PreInvocation(start=false): 시작 때만의 instructionsFor·takeStart·시작 파일 처리 블록·store.start·guide를 지나지 않는다.
AH = "hosts/antigravity/hook.mjs"
aj = json.loads((pkg / "hooks.json").read_text())
arun = defs["code:hosts/antigravity/hook.mjs#runHook"]
AW = (arun["line"], arun["end_line"])
def line_of(rel, text, within):
    hits = [i + 1 for i in range(within[0] - 1, within[1]) if text in src_lines(rel)[i]]
    if len(hits) != 1:
        problems.append(f"B-4: {rel}에서 '{text}' 줄을 하나로 찾지 못함({len(hits)})")
        return None
    return hits[0]
def without(window, cuts):
    """window(줄 범위)에서 cuts(줄 범위들)를 뺀 범위 목록."""
    out, lo = [], window[0]
    for a, b in sorted(c for c in cuts if c):
        if a > lo:
            out.append((lo, a - 1))
        lo = max(lo, b + 1)
    if lo <= window[1]:
        out.append((lo, window[1]))
    return out
def one(rel, text):
    ln = line_of(rel, text, AW)
    return (ln, ln) if ln else None
AGY_CUTS = {
    "SessionStart": [branch_range(AH, "if (event === 'PreInvocation') {", AW), one(AH, "if (restore) parts.push(recentPart("),
                     one(AH, ": store.locate(where)")],
    "PreInvocation": [one(AH, "if (start) parts.push(instructionsFor("), one(AH, "const request = start ? takeStart("),
                      branch_range(AH, "if (request) {", AW), one(AH, "? store.start("), one(AH, "if (start) parts.push(guide(")],
}
# 0.9.18: 도구 전 훅(PreToolUse, matcher run_command)은 따로 된 진입(scripts/antigravity-pretool.mjs)과 결정 함수다.
AGY_OWN_ENTRY = {"PreToolUse": ("code:hosts/antigravity/pretool.mjs#decide", "scripts/antigravity-pretool.mjs")}
for group, evs in sorted(aj.items()):
    for ev, hs in sorted(evs.items()):
        if ev in AGY_OWN_ENTRY:
            did, cmd = AGY_OWN_ENTRY[ev]
            matcher = ", ".join(h.get("matcher", "") for h in hs if h.get("matcher"))
            feature(f"hook:antigravity:{ev}", "hook", did, 앱="Antigravity", 근거=f"hooks.json(루트) {group} {ev}" + (f" matcher {matcher}" if matcher else ""))
            features[f"hook:antigravity:{ev}"]["명령"] = cmd
            continue
        rng = without(AW, AGY_CUTS.get(ev, []))
        feature(f"hook:antigravity:{ev}", "hook", f"code:hosts/antigravity/hook.mjs#runHook", rng=rng, 앱="Antigravity",
                근거=f"hooks.json(루트) {group} {ev}")
        features[f"hook:antigravity:{ev}"]["명령"] = "scripts/antigravity-hook.mjs"
# OpenCode hook: 플러그인이 돌려주는 훅 객체의 키(이 패키지 manifest에는 없음 — 바깥 런타임이 싣는다).
for d in code["defs"]:
    if d["file"] == "hosts/opencode/plugin.mjs" and d["kind"] == "property_function" \
            and d["parent"] == "code:hosts/opencode/plugin.mjs#server":
        feature(f"hook:opencode:{d['qualname'][7:]}", "hook", d["id"], 앱="OpenCode", 근거="hosts/opencode/plugin.mjs (manifest 밖)")
# CLI: process.argv를 읽는 scripts/ 파일 중 manifest·다른 코드가 실행하지 않는 것(그것은 그 기능의 코드).
invoked = {r["to"] for r in code["refs"] if r["kind"] == "framework-invoked"}
for f in sorted((pkg / "scripts").glob("*.mjs")):
    rel = f.relative_to(pkg).as_posix()
    if ".test." in rel or "test-" in rel or f"code:{rel}" not in defs:
        continue
    t = f.read_text()
    if "process.argv" in t and f"code:{rel}" not in invoked:
        am = re.search(r"\.inspect\(\{ action: '(\w+)'", t)
        if am:  # 글자 그대로 action을 넘겨 read와 같은 분배 메서드를 부르는 CLI: 그 action 분기만 처리 코드로 (B-2 규칙)
            ins = defs["code:core/sessions.mjs#sessions.inspect"]
            first = next(i + 1 for i in range(ins["line"] - 1, ins["end_line"]) if "if (action ===" in src_lines("core/sessions.mjs")[i])
            rng = [(ins["line"], first - 1), branch_range("core/sessions.mjs", f"if (action === '{am.group(1)}')", (ins["line"], ins["end_line"]))]
            feature(f"cli:{f.stem}", "CLI", ins["id"], rng=rng, 근거=f"{rel} (process.argv, inspect action={am.group(1)})")
            features[f"cli:{f.stem}"]["명령"] = f"node {rel}"
        else:
            feature(f"cli:{f.stem}", "CLI", f"code:{rel}", 근거=f"{rel} (process.argv)")
# 0.9.18: 인자 없는 명령은 process.argv를 읽지 않아 위 규칙에 걸리지 않는다. 이름 표로 손으로 넣는다(구현 명세 「그래프 패치와 다른 점」 5).
MANUAL_CLI = {"antigravity-wake-register": ("code:scripts/antigravity-wake-register.mjs#registerWake",
                                            "scripts/antigravity-wake-register.mjs (인자 없음, 모델이 터미널 agy 셸에서 돌림 — 등록 지시가 보여 주는 명령)")}
for name, (did, why) in MANUAL_CLI.items():
    if did not in defs:
        problems.append(f"B-4: 손으로 넣는 CLI {name}의 처리 코드 {did}가 없음")
        continue
    feature(f"cli:{name}", "CLI", did, 근거=why)
    features[f"cli:{name}"]["명령"] = f"node scripts/{name}.mjs"
for skill in sorted((pkg / "skills").glob("*/SKILL.md")):
    rel = skill.relative_to(pkg).as_posix()
    feature(f"skill:{skill.parent.name}", "skill", f"code:{rel}", 앱="Claude Code · Codex · Antigravity", 근거=f"skills/{skill.parent.name}/SKILL.md (skill 절차 문서, Antigravity는 루트 plugin.json이 같은 skills/를 싣는다)")

for fid, f in sorted(features.items()):
    one = meaning["features"].get(fid)
    if not one:
        problems.append(f"B-6: {fid}의 한 줄이 뜻 파일에 없음")
    node("기능", fid, name=fid, 종류=f["종류"], 한줄=one, 앱=f["앱"], 명령=f.get("명령"), matcher=f.get("matcher"),
         입구=f["입구"], 근거=f["근거"], 분기줄=",".join(f"{a}-{b}" for a, b in f["rng"]) if f["rng"] else None)
    for h, role, rr in entries(f):
        if h not in nodes:
            problems.append(f"B-4: {fid}의 {role} 코드 {h}가 코드 노드에 없음")
            continue
        edge("기능→코드", fid, h, 역할=role, 줄=",".join(f"{a}-{b}" for a, b in rr) if rr else None)
for fid in meaning["features"]:
    if fid not in features:
        problems.append(f"B-6: 뜻 파일의 {fid}가 기능으로 뽑히지 않음")

# ================================================================= 제품 쪽 문서 (C)
def doc(name):
    return (docs / name).read_text()


PRODUCT = node("제품코어", "product:head-context", name="head-context", 문서="docs/product-core.md", 본문=doc("product-core.md"),
               한줄="LLM 대화(Claude Code·Codex·Antigravity)에 붙어 컨텍스트를 쌓아 주는 플러그인. 목표: LLM이 일을 잘하게. 방법: 컨텍스트를 잘 쌓는다.")
node("유저저니", "journey:head-context", name="유저 저니맵", 문서="docs/journey.md", 본문=doc("journey.md"))
ia_text = doc("ia.md")
node("IA", "ia:head-context", name="IA", 문서="docs/ia.md", 본문=ia_text)
ia_group = {}
for row in re.findall(r"^\| ([A-Z]{3}) \| ([^|]+) \| ([^|]+) \|$", ia_text, re.M):
    for sid in re.findall(r"[A-Z]{3}-\d\d", row[2]):
        ia_group[sid] = f"{row[0]} {row[1].strip()}"


def split_sections(text, pat):
    out, cur = {}, None
    for line in text.splitlines():
        m = re.match(pat, line)
        if m:
            cur = m.group(1)
            out[cur] = {"title": m.group(2).strip(), "lines": []}
        elif cur:
            out[cur]["lines"].append(line)
    return out


# ---- 출력 부분
# 기능 하나의 출력은 한 번 돌려주는 응답 하나다(상태마다 꼴이 달라도 하나). 출력설계서(screens.md)의 절 하나는
# 그 출력에 담기는 부분 하나이고(여러 기능의 출력에 같이 담기기도 한다), 절의 '내는 기능' 줄이 그 부분을 담는 기능이다.
# 빌드는 그 줄을 그대로 읽어 기능→출력 부분을 잇는다. 공통 영역 부분(CMN)은 그 부분을 공통 영역으로 둔 부분의 기능을 물려받는다.
screens = split_sections(doc("screens.md"), r"^## ([A-Z]{3}-\d\d) (.+)$")
pol_kind = {p["id"]: p["kind"] for p in meaning["policies"]}
screen_policies = {}
makers, common_of = {}, {}
for sid, s in screens.items():
    body = "\n".join(s["lines"]).strip()
    fields = dict(re.findall(r"^- (출력 종류|상태|원문|공통 영역|내는 기능|그리는 코드): (.*)$", body, re.M))
    sub = split_sections(body, r"^### (화면요소|화면 정책|개요|화면 흐름)()$")
    node("출력 부분", sid, name=s["title"], 출력종류=fields.get("출력 종류"), 상태=fields.get("상태"), 원문=fields.get("원문"),
         IA묶음=ia_group.get(sid), 문서=f"docs/screens.md#{sid}", 본문=f"## {sid} {s['title']}\n{body}",
         개요=" ".join(l for l in sub.get("개요", {"lines": []})["lines"] if l.strip()) or None)
    if sid not in ia_group:
        problems.append(f"C: 출력 부분 {sid}가 IA 묶음에 없음")
    makers[sid] = [fid for fid in dict.fromkeys(TICK.findall(fields.get("내는 기능", ""))) if ":" in fid]
    for c in re.findall(r"[A-Z]{3}-\d\d", fields.get("공통 영역", "")):
        edge("출력 부분→출력 부분", sid, c, 근거="공통 영역")
        common_of.setdefault(c, []).append(sid)
    for cid in TICK.findall(fields.get("그리는 코드", "")):
        edge("출력 부분→코드", sid, cid, 근거="그리는 코드")
    # 이 부분을 읽고 agent가 부르는 기능: 부분 안 줄의 → `기능`
    for fid in dict.fromkeys(re.findall(r"→ `([^`]+)`", "\n".join(sub.get("화면요소", {"lines": []})["lines"]))):
        edge("출력 부분→기능", sid, fid, 근거="출력설계서")
    for line in sub.get("화면 정책", {"lines": []})["lines"]:
        for pid in TICK.findall(line):
            screen_policies.setdefault(sid, []).append(pid)
            edge("출력 부분→정책", sid, pid)
for sid in screens:
    own = makers[sid]
    inherited = {} if own else {fid: s for s in common_of.get(sid, []) for fid in makers[s]}
    if not own and not inherited:
        problems.append(f"C: 출력 부분 {sid}에 내는 기능이 없음('내는 기능' 줄도, 이 부분을 공통 영역으로 둔 부분도 없음)")
    for fid in own:
        if fid not in features:
            problems.append(f"C: 출력 부분 {sid}의 내는 기능 {fid}가 기능에 없음")
            continue
        edge("기능→출력 부분", fid, sid, 근거="출력설계서 내는 기능")
    for fid in sorted(inherited):
        if fid in features:
            edge("기능→출력 부분", fid, sid, 근거="공통 영역: " + ", ".join(sorted(s for s in common_of[sid] if fid in makers[s])))

# ---- 유저 활동
acts = split_sections(doc("activities.md"), r"^## (ua\.[\w-]+) (.+)$")
for uid, a in acts.items():
    body = "\n".join(a["lines"]).strip()
    f = dict(re.findall(r"^- (무엇을 하는가|문제|목표|언제|얻는 것|다음 활동): (.*)$", body, re.M))
    node("유저 활동", uid, name=a["title"], 한줄=a["title"], 문제=f.get("문제"), 목표=f.get("목표"), 언제=f.get("언제"),
         얻는것=f.get("얻는 것"), 문서=f"docs/activities.md#{uid}", 본문=f"## {uid} {a['title']}\n{body}")
    steps = body.split("- 차례:", 1)[1].split("- 얻는 것:", 1)[0] if "- 차례:" in body else ""
    order = 0
    for sline in steps.splitlines():  # 차례 한 줄 = 한 단계. 같은 출력 부분이 여러 단계에 나오면 단계마다 잇는다
        sm = re.match(r"^\s+(\d+)\. ", sline)
        if not sm:
            continue
        at = {}
        for sid, num in re.findall(r"`([A-Z]{3}-\d\d)(?:#([\d-]+))?`", sline):
            at.setdefault(sid, []).append(num)
        for sid, nums in at.items():
            order += 1
            edge("유저 활동→출력 부분", uid, sid, 근거="기획서 차례", 단계=int(sm.group(1)), 순서=order,
                 위치=", ".join(f"{sid}#{n}" for n in nums if n) or None)
    for nxt in TICK.findall(f.get("다음 활동", "")):
        edge("유저 활동→유저 활동", uid, nxt, 근거="다음 활동")


# ---- 정책 (그래프에 직접 쓴 것)
for p in meaning["policies"]:
    line = f"{p['condition']} / {p['subject']} / {p['action']}"
    node("정책", p["id"], name=p["id"], kind=p["kind"], 한줄=line, 조건=p["condition"], 주체=p["subject"], 행위=p["action"],
         근거=p["evidence"])
    for fid in p["features"]:
        edge("정책→기능", p["id"], fid, 근거=p["evidence"])

# ================================================================= 검사
seen, clean = set(), []
for e in edges:
    if e["from"] not in nodes or e["to"] not in nodes:
        problems.append(f"D-1: 가리킨 노드 없음 {e['type']} {e['from']} → {e['to']}")
        continue
    key = (e["type"], e["from"], e["to"], e["props"].get("kind"), e["props"].get("단계"))
    if key in seen:
        continue
    seen.add(key)
    clean.append(e)
edges = clean
checks = {}
out_e = {}
for e in edges:
    out_e.setdefault(e["from"], []).append(e)
FOLLOW = {"call", "framework-invoked", "callback"}


def reach(start, rng=None):
    got, stack = set(), [(start, rng)]
    while stack:
        n, r = stack.pop()
        if n in got and r is None:
            continue
        got.add(n)
        for e in out_e.get(n, []):
            if e["type"] == "reference" and FOLLOW & set(str(e["props"].get("kind")).split(",")):
                if r and not in_ranges(e["props"], r):
                    continue
                stack.append((e["to"], None))
    return got


# 코드 파일 목록(file_sha256과 같은 판 확인용). skill 본문도 제품이 내는 글이다
src_files = list(code["files"]) + sorted(x.relative_to(pkg).as_posix() for x in (pkg / "skills").glob("*/SKILL.md"))  # skill 본문도 제품이 내는 글


reached = set()
for fid, f in features.items():
    for h, _, rr in entries(f):
        if h in nodes:
            reached |= reach(h, rr)
reached |= {"code:scripts/hook.mjs", "code:scripts/codex-hook.mjs", "code:scripts/mcp.mjs", "code:scripts/codex-mcp.mjs",
            "code:scripts/antigravity-hook.mjs", "code:scripts/antigravity-mcp.mjs", "code:scripts/antigravity-pretool.mjs"}
reached |= {f"code:scripts/{fid[4:]}.mjs" for fid in features if fid.startswith("cli:")}  # CLI 입구 파일
for entry in ("code:scripts/mcp.mjs", "code:scripts/codex-mcp.mjs", "code:scripts/antigravity-mcp.mjs", "code:hosts/opencode/mcp.mjs"):
    reached |= reach(entry)
for n, v in nodes.items():  # 파일은 안의 정의 하나라도 도달하면 도달한 것
    if v["type"] == "코드" and v["props"].get("kind") not in ("product", "component", "module") and n in reached:
        reached.add(f"code:{v['props'].get('file')}")
unreached = sorted(n for n, v in nodes.items() if v["type"] == "코드" and v["props"].get("kind") not in ("product", "component", "variable")
                   and n not in reached)
checks["B-5 어느 기능에서도 도달하지 않는 코드"] = unreached
part_to_f = {e["from"] for e in edges if e["type"] == "출력 부분→기능"}
part_by_ua = {e["to"] for e in edges if e["type"] == "유저 활동→출력 부분"}
checks["D-4 출력 부분→기능이 있는데 가리키는 유저 활동이 없는 출력 부분"] = sorted(part_to_f - part_by_ua)
common_areas = {e["to"] for e in edges if e["type"] == "출력 부분→출력 부분"}
checks["D-4 어떤 유저 활동도 가리키지 않는 출력 부분"] = sorted(s for s in screens if s not in part_by_ua and s not in common_areas)
checks["D-4 화면 정책 절과 정책 노드가 다름"] = sorted(f"{s}: {p}" for s, ps in screen_policies.items() for p in ps
                                                if pol_kind.get(p) != "표시")
checks["기능인데 출력 부분이 없음(기계용 출력·출력 없음)"] = sorted(
    f for f in features if not any(e["type"] == "기능→출력 부분" and e["from"] == f for e in edges))
ua_ids = list(acts)
checks["D-4 유저 활동의 다음 활동이 없는 활동(저니 순서와 대조용)"] = sorted(u for u in ua_ids if not any(e["type"] == "유저 활동→유저 활동" and e["from"] == u for e in edges))

graph = {"name": f"head-context {VERSION} product graph", "commit": COMMIT,
         "nodes": [nodes[k] for k in sorted(nodes)],
         "edges": sorted(edges, key=lambda e: (e["type"], e["from"], e["to"], json.dumps(e["props"], ensure_ascii=False, sort_keys=True))),
         "checks": checks, "problems": problems}
out_json.write_text(json.dumps(graph, ensure_ascii=False, indent=1, sort_keys=True))

# ================================================================= SQLite
SCHEMA = (build / "schema.txt").read_text()
if out_db.exists():
    out_db.unlink()
db = sqlite3.connect(out_db)
db.executescript("""
PRAGMA page_size = 4096;
CREATE TABLE nodes (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT, kind TEXT, file TEXT, line INTEGER, end_line INTEGER,
                    summary TEXT, doc TEXT, body TEXT, props TEXT);
CREATE TABLE edges (type TEXT NOT NULL, src TEXT NOT NULL, dst TEXT NOT NULL, kind TEXT, line INTEGER, props TEXT);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX nodes_type ON nodes(type, kind);
CREATE INDEX nodes_name ON nodes(name);
CREATE INDEX edges_src ON edges(src, type);
CREATE INDEX edges_dst ON edges(dst, type);
""")


def row(n):
    p = dict(n["props"])
    t = n["type"]
    kind = {"코드": p.get("kind"), "기능": p.get("종류"), "정책": p.get("kind"), "데이터": p.get("종류"), "DB": p.get("종류")}.get(t)
    body = p.pop("본문", None)
    rest = {k: v for k, v in p.items() if k not in ("name", "kind", "file", "line", "end_line", "한줄", "문서")}
    return (n["id"], t, p.get("name") or n["id"], kind, p.get("file") if t == "코드" else None, p.get("line") if t == "코드" else None,
            p.get("end_line") if t == "코드" else None, p.get("한줄"), p.get("문서"), body,
            json.dumps(rest, ensure_ascii=False, sort_keys=True) if rest else None)


with db:
    db.executemany("INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)", [row(nodes[k]) for k in sorted(nodes)])
    rows = []
    for e in graph["edges"]:
        p = dict(e["props"])
        kind = p.pop("kind", None)
        line = p.pop("line", None)
        rows.append((e["type"], e["from"], e["to"], kind, line, json.dumps(p, ensure_ascii=False, sort_keys=True) if p else None))
    db.executemany("INSERT INTO edges VALUES (?,?,?,?,?,?)", rows)
    db.executemany("INSERT INTO meta VALUES (?,?)", sorted({
        "name": graph["name"],
        "commit": f"head-agent-core {COMMIT} packages/context (head-context {VERSION})",
        "source": "코드 노드의 file·line은 이 커밋의 packages/context 기준. 제품 쪽 노드의 원본 글은 body에 들어 있다.",
        "schema": SCHEMA,
        "checks": json.dumps(checks, ensure_ascii=False),
        "boundaries": json.dumps([{"from": a, "to": b, "why": c} for a, b, c in BOUNDARY], ensure_ascii=False),
        # 코드 파일마다 SHA-256: source --repo가 준 폴더가 이 커밋과 같은 파일인지 본다(검수 L7, 11-15)
        "file_sha256": json.dumps({f: hashlib.sha256((pkg / f).read_bytes()).hexdigest() for f in sorted(src_files)}, ensure_ascii=False, sort_keys=True),
    }.items()))
db.execute("VACUUM")
db.close()
c = sqlite3.connect(out_db)
print("nodes", c.execute("select count(*) from nodes").fetchone()[0], "edges", c.execute("select count(*) from edges").fetchone()[0])
for t, n in c.execute("select type, count(*) from nodes group by type order by 2 desc"):
    print(" ", t, n)
print("problems", len(problems))
for p in problems:
    print("  -", p)
for k, v in checks.items():
    print(f"[{k}] {len(v)}")
