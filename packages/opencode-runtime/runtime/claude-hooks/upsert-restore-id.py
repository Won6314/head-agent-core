#!/usr/bin/env python3
# moved to packages/head-runtime/claude/upsert-restore-id.py
import os
import sys

target = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "head-runtime", "claude", "upsert-restore-id.py"))
os.execv(sys.executable, [sys.executable, target, *sys.argv[1:]])
