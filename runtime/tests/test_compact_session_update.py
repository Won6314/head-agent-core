import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main, mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "claude-hooks" / "compact-session-update.py"
SPEC = importlib.util.spec_from_file_location("shared_compact_session_update", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ProjectIsolationTest(TestCase):
    def test_project_root_limits_updates_to_its_own_sessions(self):
        with TemporaryDirectory() as temporary:
            temporary_path = Path(temporary)
            roots = [temporary_path / "alpha", temporary_path / "beta"]
            for root in roots:
                session = root / ".claude" / "agents" / "head" / "sessions" / "maintenance"
                session.mkdir(parents=True)
                (session / "progress.md").write_text("## Current State\n- before\n", encoding="utf-8")

            summary = "```json\n" + json.dumps({
                "session": "maintenance",
                "progress": {"current_state": "- alpha only"},
                "history_append": "",
            }) + "\n```"
            with mock.patch.object(MODULE.sys, "stdin") as stdin, \
                    mock.patch.object(MODULE.sys, "argv", ["compact-session-update.py", "--project-root", str(roots[0]), "--session", "maintenance"]), \
                    mock.patch.object(MODULE, "BACKUP_ROOT", temporary_path / "backup"), \
                    mock.patch.object(MODULE, "FAIL_DIR", temporary_path / "failed"), \
                    mock.patch.object(MODULE, "LOG_FILE", temporary_path / "log.txt"):
                stdin.read.return_value = summary
                MODULE.main()

            alpha = (roots[0] / ".claude/agents/head/sessions/maintenance/progress.md").read_text(encoding="utf-8")
            beta = (roots[1] / ".claude/agents/head/sessions/maintenance/progress.md").read_text(encoding="utf-8")
            self.assertIn("alpha only", alpha)
            self.assertNotIn("alpha only", beta)

    def test_session_symlink_escape_is_rejected(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary) / "project"
            sessions = root / ".claude" / "agents" / "head" / "sessions"
            outside = Path(temporary) / "outside"
            sessions.mkdir(parents=True)
            outside.mkdir()
            (outside / "progress.md").write_text("## Current State\n- outside\n", encoding="utf-8")
            (sessions / "maintenance").symlink_to(outside, target_is_directory=True)

            summary = "```json\n" + json.dumps({
                "session": "maintenance",
                "progress": {"current_state": "- escaped"},
                "history_append": "",
            }) + "\n```"
            with mock.patch.object(MODULE.sys, "stdin") as stdin, \
                    mock.patch.object(MODULE.sys, "argv", ["compact-session-update.py", "--project-root", str(root), "--session", "maintenance"]), \
                    mock.patch.object(MODULE, "BACKUP_ROOT", Path(temporary) / "backup"), \
                    mock.patch.object(MODULE, "FAIL_DIR", Path(temporary) / "failed"), \
                    mock.patch.object(MODULE, "LOG_FILE", Path(temporary) / "log.txt"):
                stdin.read.return_value = summary
                MODULE.main()

            self.assertNotIn("escaped", (outside / "progress.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
