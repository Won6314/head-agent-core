import { serveAntigravity } from '../hosts/antigravity/mcp.mjs';
import { claudePeer } from '../hosts/claude/peer.mjs';
import { codexPeer } from '../hosts/codex/peer.mjs';
await serveAntigravity({ peers: [claudePeer, codexPeer] });
