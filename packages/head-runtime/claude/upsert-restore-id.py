#!/usr/bin/env python3
"""Upsert Claude/OpenCode restore IDs into restore-ids.json. Never rewrite history.md."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from pathlib import Path


BLOCK_RE = re.compile(r"\A<!-- restore-ids\n(?P<body>.*?)\n-->\n?", re.DOTALL)
VALID_RUNTIMES = {"claude", "opencode"}
EMPTY = {"claude": "", "opencode": "", "last_runtime": "", "updated_at": ""}


def parse_block(text: str) -> tuple[dict[str, str], str]:
    match = BLOCK_RE.match(text)
    values = dict(EMPTY)
    if not match:
        return values, text
    for line in match.group("body").splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        if key in values:
            values[key] = value.strip()
    return values, text[match.end() :]


def restore_file(path: Path) -> Path:
    return path.parent / "restore-ids.json" if path.name == "history.md" else path


def load_values(restore_path: Path, history_path: Path) -> dict[str, str]:
    if restore_path.exists() and restore_path.is_file():
        try:
            loaded = json.loads(restore_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            loaded = {}
        values = dict(EMPTY)
        for key in EMPTY:
            if isinstance(loaded.get(key), str):
                values[key] = loaded[key]
        return values
    if history_path.exists() and history_path.is_file():
        values, _ = parse_block(history_path.read_text(encoding="utf-8"))
        return values
    return dict(EMPTY)


def upsert(target_path: Path, runtime: str, restore_id: str) -> None:
    if runtime not in VALID_RUNTIMES:
        raise SystemExit(f"Invalid runtime: {runtime}")
    if not restore_id.strip():
        raise SystemExit("Restore id is required")

    restore_path = restore_file(target_path)
    history_path = target_path if target_path.name == "history.md" else target_path.parent / "history.md"
    values = load_values(restore_path, history_path)
    restore_id = restore_id.strip()
    if values[runtime] == restore_id and values["last_runtime"] == runtime:
        return
    values[runtime] = restore_id
    values["last_runtime"] = runtime
    values["updated_at"] = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    restore_path.parent.mkdir(parents=True, exist_ok=True)
    restore_path.write_text(json.dumps(values, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", help="Session history.md path; writes sibling restore-ids.json")
    parser.add_argument("--restore", help="Path to restore-ids.json")
    parser.add_argument("--runtime", required=True, choices=sorted(VALID_RUNTIMES))
    parser.add_argument("--id", required=True, dest="restore_id")
    args = parser.parse_args()
    target = args.restore or args.history
    if not target:
        raise SystemExit("Either --restore or --history is required")
    upsert(Path(target), args.runtime, args.restore_id)


if __name__ == "__main__":
    main()
