#!/usr/bin/env python3
"""head-context 0.9.5 제품 그래프 조회 — 표준 라이브러리만, 읽기 전용.

  python3 hc_graph.py overview                    처음 볼 때: 노드 타입별 수, 화면 묶음, 유저 활동, 기능, 따라 내려가는 길
  python3 hc_graph.py feature tool:save           기능 하나: 처리 코드에서 도달하는 코드 트리 + 읽고 쓰는 것·외부 연결, 화면·정책
  python3 hc_graph.py user ua.record              유저 쪽에서 코드까지: 유저 활동 → 화면요소 → 기능 → 처리 코드 → 데이터
  python3 hc_graph.py screen STA-04               화면 하나: 화면설계서 원문, 화면요소마다 내는·부르는 기능
  python3 hc_graph.py policy pol.close-needs-recap  정책: 규칙, 지키는 기능, 그 처리 코드 위치 / 표시 정책은 화면
  python3 hc_graph.py impact sessions.closeBranch  코드 하나를 바꾸면 걸리는 기능·화면·정책
  python3 hc_graph.py find 압축                     ID·이름·한 줄에서 찾기 (--type 화면요소 처럼 좁힘)
  python3 hc_graph.py show STA-04#1               노드 하나: 속성, 들어오고 나가는 연결
  python3 hc_graph.py source ua.resume            원본 읽기: 문서 노드는 원문 글, 코드 노드는 파일·줄(--repo <packages/context>면 그 줄을 보임)
  python3 hc_graph.py checks                      검사 목록(도달하지 않는 코드, 정합성 검사)
  python3 hc_graph.py schema | sql "SELECT …"     테이블 꼴 / 읽기 전용 SQL 하나

DB는 이 스크립트 옆의 head-context-0.9.5.sqlite, 다른 곳이면 --db <파일> 또는 환경 변수 HC_GRAPH_DB.
"""
import json
import os
import sqlite3
import sys

FOLLOW = ("call", "callback", "framework-invoked")


def connect(path):
    if not os.path.exists(path):
        sys.exit(f"그래프 파일이 없습니다: {path}")
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def opt(args, name, default=None):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return default


class G:
    def __init__(self, db):
        self.db = db
        self.db.row_factory = sqlite3.Row

    def node(self, nid):
        return self.db.execute("SELECT * FROM nodes WHERE id=?", (nid,)).fetchone()

    def out(self, nid, t=None):
        q = "SELECT * FROM edges WHERE src=?" + (" AND type=?" if t else "") + " ORDER BY type, dst"
        return self.db.execute(q, (nid, t) if t else (nid,)).fetchall()

    def inn(self, nid, t=None):
        q = "SELECT * FROM edges WHERE dst=?" + (" AND type=?" if t else "") + " ORDER BY type, src"
        return self.db.execute(q, (nid, t) if t else (nid,)).fetchall()

    def resolve(self, key):
        """ID, code: 없는 코드 ID, 함수 이름, 한정 이름 어느 것이든 노드 ID 하나로."""
        for k in (key, "code:" + key):
            if self.node(k):
                return k
        rows = self.db.execute("SELECT id FROM nodes WHERE type='코드' AND (name=? OR json_extract(props,'$.qualname')=?) ORDER BY id",
                               (key, key)).fetchall()
        if len(rows) == 1:
            return rows[0][0]
        if rows:
            sys.exit("이름이 겹칩니다. 다음 중 하나의 ID를 주세요:\n" + "\n".join("  " + r[0] for r in rows))
        sys.exit(f"없는 노드입니다: {key} (find로 찾아보세요)")

    def label(self, nid):
        n = self.node(nid)
        if not n:
            return nid
        if n["type"] == "코드" and n["file"]:
            return f"{nid}  [{n['file']}:{n['line']}-{n['end_line']}]"
        return f"{nid}  {n['summary'] or n['name'] or ''}".rstrip()


def p(*a):
    print(*a)


def overview(g):
    meta = dict(g.db.execute("SELECT key, value FROM meta").fetchall())
    p(f"# {meta['name']}\n{meta['commit']}\n{meta['source']}\n")
    p("## 노드 타입별 수")
    for t, n in g.db.execute("SELECT type, count(*) FROM nodes GROUP BY type ORDER BY 2 DESC"):
        p(f"- {t} {n}")
    p("\n## 화면 묶음 (화면 = 유저가 받는 출력 한 종류)")
    groups = {}
    for r in g.db.execute("SELECT id, name, json_extract(props,'$.IA묶음') FROM nodes WHERE type='화면' ORDER BY id"):
        groups.setdefault(r[2], []).append(f"{r[0]} {r[1]}")
    for k in sorted(groups):
        p(f"- {k}: " + ", ".join(groups[k]))
    p("\n## 유저 활동")
    for r in g.db.execute("SELECT id, summary FROM nodes WHERE type='유저 활동' ORDER BY id"):
        p(f"- {r[0]}  {r[1]}")
    p("\n## 기능")
    for r in g.db.execute("SELECT kind, id, summary FROM nodes WHERE type='기능' ORDER BY kind, id"):
        p(f"- [{r[0]}] {r[1]}  {r[2]}")
    p("\n## 따라 내려가는 길")
    p("유저 활동 →(유저 활동→화면요소) 화면요소 →(화면요소→기능) 기능 →(기능→코드) 처리 코드 →(reference call·callback·framework-invoked) 코드 →(read/write) 데이터, (코드→외부 연결) 외부 연결")
    p("기능 →(기능→화면요소) 결과를 보여 주는 화면요소 ←(화면→화면요소) 화면.  정책 →(정책→기능) 기능.  화면 →(화면→정책) 표시 정책.")
    p("한 단계씩 조회한다: feature, user, screen, policy, impact. 답은 source로 원본을 읽은 뒤에 한다.")


def handlers(g, fid):
    """기능의 처리·입구 코드와, 처리 코드 안에서 따라갈 분기 줄 범위."""
    out = []
    for e in g.out(fid, "기능→코드"):
        pr = json.loads(e["props"] or "{}")
        rng = [tuple(map(int, x.split("-"))) for x in pr["줄"].split(",")] if pr.get("줄") else None
        out.append((e["dst"], pr.get("역할"), rng))
    return out


def in_rng(lines, rng):
    return any(lo <= x <= hi for x in lines for lo, hi in rng)


def ref_lines(e):
    extra = json.loads(e["props"] or "{}").get("줄들")
    return [int(x) for x in extra.split(",")] if extra else [e["line"] or 0]


def show_rng(rng):
    return ", ".join(f"{a}-{b}" for a, b in rng)


def facts(g, cid, rng=None):
    lines = []
    for e in g.out(cid):
        at = [int(x) for x in (json.loads(e["props"] or "{}").get("줄들") or "").split(",") if x]
        if rng and at and not in_rng(at, rng):
            continue
        if e["type"] in ("read", "write"):
            lines.append(f"{e['type']} {e['dst']}")
        elif e["type"] == "코드→외부 연결":
            lines.append(f"외부 연결 {e['dst']}")
    return lines


def feature(g, fid):
    fid = g.resolve(fid)
    n = g.node(fid)
    if n["type"] != "기능":
        sys.exit(f"{fid}는 기능이 아닙니다({n['type']}).")
    pr = json.loads(n["props"] or "{}")
    p(f"# {fid} [{n['kind']}]\n{n['summary']}")
    for k in ("앱", "명령", "matcher", "근거"):
        if pr.get(k):
            p(f"- {k}: {pr[k]}")
    own = {}  # 다른 기능의 처리 코드
    for r in g.db.execute("SELECT src, dst FROM edges WHERE type='기능→코드' AND json_extract(props,'$.역할')='처리'"):
        own.setdefault(r[1], []).append(r[0])
    p("\n## 코드 트리 (call·callback·framework-invoked, 줄마다 아래에 읽고 쓰는 것·외부 연결)")
    seen = set()

    def walk(cid, depth, rng=None):
        mark = ""
        others = [f for f in own.get(cid, []) if f != fid]
        if depth > 0 and others:
            p("  " * depth + f"- {g.label(cid)}  → 다른 기능의 처리 코드({', '.join(others)}), 펼치지 않음")
            return
        if cid in seen:
            p("  " * depth + f"- {cid}  (위에서 펼침)")
            return
        seen.add(cid)
        p("  " * depth + f"- {g.label(cid)}{mark}" + (f"  (이 기능이 지나는 줄 {show_rng(rng)})" if rng else ""))
        nb = g.node(cid)
        stop = json.loads(nb["props"] or "{}").get("경계") if nb else None
        if stop:
            p("  " * (depth + 1) + f"⟂ 경계에서 멈춤: {stop}")
        for f in facts(g, cid, rng):
            p("  " * (depth + 1) + f"· {f}")
        kids = []
        for e in g.out(cid, "reference"):
            if not set((e["kind"] or "").split(",")) & set(FOLLOW):
                continue
            if rng and not in_rng(ref_lines(e), rng):
                continue
            kids.append(e["dst"])
        for k in dict.fromkeys(kids):
            walk(k, depth + 1)

    for cid, role, rng in sorted(handlers(g, fid), key=lambda x: x[1] != "처리"):
        p(f"\n[{role}]")
        walk(cid, 0, rng)
    shows = g.out(fid, "기능→화면요소")
    if shows:
        p("\n## 결과를 보여 주는 화면요소 (실행 기록·코드 문구 매칭으로 이은 것)")
        for e in shows:
            p(f"- {g.label(e['dst'])}  [{screen_of(g, e['dst'])}] — {json.loads(e['props'] or '{}').get('근거', '')}")
    called = [e["src"] for e in g.inn(fid, "화면요소→기능")]
    if called:
        p("\n## 이 기능을 부르게 하는 화면요소")
        for s in called:
            p(f"- {g.label(s)}")
    pols = [e["src"] for e in g.inn(fid, "정책→기능")]
    if pols:
        p("\n## 지키는 정책")
        for s in pols:
            p(f"- {g.label(s)}")


def user(g, uid):
    uid = g.resolve(uid)
    n = g.node(uid)
    p(f"# {uid} {n['summary']}\n문서: {n['doc']}\n")
    steps = sorted(g.out(uid, "유저 활동→화면요소"), key=lambda e: json.loads(e["props"] or "{}").get("순서", 0))
    for e in steps:
        p(f"- {json.loads(e['props'] or '{}').get('단계', '?')}단계 화면요소 {g.label(e['dst'])}")
        scr = g.inn(e["dst"], "화면→화면요소")[0]["src"]
        users = [x["src"] for x in g.inn(scr, "화면→화면")]
        if users:
            p(f"    (공통 영역 — 붙는 화면 {', '.join(users)})")
        for f in g.out(e["dst"], "화면요소→기능"):
            p(f"    → 부르는 기능 {g.label(f['dst'])}")
        for f in g.inn(e["dst"], "기능→화면요소"):
            p(f"    ← 내는 기능 {f['src']}")
            for cid, role, rng in handlers(g, f["src"]):
                if role == "입구":
                    p(f"        입구 코드 {g.label(cid)}")
                if role == "처리":
                    p(f"        처리 코드 {g.label(cid)}" + (f" 줄 {show_rng(rng)}" if rng else ""))
                    for x in facts(g, cid, rng):
                        p(f"          · {x}")
    nxt = [e["dst"] for e in g.out(uid, "유저 활동→유저 활동")]
    if nxt:
        p("\n다음 활동: " + ", ".join(nxt))
    p("\n(코드를 더 내려가려면 feature <기능 ID>, 원문은 source " + uid + ")")


def screen(g, sid):
    sid = g.resolve(sid)
    n = g.node(sid)
    if n["type"] == "화면요소":
        sid = g.inn(sid, "화면→화면요소")[0]["src"]
        n = g.node(sid)
    p(n["body"] or "")
    p("\n## 연결")
    for e in g.out(sid):
        if e["type"] != "화면→화면요소":
            p(f"- {e['type']} {g.label(e['dst'])}")
    for e in g.out(sid, "화면→화면요소"):
        fs_in = [x["src"] for x in g.inn(e["dst"], "기능→화면요소")]
        fs_out = [x["dst"] for x in g.out(e["dst"], "화면요소→기능")]
        uas = [x["src"] for x in g.inn(e["dst"], "유저 활동→화면요소")]
        p(f"- {e['dst']}: ← {', '.join(fs_in) or '-'} | → {', '.join(fs_out) or '-'} | 유저 활동 {', '.join(uas) or '-'}")


def policy(g, pid):
    pid = g.resolve(pid)
    n = g.node(pid)
    pr = json.loads(n["props"] or "{}")
    p(f"# {pid} [{n['kind']}]\n조건: {pr.get('조건')}\n주체: {pr.get('주체')}\n행위: {pr.get('행위')}\n근거: {pr.get('근거')}")
    for e in g.out(pid, "정책→기능"):
        p(f"\n- 지키는 기능 {g.label(e['dst'])}")
        for cid, role, rng in handlers(g, e["dst"]):
            p(f"    {role} 코드 {g.label(cid)}" + (f" 줄 {show_rng(rng)}" if rng else ""))
    for e in g.inn(pid, "화면→정책"):
        p(f"- 지키는 화면 {g.label(e['src'])}")


def reach(g, start, rng=None):
    got, stack = set(), [(start, rng)]
    while stack:
        c, r = stack.pop()
        if c in got:
            continue
        got.add(c)
        for e in g.out(c, "reference"):
            if set((e["kind"] or "").split(",")) & set(FOLLOW) and (not r or in_rng(ref_lines(e), r)):
                stack.append((e["dst"], None))
    return got  # 02b 조회 절대로 call·callback·framework-invoked만 따라간다(코드 '포함'으로 넓히지 않는다)


def screen_of(g, eid):
    r = g.inn(eid, "화면→화면요소")
    return r[0]["src"] if r else "?"


def boundaries(g):
    row = g.db.execute("SELECT value FROM meta WHERE key='boundaries'").fetchone()
    return json.loads(row[0]) if row else []


def impact(g, key):
    cid = g.resolve(key)
    p(f"# {g.label(cid)}\n이 코드에 도달하는 기능(각 기능의 처리·입구 코드에서 call·callback·framework-invoked로 따라가, 처리 코드의 줄 범위를 지킴).")
    p("화면요소 목록은 그 기능이 내는 출력 후보다 — 이 코드를 바꾸면 그중 어떤 것이 바뀌는지는 코드 가지별로 따로 봐야 한다.")
    for b in boundaries(g):
        if cid in reach(g, b["to"]):
            via = [f for (f,) in g.db.execute("SELECT id FROM nodes WHERE type='기능' ORDER BY id").fetchall()
                   if any(b["from"] in reach(g, h, rng) for h, _, rng in handlers(g, f))]
            p(f"경계에서 멈춤: 이 코드는 {b['to']} 쪽에 있고, 그것은 {b['from']}이 {b['why']}. 경계를 넘으면 이 기능들도 걸린다: {', '.join(via) or '-'}")
    for (fid,) in g.db.execute("SELECT id FROM nodes WHERE type='기능' ORDER BY id").fetchall():
        if any(cid in reach(g, h, rng) for h, role, rng in handlers(g, fid)):
            p(f"- {g.label(fid)}")
            for e in g.inn(fid, "정책→기능"):
                p(f"    정책 {e['src']}")
            els = [e["dst"] for e in g.out(fid, "기능→화면요소")]
            if els:
                p(f"    화면 {', '.join(sorted({screen_of(g, x) for x in els}))}")
                p(f"    화면요소(출력 후보) {', '.join(els)}")


def find(g, text, typ=None):
    q = "SELECT id, type, summary FROM nodes WHERE (id LIKE ? OR name LIKE ? OR summary LIKE ?)" + (" AND type=?" if typ else "") + " ORDER BY type, id LIMIT 80"
    like = f"%{text}%"
    for r in g.db.execute(q, (like, like, like, typ) if typ else (like, like, like)):
        p(f"[{r[1]}] {r[0]}  {r[2] or ''}")


def show(g, key, full=False):
    nid = g.resolve(key)
    n = g.node(nid)
    p(f"# {nid} [{n['type']}{' · ' + n['kind'] if n['kind'] else ''}]")
    for k in ("name", "summary", "doc", "file", "line", "end_line"):
        if n[k] not in (None, ""):
            p(f"- {k}: {n[k]}")
    for k, v in sorted(json.loads(n["props"] or "{}").items()):
        p(f"- {k}: {v}")
    if n["body"]:
        p("\n" + (n["body"] if full else n["body"][:600] + ("…(--full)" if len(n["body"]) > 600 else "")))
    p("\n## 나가는 연결")
    for e in g.out(nid):
        p(f"- {e['type']}{'(' + e['kind'] + ')' if e['kind'] else ''} → {e['dst']}")
    p("## 들어오는 연결")
    for e in g.inn(nid):
        p(f"- {e['src']} → {e['type']}{'(' + e['kind'] + ')' if e['kind'] else ''}")


def source(g, key, repo=None):
    nid = g.resolve(key)
    n = g.node(nid)
    if n["type"] == "코드" and n["file"]:
        p(f"{n['file']}:{n['line']}-{n['end_line']}  (head-agent-core 04e9328 packages/context)")
        if repo:
            path = os.path.join(repo, n["file"])
            if not os.path.isfile(path):
                sys.exit(f"--repo에 이 파일이 없습니다: {path}\n--repo에는 head-agent-core 04e9328의 packages/context 폴더를 줍니다.")
            lines = open(path, encoding="utf-8").read().splitlines()
            for i in range(n["line"] - 1, min(n["end_line"], len(lines))):
                p(f"{i + 1:5} {lines[i]}")
        return
    if n["body"]:
        p(f"문서: {n['doc']}\n\n{n['body']}")
        return
    parent = [e["src"] for e in g.inn(nid, "화면→화면요소")]
    if parent:
        return source(g, parent[0], repo)
    p(f"{nid}: 원문 글이 없는 노드입니다(정책·기능은 그래프에 직접 쓴 한 줄: show로 봅니다).")


def main():
    args = sys.argv[1:]
    db = opt(args, "--db", os.environ.get("HC_GRAPH_DB") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "head-context-0.9.5.sqlite"))
    repo = opt(args, "--repo")
    typ = opt(args, "--type")
    full = "--full" in args
    args = [a for a in args if a != "--full"]
    if not args or args[0] in ("-h", "--help", "help"):
        sys.exit(__doc__)
    g = G(connect(db))
    cmd, rest = args[0], args[1:]
    need = lambda: rest[0] if rest else sys.exit(f"{cmd}에는 대상이 필요합니다.")
    if cmd == "overview":
        overview(g)
    elif cmd == "feature":
        feature(g, need())
    elif cmd == "user":
        user(g, need())
    elif cmd == "screen":
        screen(g, need())
    elif cmd == "policy":
        policy(g, need())
    elif cmd == "impact":
        impact(g, need())
    elif cmd == "find":
        find(g, need(), typ)
    elif cmd == "show":
        show(g, need(), full)
    elif cmd == "source":
        source(g, need(), repo)
    elif cmd == "checks":
        for k, v in json.loads(g.db.execute("SELECT value FROM meta WHERE key='checks'").fetchone()[0]).items():
            p(f"## {k} ({len(v)})")
            for x in v:
                p(f"- {x}")
    elif cmd == "schema":
        p(g.db.execute("SELECT value FROM meta WHERE key='schema'").fetchone()[0])
    elif cmd == "sql":
        q = need()
        if not q.lstrip().lower().startswith(("select", "with")):
            sys.exit("읽기 전용: SELECT 또는 WITH 하나만 받습니다.")
        cur = g.db.execute(q)
        p(" | ".join(d[0] for d in cur.description))
        for r in cur.fetchall():
            p(" | ".join("" if v is None else str(v) for v in r))
    else:
        sys.exit(f"모르는 명령: {cmd}\n\n{__doc__}")


if __name__ == "__main__":
    main()
