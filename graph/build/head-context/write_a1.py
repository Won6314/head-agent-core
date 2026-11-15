#!/usr/bin/env python3
"""a-runs.json → 사람이 읽는 A-1 조작 기록(출력 원문).  python3 write_a1.py <a-runs.json> <A-1-outputs.md> <판>"""
import json, sys
r = json.load(open(sys.argv[1]))
md = [f"# A-1 조작 기록 — head-context {sys.argv[3]} 실제 실행 출력 원문\n",
      "만든 스크립트: [build/run_a.py](../build/run_a.py). 임시 HOME(/tmp/hc-demo/user)·임시 프로젝트(/tmp/hc-demo/project)에 플러그인을 두 앱의 설치 자리 꼴로 복사하고, 호스트가 주는 입력(훅 JSON, 도구 서버 JSON-RPC)을 스크립트가 대신 줬다. Claude Code·Codex 앱 자체는 띄우지 않았다.\n"]
for x in r:
    md.append(f"## R{x['n']:02d} {x['실행']}\n\n- 상태: {x['상태']}\n- 종류: {x['종류']}\n- 입력: `{json.dumps(x['입력'], ensure_ascii=False)[:400]}`\n- 종료 코드: {x['종료']}\n")
    if x["stderr"]:
        md.append(f"- stderr: {x['stderr'].strip()[:300]}\n")
    o = x["출력"].rstrip()
    if len(o) > 3000 and ("HEAD Core" in o or "## list" in o):
        o = o[:1500] + f"\n…(이하 {len(x['출력']) - 1500}자 생략 — 전문은 a-runs.json R{x['n']})"
    md.append("\n```text\n" + (o or "(출력 없음)") + "\n```\n")
open(sys.argv[2], "w").write("\n".join(md))
