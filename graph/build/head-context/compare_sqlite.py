#!/usr/bin/env python3
"""두 그래프 sqlite 비교: 타입별 수, 더해진·없어진 노드, 연결(종류 reference·포함·read·write 밖은 하나씩).
    python3 compare_sqlite.py <옛 .sqlite> <새 .sqlite>"""
import sqlite3, sys, collections
a, b = (sqlite3.connect(f"file:{f}?mode=ro", uri=True) for f in sys.argv[1:3])
N = lambda c: dict(c.execute("SELECT id, type FROM nodes"))
E = lambda c: {(t, s, d) for t, s, d in c.execute("SELECT type, src, dst FROM edges")}
na, nb, ea, eb = N(a), N(b), E(a), E(b)
print(f"노드 {len(na)} → {len(nb)}, 연결 {len(ea)} → {len(eb)}")
for title, ca, cb in (("노드 타입", collections.Counter(na.values()), collections.Counter(nb.values())),
                      ("연결 종류", collections.Counter(t for t, _, _ in ea), collections.Counter(t for t, _, _ in eb))):
    print(f"\n## {title}")
    for k in sorted(set(ca) | set(cb)):
        print(f"- {k}: {ca[k]} → {cb[k]}{'  *' if ca[k] != cb[k] else ''}")
print("\n## 더해진 노드"); [print("+", k) for k in sorted(set(nb) - set(na))]
print("\n## 없어진 노드"); [print("-", k) for k in sorted(set(na) - set(nb))]
for t in sorted({t for t, _, _ in ea | eb}):
    x, y = {e for e in ea if e[0] == t}, {e for e in eb if e[0] == t}
    if x != y:
        print(f"\n## {t} 차이 (-{len(x - y)} +{len(y - x)})")
        if t not in ("reference", "포함"):
            for e in sorted(x - y): print("-", e[1:])
            for e in sorted(y - x): print("+", e[1:])
        else:
            for e in sorted(x - y)[:15]: print("-", e[1:])
            for e in sorted(y - x)[:15]: print("+", e[1:])
