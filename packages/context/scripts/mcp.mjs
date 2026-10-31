// The Claude Code tool server; its list holds this project's Codex conversations too.
import { serveClaude } from '../hosts/claude/mcp.mjs';
import { codexPeer } from '../hosts/codex/peer.mjs';
await serveClaude({ peers: [codexPeer] });
