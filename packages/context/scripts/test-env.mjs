// Imported first by every test file: the tests and every child they start get homes of their
// own, so nothing reads or writes the user's ~/.claude (sessions registry) or ~/.codex.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const home = fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir(), 'home-'));
process.env.HOME = home;
process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
process.env.CODEX_HOME = path.join(home, '.codex');
process.on('exit', () => { try { fs.rmSync(home, { recursive: true, force: true }); } catch { } });
