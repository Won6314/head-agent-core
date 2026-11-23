import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { antigravityAlive } from './process.mjs';
import { processOf } from '../../core/platform.mjs';
import { readKey, portOf, holdsLock } from './wake-key.mjs';

// Only the process that holds the conversation may receive this signal. Another process would
// silently load the conversation and fork its execution. Never scan other pids.
export async function wake(presence, id) {
  try {
    if (!antigravityAlive(presence)) return false;
    const argv = processOf(presence.pid)?.argv;
    if (!argv) return false;
    // A pid may have belonged to ACP in the past, leaving an old log behind.
    return argv.includes('acp') ? await acpSignal(presence, id) : await terminalSignal(presence, id);
  } catch {
    // Queuing already succeeded. An unavailable/private RPC must not fail send.
    return false;
  }
}

async function acpSignal(presence, id) {
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
}

// A terminal agy needs the CSRF token its own model's command recorded, and only the
// conversation on its screen (agy holds that conversation's lock file open) is signalled.
async function terminalSignal(presence, id) {
  if (!presence.start) return false;
  const key = readKey({ pid: presence.pid, start: presence.start });
  const port = portOf(key?.address);
  if (!key || port === null || typeof key.token !== 'string' || !key.token) return false;
  if (!holdsLock(presence.pid, id) || !antigravityAlive(presence)) return false;
  const response = await fetch(
    `http://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/SendAgentMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-codeium-csrf-token': key.token },
      // The payload is delivered only by the inbox hook, not by this signal.
      body: JSON.stringify({ recipient: id, content: '다른 대화에서 메시지가 도착했습니다.', senderId: 'head-context' }),
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
    },
  );
  await response.text();
  return response.ok;
}
