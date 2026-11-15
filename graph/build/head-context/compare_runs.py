#!/usr/bin/env python3
"""두 판의 실행 출력(runs/a-runs.json) 비교: 같은 차례의 실행마다 출력이 달라졌는지, 새로 더한 실행.
시각·짧은 ID·판 번호·pid처럼 실행할 때마다 바뀌는 글은 고르게 맞춘 뒤 비교한다.
    python3 compare_runs.py <앞 판 a-runs.json> <새 a-runs.json>   # 결과는 표준 출력
"""
import difflib
import json
import re
import sys

old, new = (json.load(open(f)) for f in sys.argv[1:3])


def norm(t):
    t = re.sub(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z", "<T>", t)
    t = re.sub(r"\b\d{4}-\d{2}-\d{2} \d{2}:\d{2}", "<D>", t)
    t = re.sub(r"\b\d{2}-\d{2} \d{2}:\d{2}\b", "<MM-DD HH:MM>", t)
    t = re.sub(r"\b[0-9a-f]{5,8}\b", "<ID>", t)
    t = re.sub(r"broken-[\w\-.:]+", "broken-<T>", t)
    t = re.sub(r"\b\d+\.\d+\.\d+\b", "<V>", t)
    t = re.sub(r"pid\W*\d+", "pid <P>", t)
    return t


print(f"앞 판 {len(old)}건, 새 판 {len(new)}건")
same = 0
for a, b in zip(old, new):
    if a["실행"] != b["실행"]:
        print(f"!! R{a['n']} 차례가 다름: {a['실행']} / {b['실행']}")
        continue
    x, y = norm(a["출력"]), norm(b["출력"])
    if x == y and a["종료"] == b["종료"]:
        same += 1
        continue
    print(f"\n===== R{a['n']} {a['실행']} (상태 {b['상태']}) 종료 {a['종료']}->{b['종료']}")
    for line in difflib.unified_diff(x.splitlines(), y.splitlines(), lineterm="", n=0):
        if not line.startswith(("---", "+++")):
            print(line[:300])
print(f"\n같음 {same} / 비교 {min(len(old), len(new))}")
for b in new[len(old):]:
    print(f"\n===== 새 R{b['n']} {b['실행']} (상태 {b['상태']}) 종료 {b['종료']}\n{b['출력'][:1500]}")
