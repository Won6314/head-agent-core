import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { antigravityAlive } from './process.mjs';
import { processOf } from '../../core/platform.mjs';

// Only the owning ACP server may receive this signal. Another server would
// silently load the conversation and fork its execution. Never scan other pids.
export async function wake(presence, id) {
  try {
    if (!antigravityAlive(presence)) return false;
    // A pid may have belonged to ACP in the past, leaving an old log behind.
    if (!processOf(presence.pid)?.argv.includes('acp')) return false;
    const dir = path.join(os.homedir(), '.gemini/antigravity-cli/log');
    const logs = fs.readdirSync(dir)
      .filter((name) => new RegExp(`^acp-server-[0-9_]+-${presence.pid}\\.log$`).test(name))
      .sort()
      .reverse();
    if (!logs.length) return false;
    const log = fs.readFileSync(path.join(dir, logs[0]), 'utf8');
    const port = /Language server listening on random port at (\d+) for HTTP\r?$/m.exec(log)?.[1];
    if (!port || Number(port) < 1 || Number(port) > 65535 || !antigravityAlive(presence)) return false;
    const response = await fetch(
      `http://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/SendAgentMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The payload is delivered only by the inbox hook, not by this signal.
        body: JSON.stringify({
          recipient: id,
          content: '다른 대화에서 메시지가 도착했습니다.',
          senderId: 'head-context',
        }),
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      },
    );
    await response.text();
    return response.ok;
  } catch {
    // Queuing already succeeded. An unavailable/private RPC must not fail send.
    return false;
  }
}
