#!/usr/bin/env python3
"""Build a disposable FTS index over canonical Session history and return verified raw entries."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sqlite3
import stat
import sys
import tempfile
from pathlib import Path


SCHEMA_VERSION = 2
ENTRY_HEADER = re.compile(rb"(?m)^## (\d{4}-\d{2}-\d{2}(?:T[^\r\n ]+|:[^\r\n]*))\r?$")
TOKEN = re.compile(r"[^\W_]+", re.UNICODE)
MAX_INPUT_CHARS = 20_000
MAX_QUERY_TERMS = 32
MAX_EXCERPT_CHARS = 8_000


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def regular_history(path: Path) -> tuple[Path, bytes]:
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or path.is_symlink():
        raise ValueError("history must be a direct regular file")
    return path.resolve(), path.read_bytes()


def cache_path(history: Path, cache_root: Path | None = None) -> Path:
    if cache_root is None:
        base = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
        cache_root = base / "head-agent-core" / "session-history"
    key = sha256(os.fsencode(str(history)))
    return cache_root / f"{key}.sqlite"


def history_entries(source: bytes) -> list[dict]:
    matches = list(ENTRY_HEADER.finditer(source))
    starts = [match.start() for match in matches]
    entries: list[dict] = []
    for ordinal, start in enumerate(starts, 1):
        end = starts[ordinal] if ordinal < len(starts) else len(source)
        raw = source[start:end]
        header = matches[ordinal - 1]
        timestamp = header.group(1).decode("utf-8")
        text = raw.decode("utf-8")
        search_text = source[header.end():end].decode("utf-8")
        entries.append({
            "ordinal": ordinal,
            "byte_start": start,
            "byte_end": end,
            "timestamp": timestamp,
            "sha256": sha256(raw),
            "text": text,
            "search_text": search_text,
        })
    return entries


def entry_set_fingerprint(entries: list[dict]) -> str:
    projection = [
        [entry["ordinal"], entry["byte_start"], entry["byte_end"], entry["sha256"]]
        for entry in entries
    ]
    return sha256(json.dumps(projection, separators=(",", ":")).encode("utf-8"))


def initialize(database: sqlite3.Connection, source_path: Path, source_fingerprint: str, entries: list[dict]) -> None:
    database.executescript(
        """
        PRAGMA journal_mode=DELETE;
        CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE entry(
          id INTEGER PRIMARY KEY,
          ordinal INTEGER NOT NULL,
          byte_start INTEGER NOT NULL,
          byte_end INTEGER NOT NULL,
          timestamp TEXT NOT NULL,
          content_sha256 TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE entry_fts USING fts5(text, tokenize='unicode61');
        """
    )
    database.executemany("INSERT INTO metadata VALUES(?,?)", [
        ("schema", str(SCHEMA_VERSION)),
        ("source_path", str(source_path)),
        ("source_fingerprint", source_fingerprint),
    ])
    for entry in entries:
        database.execute(
            "INSERT INTO entry(id,ordinal,byte_start,byte_end,timestamp,content_sha256) VALUES(?,?,?,?,?,?)",
            (entry["ordinal"], entry["ordinal"], entry["byte_start"], entry["byte_end"], entry["timestamp"], entry["sha256"]),
        )
        database.execute("INSERT INTO entry_fts(rowid,text) VALUES(?,?)", (entry["ordinal"], entry["search_text"]))
    database.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
    database.commit()


def fsync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def rebuild_index(target: Path, source_path: Path, source: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}-", suffix=".tmp", dir=target.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        database = sqlite3.connect(temporary)
        try:
            entries = history_entries(source)
            initialize(database, source_path, entry_set_fingerprint(entries), entries)
        finally:
            database.close()
        descriptor = os.open(temporary, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        os.replace(temporary, target)
        fsync_directory(target.parent)
    finally:
        if temporary.exists():
            temporary.unlink()


def index_status(target: Path, source_path: Path, source_fingerprint: str) -> str:
    if not target.exists():
        return "missing"
    try:
        metadata = target.lstat()
        if not stat.S_ISREG(metadata.st_mode) or target.is_symlink():
            return "invalid_file"
        uri = f"file:{target.resolve()}?mode=ro"
        database = sqlite3.connect(uri, uri=True)
        try:
            if database.execute("PRAGMA user_version").fetchone()[0] != SCHEMA_VERSION:
                return "schema_mismatch"
            values = dict(database.execute("SELECT key,value FROM metadata"))
            if values.get("schema") != str(SCHEMA_VERSION):
                return "schema_mismatch"
            if values.get("source_path") != str(source_path):
                return "source_path_mismatch"
            if values.get("source_fingerprint") != source_fingerprint:
                return "source_changed"
            database.execute("SELECT count(*) FROM entry_fts").fetchone()
            return "current"
        finally:
            database.close()
    except (OSError, sqlite3.Error, ValueError):
        return "corrupt"


def query_terms(query: str, context: str) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()
    for token in TOKEN.findall(f"{query}\n{context}".lower()):
        if len(token) < 2 or token in seen:
            continue
        seen.add(token)
        terms.append(token)
        if len(terms) >= MAX_QUERY_TERMS:
            break
    return terms


def search_index(target: Path, terms: list[str], limit: int) -> list[dict]:
    if not terms:
        return []
    expression = " OR ".join(f'"{term.replace(chr(34), chr(34) * 2)}"*' for term in terms)
    uri = f"file:{target.resolve()}?mode=ro"
    database = sqlite3.connect(uri, uri=True)
    database.row_factory = sqlite3.Row
    try:
        rows = database.execute(
            """
            SELECT e.ordinal,e.byte_start,e.byte_end,e.timestamp,e.content_sha256,entry_fts.text,bm25(entry_fts) AS rank
            FROM entry_fts JOIN entry e ON e.id=entry_fts.rowid
            WHERE entry_fts MATCH ?
            ORDER BY rank ASC,e.ordinal DESC
            LIMIT ?
            """,
            (expression, max(20, limit * 8)),
        ).fetchall()
        candidates = [dict(row) for row in rows]
        for candidate in candidates:
            folded = candidate.pop("text").lower()
            candidate["term_matches"] = sum(1 for term in terms if term in folded)
        maximum = max((candidate["term_matches"] for candidate in candidates), default=0)
        threshold = 1 if len(terms) == 1 else max(2, math.ceil(maximum / 2))
        candidates = [candidate for candidate in candidates if candidate["term_matches"] >= threshold]
        candidates.sort(key=lambda item: -item["ordinal"])
        return candidates[:limit]
    finally:
        database.close()


def verified_results(source: bytes, candidates: list[dict]) -> list[dict]:
    results = []
    for candidate in candidates:
        start, end = candidate["byte_start"], candidate["byte_end"]
        if not (0 <= start < end <= len(source)):
            raise ValueError("candidate bounds mismatch")
        raw = source[start:end]
        if sha256(raw) != candidate["content_sha256"]:
            raise ValueError("candidate hash mismatch")
        text = raw.decode("utf-8")
        truncated = len(text) > MAX_EXCERPT_CHARS
        results.append({
            "ordinal": candidate["ordinal"],
            "timestamp": candidate["timestamp"],
            "byte_start": start,
            "byte_end": end,
            "sha256": candidate["content_sha256"],
            "rank": candidate["rank"],
            "text": text[:MAX_EXCERPT_CHARS],
            "truncated": truncated,
        })
    return results


def retrieve(history: Path, query: str, context: str, limit: int, cache_root: Path | None = None) -> dict:
    source_path, source = regular_history(history)
    target = cache_path(source_path, cache_root)
    source_sha = sha256(source)
    source_fingerprint = entry_set_fingerprint(history_entries(source))
    reason = index_status(target, source_path, source_fingerprint)
    rebuilt = reason != "current"
    if rebuilt:
        rebuild_index(target, source_path, source)
    terms = query_terms(query[:MAX_INPUT_CHARS], context[:MAX_INPUT_CHARS])
    candidates = search_index(target, terms, limit)
    current_path, current_source = regular_history(history)
    current_fingerprint = entry_set_fingerprint(history_entries(current_source))
    if current_path != source_path or current_fingerprint != source_fingerprint:
        reason = "source_changed_during_query"
        rebuilt = True
        source_path, source = current_path, current_source
        source_sha = sha256(source)
        source_fingerprint = current_fingerprint
        rebuild_index(target, source_path, source)
        candidates = search_index(target, terms, limit)
        verified_path, verified_source = regular_history(history)
        verified_fingerprint = entry_set_fingerprint(history_entries(verified_source))
        if verified_path != source_path or verified_fingerprint != source_fingerprint:
            raise ValueError("history changed repeatedly during retrieval")
        source = verified_source
        source_sha = sha256(source)
    else:
        source = current_source
        source_sha = sha256(source)
    try:
        results = verified_results(source, candidates)
    except ValueError:
        source_path, source = regular_history(history)
        source_sha = sha256(source)
        source_fingerprint = entry_set_fingerprint(history_entries(source))
        reason = "candidate_mismatch"
        rebuilt = True
        rebuild_index(target, source_path, source)
        candidates = search_index(target, terms, limit)
        results = verified_results(source, candidates)
    return {
        "ok": True,
        "history": str(source_path),
        "index": str(target),
        "source_sha256": source_sha,
        "source_fingerprint": source_fingerprint,
        "rebuilt": rebuilt,
        "rebuild_reason": reason if rebuilt else "",
        "terms": terms,
        "entries": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", required=True)
    parser.add_argument("--cache-root")
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--query", help="Manual inspection query. When omitted, read a JSON {query,context} object from stdin.")
    parser.add_argument("--context-file", help="Optional direct regular text file, such as progress.md, used only with --query.")
    args = parser.parse_args()
    try:
        if args.query is not None:
            query = args.query
            context = ""
            if args.context_file:
                context_path = Path(args.context_file)
                metadata = context_path.lstat()
                if not stat.S_ISREG(metadata.st_mode) or context_path.is_symlink():
                    raise ValueError("context file must be a direct regular file")
                context = context_path.read_text(encoding="utf-8")
        else:
            if args.context_file:
                raise ValueError("--context-file requires --query")
            payload = json.load(sys.stdin)
            if not isinstance(payload, dict):
                raise ValueError("input must be an object")
            query = payload.get("query", "")
            context = payload.get("context", "")
            if not isinstance(query, str) or not isinstance(context, str):
                raise ValueError("query and context must be strings")
        limit = max(1, min(args.limit, 5))
        result = retrieve(
            Path(args.history),
            query,
            context,
            limit,
            Path(args.cache_root).resolve() if args.cache_root else None,
        )
    except Exception as error:  # fail closed: callers omit retrieval on any index/source problem
        result = {"ok": False, "error": str(error)}
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
