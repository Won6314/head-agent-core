#!/usr/bin/env python3
"""Write a compact-summary JSON block into the active HEAD session files."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path


SESSIONS_DIR: Path | None = None
LOG_FILE = Path("/tmp/compact-session-update.log")
BACKUP_ROOT = Path("/tmp/compact-session-backup")
FAIL_DIR = Path("/tmp/compact-session-update-failed")

MANAGED_SECTIONS = {
    "current_state": "## Current State",
    "active_work": "## Active Work",
    "next_handoff": "## Next Handoff",
}
SAFE_SESSION_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def log(message: str) -> None:
    timestamp = dt.datetime.now().strftime("%H:%M:%S")
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(f"[{timestamp}] {message}\n")


def save_failure(raw: str, reason: str) -> None:
    FAIL_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = dt.datetime.now().strftime("%Y%m%dT%H%M%S")
    output = FAIL_DIR / f"{timestamp}.txt"
    output.write_text(f"# reason: {reason}\n\n{raw}", encoding="utf-8")
    log(f"FAIL: {reason} - raw saved to {output}")


def extract_json_block(text: str) -> str | None:
    """Return the last parseable fenced JSON block."""
    openings = [match.start() for match in re.finditer(r"```json", text)]
    last_matched = None
    for index in reversed(openings):
        match = re.match(r"```json[ \t]*\n(.*?)\n[ \t]*```", text[index:], re.DOTALL)
        if not match:
            continue
        block = match.group(1)
        if last_matched is None:
            last_matched = block
        try:
            json.loads(block)
            return block
        except json.JSONDecodeError:
            continue
    return last_matched


def replace_section(text: str, heading: str, new_body: str) -> str:
    """Replace one managed section and remove duplicate instances."""
    pattern = re.compile(
        rf"(^{re.escape(heading)}\n)(.*?)(?=^## |\Z)",
        re.DOTALL | re.MULTILINE,
    )
    matches = list(pattern.finditer(text))
    if not matches:
        reference = re.search(r"^## References\n", text, re.MULTILINE)
        block = f"{heading}\n{new_body.strip()}\n\n"
        if reference:
            index = reference.start()
            return text[:index] + block + text[index:]
        return text.rstrip() + "\n\n" + block

    replacement = f"{heading}\n{new_body.strip()}\n\n"
    output = []
    last = 0
    for index, match in enumerate(matches):
        output.append(text[last : match.start()])
        if index == 0:
            output.append(replacement)
        last = match.end()
    output.append(text[last:])
    return "".join(output)


def resolve_sessions_dir(project_root: str) -> Path:
    if project_root:
        root = Path(project_root).expanduser().resolve(strict=True)
        sessions = root / ".claude" / "agents" / "head" / "sessions"
    elif os.environ.get("HEAD_PROJECT_ROOT"):
        root = Path(os.environ["HEAD_PROJECT_ROOT"]).expanduser().resolve(strict=True)
        sessions = root / ".claude" / "agents" / "head" / "sessions"
    elif SESSIONS_DIR is not None:
        sessions = Path(SESSIONS_DIR)
    else:
        raise ValueError("project root is required")
    return sessions.resolve(strict=True)


def configure_runtime_paths(project_root: str) -> None:
    global LOG_FILE, BACKUP_ROOT, FAIL_DIR
    value = project_root or os.environ.get("HEAD_PROJECT_ROOT") or ""
    if not value:
        return
    try:
        root = Path(value).expanduser().resolve(strict=True)
    except OSError:
        return
    state = root / ".claude" / "agents" / "head" / "opencode" / "state" / "compact-recovery"
    LOG_FILE = state / "update.log"
    BACKUP_ROOT = state / "backups"
    FAIL_DIR = state / "failed"


def resolve_session_dir(sessions_dir: Path, session: str) -> Path | None:
    if session in {"", ".", ".."} or not SAFE_SESSION_RE.fullmatch(session):
        return None
    try:
        candidate = (sessions_dir / session).resolve(strict=True)
    except OSError:
        return None
    return candidate if candidate.is_dir() and candidate.parent == sessions_dir else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default="", help="Active project root")
    parser.add_argument(
        "--session",
        default="",
        help="Authoritative session name resolved from this conversation's pane",
    )
    args = parser.parse_args()
    configure_runtime_paths(args.project_root)

    raw = sys.stdin.read()
    if not raw.strip():
        log("empty stdin, nothing to do")
        return

    block = extract_json_block(raw)
    if block is None:
        save_failure(raw, "no fenced json block in summary")
        return
    try:
        data = json.loads(block)
    except json.JSONDecodeError as error:
        save_failure(raw, f"json parse error: {error}")
        return

    try:
        sessions_dir = resolve_sessions_dir(args.project_root)
    except (OSError, ValueError) as error:
        save_failure(raw, f"invalid project sessions root: {error}")
        return

    session = args.session.strip()
    json_session = str(data.get("session") or "").strip()
    session_dir = resolve_session_dir(sessions_dir, session)
    if session_dir is None:
        save_failure(raw, f"unknown pane session: {session!r}")
        return
    if json_session and json_session != session:
        log(f"session mismatch: pane={session!r} summary={json_session!r} - using pane")

    timestamp = dt.datetime.now().strftime("%Y%m%dT%H%M%S")
    project_key = hashlib.sha256(str(sessions_dir).encode()).hexdigest()[:12]
    backup_dir = BACKUP_ROOT / project_key / f"{session}-{timestamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)

    progress = data.get("progress") or {}
    progress_file = session_dir / "progress.md"
    if progress_file.exists() and any(
        str(progress.get(key) or "").strip() for key in MANAGED_SECTIONS
    ):
        shutil.copy2(progress_file, backup_dir / "progress.md")
        text = progress_file.read_text(encoding="utf-8")
        for key, heading in MANAGED_SECTIONS.items():
            value = str(progress.get(key) or "").strip()
            if value:
                text = replace_section(text, heading, value)
        progress_file.write_text(text, encoding="utf-8")
        log(f"progress.md updated: {progress_file}")

    history_entry = str(data.get("history_append") or "").strip()
    if history_entry:
        history_file = session_dir / "history.md"
        if history_file.exists():
            shutil.copy2(history_file, backup_dir / "history.md")
        previous = history_file.read_text(encoding="utf-8") if history_file.exists() else ""
        history_file.write_text(previous.rstrip() + "\n\n" + history_entry + "\n", encoding="utf-8")
        log(f"history.md appended: {history_file}")

    log(f"done: session={session} backup={backup_dir}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # Recovery must never break session startup.
        try:
            save_failure("", f"unexpected: {error!r}")
        except Exception:
            pass
