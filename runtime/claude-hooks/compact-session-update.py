#!/usr/bin/env python3
"""Apply one strict HEAD compaction payload to session-root canon files."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path

SAFE_SESSION_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def extract_json_block(text: str) -> str | None:
    for match in reversed(list(re.finditer(r"```json[ \t]*\n(.*?)\n[ \t]*```", text, re.DOTALL))):
        try:
            json.loads(match.group(1))
            return match.group(1)
        except json.JSONDecodeError:
            pass
    return None


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent, text=True)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def resolve_session(project_root: str, session: str) -> Path:
    root = Path(project_root).expanduser().resolve(strict=True)
    sessions = (root / ".claude" / "agents" / "head" / "sessions").resolve(strict=True)
    if not SAFE_SESSION_RE.fullmatch(session):
        raise ValueError("invalid pane session")
    candidate = (sessions / session).resolve(strict=True)
    if not candidate.is_dir() or candidate.parent != sessions:
        raise ValueError("unknown pane session")
    return candidate


def validate(data: object, session: str) -> tuple[str, str]:
    if not isinstance(data, dict) or set(data) != {"session", "progress", "history_append"}:
        raise ValueError("unexpected summary fields")
    if str(data["session"]).strip() != session:
        raise ValueError("session mismatch")
    progress, entry = data["progress"], data["history_append"]
    if not isinstance(progress, str) or not progress.strip() or "\x00" in progress or len(progress) > 24000:
        raise ValueError("invalid progress")
    if not isinstance(entry, str) or "\x00" in entry or len(entry) > 4000:
        raise ValueError("invalid history_append")
    return progress.strip() + "\n", entry.strip()


def main() -> str:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=os.environ.get("HEAD_PROJECT_ROOT", ""))
    parser.add_argument("--session", default="")
    args = parser.parse_args()
    if not args.project_root:
        raise ValueError("project root is required")
    block = extract_json_block(sys.stdin.read())
    if block is None:
        raise ValueError("no valid fenced json block")
    validated = validate(json.loads(block), args.session.strip())
    progress, entry = validated
    session_dir = resolve_session(args.project_root, args.session.strip())
    atomic_write(session_dir / "progress.md", progress)
    if entry:
        history = session_dir / "history.md"
        previous = history.read_text(encoding="utf-8") if history.exists() else ""
        atomic_write(history, previous.rstrip() + f"\n\n{entry}\n")
    return "ok"


if __name__ == "__main__":
    try:
        print(f"HEAD_COMPACT_RECEIPT {main()}")
    except Exception as error:
        print(f"compact session update failed: {error}", file=sys.stderr)
        sys.exit(1)
