#!/usr/bin/env python3
"""Upsert Claude/OpenCode restore IDs into a session history file."""

from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path


BLOCK_RE = re.compile(r"\A<!-- restore-ids\n(?P<body>.*?)\n-->\n?", re.DOTALL)
VALID_RUNTIMES = {"claude", "opencode"}


def parse_block(text: str) -> tuple[dict[str, str], str]:
    match = BLOCK_RE.match(text)
    values = {"claude": "", "opencode": "", "last_runtime": "", "updated_at": ""}
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


def render_block(values: dict[str, str]) -> str:
    return (
        "<!-- restore-ids\n"
        f"claude: {values.get('claude', '')}\n"
        f"opencode: {values.get('opencode', '')}\n"
        f"last_runtime: {values.get('last_runtime', '')}\n"
        f"updated_at: {values.get('updated_at', '')}\n"
        "-->\n"
    )


def upsert(history_path: Path, runtime: str, restore_id: str) -> None:
    if runtime not in VALID_RUNTIMES:
        raise SystemExit(f"Invalid runtime: {runtime}")
    if not restore_id.strip():
        raise SystemExit("Restore id is required")

    text = history_path.read_text(encoding="utf-8") if history_path.exists() else ""
    values, remainder = parse_block(text)
    values[runtime] = restore_id.strip()
    values["last_runtime"] = runtime
    values["updated_at"] = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    history_path.parent.mkdir(parents=True, exist_ok=True)
    separator = "" if not remainder or remainder.startswith("\n") else "\n"
    history_path.write_text(render_block(values) + separator + remainder, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", required=True, help="Path to session history.md")
    parser.add_argument("--runtime", required=True, choices=sorted(VALID_RUNTIMES))
    parser.add_argument("--id", required=True, dest="restore_id")
    args = parser.parse_args()
    upsert(Path(args.history), args.runtime, args.restore_id)


if __name__ == "__main__":
    main()
