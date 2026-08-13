import importlib.util
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("session-history-retrieval.py")
SPEC = importlib.util.spec_from_file_location("session_history_retrieval", SCRIPT)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class SessionHistoryRetrievalTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.history = self.root / "history.md"
        self.cache = self.root / "cache"
        self.history.write_text(
            "## 2026-08-10: older work\n\nUnrelated deployment result.\n\n"
            "## 2026-08-11T01:00:00.000Z\n\nHEAD history retrieval uses canonical raw text and hashes.\n",
            encoding="utf-8",
        )

    def tearDown(self):
        self.temporary.cleanup()

    def retrieve(self, query="history retrieval", context="HEAD canonical"):
        return module.retrieve(self.history, query, context, 3, self.cache)

    def test_builds_index_and_returns_hash_verified_raw_entry(self):
        result = self.retrieve()
        self.assertTrue(result["rebuilt"])
        self.assertEqual(result["rebuild_reason"], "missing")
        self.assertIn("canonical raw text", result["entries"][0]["text"])
        raw = self.history.read_bytes()[result["entries"][0]["byte_start"]:result["entries"][0]["byte_end"]]
        self.assertEqual(module.sha256(raw), result["entries"][0]["sha256"])
        self.assertFalse(self.retrieve()["rebuilt"])

    def test_source_change_rebuilds_immediately(self):
        self.retrieve()
        with self.history.open("a", encoding="utf-8") as handle:
            handle.write("\n\n## 2026-08-11T02:00:00.000Z\n\nA newly appended zebra checkpoint.\n")
        result = self.retrieve("zebra checkpoint", "")
        self.assertTrue(result["rebuilt"])
        self.assertEqual(result["rebuild_reason"], "source_changed")
        self.assertIn("newly appended zebra", result["entries"][0]["text"])

    def test_mutable_restore_header_does_not_rebuild_unchanged_entries(self):
        original = self.history.read_text(encoding="utf-8")
        self.history.write_text("<!-- restore-ids\nupdated_at: first\n-->\n\n" + original, encoding="utf-8")
        self.retrieve()
        self.history.write_text("<!-- restore-ids\nupdated_at: later\n-->\n\n" + original, encoding="utf-8")
        result = self.retrieve()
        self.assertFalse(result["rebuilt"])
        self.assertIn("canonical raw text", result["entries"][0]["text"])

    def test_schema_mismatch_rebuilds_from_history(self):
        first = self.retrieve()
        database = sqlite3.connect(first["index"])
        database.execute("PRAGMA user_version=999")
        database.commit()
        database.close()
        result = self.retrieve()
        self.assertTrue(result["rebuilt"])
        self.assertEqual(result["rebuild_reason"], "schema_mismatch")

    def test_candidate_hash_mismatch_rebuilds_before_return(self):
        first = self.retrieve()
        database = sqlite3.connect(first["index"])
        database.execute("UPDATE entry SET content_sha256='wrong' WHERE ordinal=2")
        database.commit()
        database.close()
        result = self.retrieve()
        self.assertTrue(result["rebuilt"])
        self.assertEqual(result["rebuild_reason"], "candidate_mismatch")
        self.assertIn("canonical raw text", result["entries"][0]["text"])

    def test_symlink_history_is_rejected(self):
        linked = self.root / "linked.md"
        linked.symlink_to(self.history)
        with self.assertRaisesRegex(ValueError, "direct regular file"):
            module.retrieve(linked, "history", "", 1, self.cache)

    def test_manual_cli_accepts_query_and_context_file(self):
        progress = self.root / "progress.md"
        progress.write_text("Current cursor: canonical history retrieval.\n", encoding="utf-8")
        result = subprocess.run([
            sys.executable,
            str(SCRIPT),
            "--history", str(self.history),
            "--cache-root", str(self.cache),
            "--query", "history retrieval",
            "--context-file", str(progress),
            "--limit", "1",
        ], text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["ok"])
        self.assertEqual(len(payload["entries"]), 1)
        self.assertIn("canonical raw text", payload["entries"][0]["text"])

    def test_timestamp_tokens_and_weak_matches_do_not_pollute_results(self):
        with self.history.open("a", encoding="utf-8") as handle:
            handle.write("\n\n## 2026-08-12T01:02:03.000Z\n\nhistory only\n")
        timestamp_only = module.retrieve(self.history, "01 02 03", "", 3, self.cache)
        self.assertEqual(timestamp_only["entries"], [])
        focused = module.retrieve(self.history, "canonical raw text history hashes", "", 3, self.cache)
        self.assertEqual(len(focused["entries"]), 1)
        self.assertIn("canonical raw text", focused["entries"][0]["text"])

    def test_newest_relevant_correction_is_presented_first(self):
        with self.history.open("a", encoding="utf-8") as handle:
            handle.write("\n\n## 2026-08-12T02:00:00.000Z\n\nCanonical history retrieval correction removes automatic plugin.\n")
        result = module.retrieve(self.history, "canonical history retrieval automatic plugin", "", 3, self.cache)
        self.assertGreaterEqual(len(result["entries"]), 2)
        self.assertEqual(result["entries"][0]["timestamp"], "2026-08-12T02:00:00.000Z")


if __name__ == "__main__":
    unittest.main()
