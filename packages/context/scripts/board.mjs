import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { board, renderBoard } from '../core/board.mjs';
import { liveConversations } from '../hosts/claude/process.mjs';
export * from '../core/board.mjs';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const project = args.find(a => !a.startsWith('--')) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const draw = () => {
      const root = path.resolve(project), data = board(root, { host: 'claude', live: known => liveConversations(root, known) });
      return args.includes('--json') ? JSON.stringify(data, null, 2) : renderBoard(data, { all: args.includes('--all') });
    };
    // --watch[=초]: 같은 판을 주기적으로 다시 그린다. 읽기만 한다.
    const watch = args.find(a => a === '--watch' || a.startsWith('--watch='));
    if (!watch) console.log(draw());
    else {
      const seconds = Math.max(1, Number(watch.split('=')[1]) || 3);
      const tick = () => {
        let body;
        try { body = draw() || '(작업 세션 없음)'; } catch (error) { body = `읽기 실패 — ${error.message}`; }
        process.stdout.write(`\x1b[2J\x1b[H${body}\n\n${new Date().toLocaleTimeString()} · ${seconds}초마다 갱신 · q로 닫기\n`);
      };
      tick();
      setInterval(tick, seconds * 1000);
      // 터미널에서 띄웠으면 q·Esc·Ctrl+C로 닫는다 (팝업은 Ctrl+C 외의 키도 받는다).
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', key => { if (['q', 'Q', '\x1b', '\x03'].includes(String(key))) process.exit(0); });
      }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
