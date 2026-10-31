// The Codex tool server; its list holds this project's Claude Code conversations too, and its
// send reaches them.
import { serveCodex } from '../hosts/codex/mcp.mjs';
import { claudePeer } from '../hosts/claude/peer.mjs';
await serveCodex({ peers: [claudePeer] });
