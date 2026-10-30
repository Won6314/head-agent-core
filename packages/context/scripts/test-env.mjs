// Imported first by every test file: the tests and every child they start get homes of their
// own, so nothing reads or writes the user's ~/.claude (sessions registry) or ~/.codex.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const home = fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT || os.tmpdir(), 'home-'));
// What the host that runs the tests says about itself (a Claude Code fork's entrypoint, its
// project, the plugin's own per-conversation settings) does not leak into the tests.
for (const key of Object.keys(process.env)) if (/^(CLAUDE_CODE_|CLAUDECODE$|CLAUDE_PROJECT_DIR$|CLAUDE_PLUGIN_|HEAD_CONTEXT_(?!TEST_ROOT$))/.test(key)) delete process.env[key];
process.env.HOME = home;
process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
process.env.CODEX_HOME = path.join(home, '.codex');
process.on('exit', () => { try { fs.rmSync(home, { recursive: true, force: true }); } catch { } });
